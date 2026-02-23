from __future__ import annotations

import json
import os
from functools import lru_cache

from openai import OpenAI

DEFAULT_CATEGORIES = [
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


@lru_cache(maxsize=1)
def _client() -> OpenAI | None:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    return OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")


def _normalize_choice(name: str) -> str:
    text = " ".join(name.strip().split())
    return text.title() if text else "Outros"


def suggest_category_name(description: str, amount_cents: int, existing_categories: list[str] | None = None) -> str | None:
    # Apply only to expenses (negative amounts)
    if amount_cents >= 0:
        return None

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
        output = (response.output_text or "").strip()
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
    except Exception:
        return None
