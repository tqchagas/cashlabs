from fastapi.testclient import TestClient


def test_monthly_summary_and_by_category(client: TestClient, user_token: str) -> None:
    headers = {"Authorization": f"Bearer {user_token}"}

    cat = client.post("/categories", json={"name": "Restaurante"}, headers=headers).json()
    client.post(
        "/transactions",
        json={
            "date": "2026-02-10",
            "description": "Lcto",
            "amount_cents": 5000,
            "category_id": cat["id"],
            "account_id": None,
        },
        headers=headers,
    )

    summary = client.get("/reports/monthly?year=2026&month=2", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["total_expenses_cents"] == 5000
    assert summary.json()["total_income_cents"] == 0

    by_cat = client.get("/reports/by-category?year=2026&month=2", headers=headers)
    assert by_cat.status_code == 200
    assert len(by_cat.json()) == 1
