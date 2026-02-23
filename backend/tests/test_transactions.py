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
            "amount_cents": -4590,
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
            "amount_cents": -12990,
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
            "amount_cents": -13990,
            "category_id": None,
            "account_id": None,
        },
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Internet Fibra"
    assert updated.json()["amount_cents"] == -13990

    deleted = client.delete(f"/transactions/{tx_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    lst = client.get("/transactions?query=Internet Fibra", headers=headers)
    assert lst.status_code == 200
    assert len(lst.json()) == 0
