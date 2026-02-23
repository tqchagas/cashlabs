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
