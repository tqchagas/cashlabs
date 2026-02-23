from __future__ import annotations

import csv
import hashlib
import io
import re
import unicodedata
from datetime import date, datetime

import msoffcrypto
import openpyxl


DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d.%m.%Y"]
INSTALLMENT_PATTERNS = [
    re.compile(r"\(?\s*parcela\s*(\d{1,2})\s*de\s*(\d{1,2})\s*\)?", re.IGNORECASE),
    re.compile(r"\(\s*(\d{1,2})\s*/\s*(\d{1,2})\s*\)", re.IGNORECASE),
]


def normalize_date(value: str) -> str:
    raw = str(value).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return datetime.fromisoformat(raw).date().isoformat()


def normalize_description(value: str) -> str:
    return " ".join(str(value).strip().split())


def parse_amount_to_cents(value: str | float | int) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value * 100))

    raw = str(value).strip().replace("R$", "").replace(" ", "")
    lower = raw.lower()
    negative = any(token in lower for token in ["debito", "débito", "debit", "dr"])
    positive = any(token in lower for token in ["credito", "crédito", "credit", "cr"])
    raw = re.sub(r"[A-Za-zÀ-ÿ]", "", raw)
    raw = raw.strip()
    if raw.endswith("-"):
        negative = True
        raw = raw[:-1]
    if raw.startswith("+"):
        positive = True
        raw = raw[1:]
    if raw.startswith("-"):
        negative = True
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    cents = int(round(float(raw) * 100))
    if negative and cents > 0:
        return -cents
    if positive and cents < 0:
        return -cents
    return cents


def normalize_header(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text).strip().lower()
    return " ".join(text.split())


def find_header_key(headers: dict[str, str], candidates: list[str]) -> str | None:
    normalized_candidates = {normalize_header(item) for item in candidates}
    for norm, original in headers.items():
        if norm in normalized_candidates:
            return original

    for norm, original in headers.items():
        if any(candidate in norm for candidate in normalized_candidates):
            return original
    return None


def add_months(iso_date: str, months: int) -> str:
    d = datetime.strptime(iso_date, "%Y-%m-%d").date()
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, [31, 29 if year % 4 == 0 and year % 100 != 0 or year % 400 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date(year, month, day).isoformat()


def build_dedupe_hash(tx_date: str, description: str, amount_cents: int, account_scope: str) -> str:
    key = f"{tx_date}|{normalize_description(description).lower()}|{amount_cents}|{account_scope}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig", errors="ignore")
    sample = text[:4096]
    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t") if sample else csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    return [dict(row) for row in reader]


def parse_xlsx(content: bytes, password: str | None = None) -> list[dict]:
    source = io.BytesIO(content)
    if password:
        office_file = msoffcrypto.OfficeFile(source)
        office_file.load_key(password=password)
        decrypted = io.BytesIO()
        office_file.decrypt(decrypted)
        source = io.BytesIO(decrypted.getvalue())

    wb = openpyxl.load_workbook(source, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    parsed: list[dict] = []
    for row in rows[1:]:
        parsed.append({headers[i]: row[i] for i in range(len(headers))})
    return parsed


def map_row(row: dict, mapping: dict | None = None) -> dict:
    if mapping:
        date_key = mapping.get("date")
        desc_key = mapping.get("description")
        value_key = mapping.get("value")
        category_key = mapping.get("category")
    else:
        keys = {normalize_header(str(k)): k for k in row.keys()}
        date_key = find_header_key(
            keys,
            [
                "data",
                "date",
                "data compra",
                "data lancamento",
                "data transacao",
                "transaction date",
                "posting date",
                "competencia",
            ],
        )
        desc_key = find_header_key(
            keys,
            [
                "descricao",
                "description",
                "historico",
                "lancamento",
                "estabelecimento",
                "merchant",
                "detalhes",
                "texto",
            ],
        )
        value_key = find_header_key(
            keys,
            [
                "valor",
                "value",
                "amount",
                "valor rs",
                "total",
                "preco",
                "price",
                "valor final",
                "valor transacao",
            ],
        )
        category_key = find_header_key(
            keys,
            [
                "categoria",
                "category",
                "tipo",
                "segmento",
            ],
        )

    if not date_key or not desc_key or not value_key:
        raise ValueError("mapping_not_found")

    return {
        "date": normalize_date(str(row.get(date_key, ""))),
        "description": normalize_description(str(row.get(desc_key, ""))),
        "amount_cents": parse_amount_to_cents(row.get(value_key, "0")),
        "category": normalize_description(str(row.get(category_key, ""))) if category_key else None,
    }


def extract_installment_info(description: str) -> dict | None:
    text = normalize_description(description)
    for pattern in INSTALLMENT_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        current = int(match.group(1))
        total = int(match.group(2))
        if total <= 1 or current < 1 or current > total:
            return None
        base = normalize_description(pattern.sub("", text)).strip(" -/")
        return {
            "base_description": base or text,
            "current": current,
            "total": total,
        }
    return None
