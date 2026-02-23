from __future__ import annotations

import json
import os
from functools import lru_cache

from openai import OpenAI

DEFAULT_CATEGORIES = [
    "Supermercado",
    "Alimentacao",
    "Bar",
    "Mercado",
    "Restaurante",
    "Transporte",
    "Casa",
    "Saude",
    "Assinaturas",
    "Lazer",
    "Compras",
    "Educacao",
    "Outros",
]

NON_SEMANTIC_STATEMENT_LABELS = {
    "parcela sem juros",
    "compra internacional",
    "compra a vista",
    "compra a vista parcelada",
    "compra parcelada",
    "credito rotativo",
    "pagamento em atraso",
}


@lru_cache(maxsize=1)
def _client() -> OpenAI | None:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    return OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")


def _normalize_choice(name: str) -> str:
    text = " ".join(name.strip().split())
    return text.title() if text else "Outros"


def _normalize_key(text: str) -> str:
    normalized = text.strip().lower()
    replacements = {
        "á": "a",
        "à": "a",
        "â": "a",
        "ã": "a",
        "é": "e",
        "ê": "e",
        "í": "i",
        "ó": "o",
        "ô": "o",
        "õ": "o",
        "ú": "u",
        "ç": "c",
    }
    for src, dst in replacements.items():
        normalized = normalized.replace(src, dst)
    return " ".join(normalized.split())


def is_non_semantic_category_name(name: str | None) -> bool:
    if not name:
        return False
    normalized = _normalize_key(name)
    return normalized in NON_SEMANTIC_STATEMENT_LABELS


def _extract_category_from_output(raw_output: str, allowed: list[str]) -> str | None:
    output = (raw_output or "").strip()
    if not output:
        return None

    parsed = None
    try:
        parsed = json.loads(output)
    except Exception:
        start = output.find("{")
        end = output.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(output[start : end + 1])

    if not parsed or "category" not in parsed:
        return None

    suggested = _normalize_choice(str(parsed["category"]))
    if suggested in allowed:
        return suggested

    for cat in allowed:
        if cat.lower() == suggested.lower():
            return cat
    return "Outros"


def suggest_category_name(description: str, amount_cents: int, existing_categories: list[str] | None = None) -> str | None:
    client = _client()
    if not client:
        return None

    existing = [c for c in (existing_categories or []) if c]
    allowed = list(dict.fromkeys(existing + DEFAULT_CATEGORIES))[:30]
    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

    prompt = (
        "Classifique a transacao em UMA categoria. "
        "Retorne apenas JSON valido no formato {\"category\":\"Nome\"}. "
        f"Categorias permitidas: {', '.join(allowed)}. "
        f"Descricao: {description}. Valor em centavos: {amount_cents}."
    )

    try:
        response = client.responses.create(model=model, input=prompt)
        output = getattr(response, "output_text", "") or ""
        suggested = _extract_category_from_output(output, allowed)
        if suggested:
            return suggested
    except Exception:
        pass

    # Fallback path for OpenAI-compatible providers that do not support responses API consistently.
    try:
        chat = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            temperature=0,
        )
        content = ""
        if chat.choices and chat.choices[0].message:
            content = chat.choices[0].message.content or ""
        suggested = _extract_category_from_output(content, allowed)
        if suggested:
            return suggested
    except Exception:
        pass

    return None
