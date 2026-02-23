from io import BytesIO

import openpyxl
import pytest
from fastapi.testclient import TestClient


def test_csv_import_idempotent(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    content = "Data,Descricao,Valor\n2026-02-01,Padaria,-12.34\n2026-02-01,Padaria,-12.34\n"

    r1 = client.post(
        "/imports/tabular",
        headers=headers,
        files={"file": ("fatura.csv", content, "text/csv")},
    )
    assert r1.status_code == 200
    assert r1.json()["inserted"] == 1
    assert r1.json()["duplicates"] == 1

    r2 = client.post(
        "/imports/tabular",
        headers=headers,
        files={"file": ("fatura.csv", content, "text/csv")},
    )
    assert r2.status_code == 200
    assert r2.json()["inserted"] == 0
    assert r2.json()["duplicates"] == 2

    pending = client.get("/imports/pending", headers=headers)
    assert pending.status_code == 200
    dupes = [row for row in pending.json() if row.get("status") == "duplicate"]
    assert len(dupes) >= 2


def test_xlsx_import_without_password(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Data", "Descricao", "Valor"])
    ws.append(["2026-02-02", "Farmacia", -77.12])
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)

    resp = client.post(
        "/imports/tabular",
        headers=headers,
        files={"file": ("fatura.xlsx", bio.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 200
    assert resp.json()["inserted"] == 1


def test_pending_review_list_and_confirm(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    content = "Data,Descricao,Valor\ninvalid,Item sem data,-10.00\n"
    imported = client.post(
        "/imports/tabular",
        headers=headers,
        files={"file": ("bad.csv", content, "text/csv")},
    )
    assert imported.status_code == 200
    assert imported.json()["pending"] == 1

    pending = client.get("/imports/pending", headers=headers)
    assert pending.status_code == 200
    rows = pending.json()
    assert len(rows) == 1
    row_id = rows[0]["id"]

    confirm = client.patch(
        f"/imports/pending/{row_id}/confirm",
        headers=headers,
        json={
            "date": "2026-02-15",
            "description": "Item sem data",
            "amount_cents": -1000,
            "category_id": None,
            "account_id": None,
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "resolved"

    txs = client.get("/transactions?query=Item sem data", headers=headers)
    assert txs.status_code == 200
    assert len(txs.json()) == 1


def test_csv_import_with_alternative_headers(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    content = (
        "Data Lançamento,Estabelecimento,Valor (R$)\n"
        "23/02/2026,Cafeteria,45,90 DR\n"
        "24/02/2026,Salario,5000,00 CR\n"
    )
    # keep comma decimal in a quoted-safe CSV for parser
    content = (
        "Data Lançamento,Estabelecimento,Valor (R$)\n"
        "23/02/2026,Cafeteria,\"45,90 DR\"\n"
        "24/02/2026,Salario,\"5000,00 CR\"\n"
    )

    resp = client.post(
        "/imports/tabular",
        headers=headers,
        files={"file": ("alt_headers.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["inserted"] == 2

    txs = client.get("/transactions", headers=headers)
    assert txs.status_code == 200
    values = sorted([tx["amount_cents"] for tx in txs.json()])
    assert values == [-4590, 500000]


def test_csv_import_generates_installments_from_description(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    content = (
        "Data,Descricao,Valor\n"
        "2026-02-10,CP PARC SHOPPING INTER (Parcela 01 de 04),-100.00\n"
        "2026-02-10,Reservatorio De Do (10/12),-50.00\n"
    )

    resp = client.post(
        "/imports/tabular",
        headers=headers,
        files={"file": ("installments.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["inserted"] == 7  # 4 rows from first + 3 rows from second

    txs = client.get("/transactions", headers=headers)
    assert txs.status_code == 200
    descriptions = [tx["description"] for tx in txs.json()]
    assert any("CP PARC SHOPPING INTER (1/4)" in d for d in descriptions)
    assert any("CP PARC SHOPPING INTER (4/4)" in d for d in descriptions)
    assert any("Reservatorio De Do (10/12)" in d for d in descriptions)
    assert any("Reservatorio De Do (11/12)" in d for d in descriptions)
    assert any("Reservatorio De Do (12/12)" in d for d in descriptions)


def test_csv_import_auto_categorizes_expense_with_ai(
    client: TestClient, user_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}

    def fake_suggest(description: str, amount_cents: int, existing_categories: list[str] | None = None) -> str | None:
        return "Restaurante"

    monkeypatch.setattr("app.routers.imports.suggest_category_name", fake_suggest)

    content = "Data,Descricao,Valor\n2026-02-01,Almoco shopping,-42.90\n"
    resp = client.post(
        "/imports/tabular",
        headers=headers,
        files={"file": ("ai_cat.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["inserted"] == 1

    categories = client.get("/categories", headers=headers)
    assert categories.status_code == 200
    names = [c["name"] for c in categories.json()]
    assert "Restaurante" in names

    txs = client.get("/transactions?query=Almoco", headers=headers)
    assert txs.status_code == 200
    assert len(txs.json()) == 1
    assert txs.json()[0]["category_id"] is not None
