from fastapi.testclient import TestClient


def test_create_installment_group(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = client.post(
        "/installments/groups",
        json={
            "start_date": "2026-03-05",
            "base_description": "Notebook",
            "total_cents": 100000,
            "installments": 10,
            "interval_months": 1,
            "account_id": None,
            "category_id": None,
        },
        headers=headers,
    )

    assert resp.status_code == 201
    group = resp.json()
    assert group["installments"] == 10

    txs = client.get(f"/installments/groups/{group['id']}/transactions", headers=headers)
    assert txs.status_code == 200
    assert len(txs.json()) == 10
    assert txs.json()[0]["description"].endswith("(1/10)")
