from fastapi.testclient import TestClient


def test_create_category_and_manual_transaction(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    c = client.post("/categories", json={"name": "Mercado"}, headers=headers)
    assert c.status_code == 201
    category_id = c.json()["id"]

    tx = client.post(
        "/transactions",
        json={
            "date": "2026-02-10",
            "description": "Compra no mercado",
            "amount_cents": 4590,
            "category_id": category_id,
            "account_id": None,
        },
        headers=headers,
    )
    assert tx.status_code == 201

    lst = client.get("/transactions?query=mercado", headers=headers)
    assert lst.status_code == 200
    assert len(lst.json()) == 1
    assert lst.json()[0]["category_name"] == "Mercado"


def test_update_and_delete_transaction(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    created = client.post(
        "/transactions",
        json={
            "date": "2026-02-11",
            "description": "Internet",
            "amount_cents": 12990,
            "category_id": None,
            "account_id": None,
        },
        headers=headers,
    )
    assert created.status_code == 201
    tx_id = created.json()["id"]

    updated = client.patch(
        f"/transactions/{tx_id}",
        json={
            "date": "2026-02-12",
            "description": "Internet Fibra",
            "amount_cents": 13990,
            "category_id": None,
            "account_id": None,
        },
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Internet Fibra"
    assert updated.json()["amount_cents"] == 13990

    deleted = client.delete(f"/transactions/{tx_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    lst = client.get("/transactions?query=Internet Fibra", headers=headers)
    assert lst.status_code == 200
    assert len(lst.json()) == 0


def test_list_transactions_with_sorting(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    payloads = [
        {"date": "2026-02-01", "description": "B expense", "amount_cents": 2000, "category_id": None, "account_id": None},
        {"date": "2026-02-03", "description": "A expense", "amount_cents": 1000, "category_id": None, "account_id": None},
        {"date": "2026-02-02", "description": "C expense", "amount_cents": 3000, "category_id": None, "account_id": None},
    ]
    for payload in payloads:
        created = client.post("/transactions", json=payload, headers=headers)
        assert created.status_code == 201

    by_date_asc = client.get("/transactions?sort_by=date&sort_order=asc", headers=headers)
    assert by_date_asc.status_code == 200
    assert [row["date"] for row in by_date_asc.json()[:3]] == ["2026-02-01", "2026-02-02", "2026-02-03"]

    by_amount_desc = client.get("/transactions?sort_by=amount_cents&sort_order=desc", headers=headers)
    assert by_amount_desc.status_code == 200
    assert [row["amount_cents"] for row in by_amount_desc.json()[:3]] == [3000, 2000, 1000]
