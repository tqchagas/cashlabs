from __future__ import annotations

import csv
import hashlib
import io
from datetime import date, datetime

import msoffcrypto
import openpyxl


DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d.%m.%Y"]


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
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    return int(round(float(raw) * 100))


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
        keys = {str(k).strip().lower(): k for k in row.keys()}
        date_key = keys.get("data") or keys.get("date")
        desc_key = keys.get("descricao") or keys.get("descrição") or keys.get("description")
        value_key = keys.get("valor") or keys.get("value")
        category_key = keys.get("categoria") or keys.get("category")

    if not date_key or not desc_key or not value_key:
        raise ValueError("mapping_not_found")

    return {
        "date": normalize_date(str(row.get(date_key, ""))),
        "description": normalize_description(str(row.get(desc_key, ""))),
        "amount_cents": parse_amount_to_cents(row.get(value_key, "0")),
        "category": normalize_description(str(row.get(category_key, ""))) if category_key else None,
    }
