from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Category, Transaction, User

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/monthly")
def monthly(year: int, month: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    month_prefix = f"{year:04d}-{month:02d}-%"
    q = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.date.like(month_prefix),
    )
    total_expenses = q.with_entities(func.coalesce(func.sum(Transaction.amount_cents), 0)).scalar() or 0
    total_income = 0
    return {
        "year": year,
        "month": month,
        "total_expenses_cents": int(total_expenses),
        "total_income_cents": int(total_income),
        "balance_cents": int(total_income) - int(total_expenses),
    }


@router.get("/by-category")
def by_category(year: int, month: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    month_prefix = f"{year:04d}-{month:02d}-%"
    rows = (
        db.query(Category.name, func.sum(Transaction.amount_cents))
        .join(Category, Category.id == Transaction.category_id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.amount_cents > 0,
            Transaction.date.like(month_prefix),
        )
        .group_by(Category.name)
        .order_by(Category.name)
        .all()
    )
    return [{"category": r[0], "total_cents": int(r[1])} for r in rows]


@router.get("/by-category-total")
def by_category_total(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = (
        db.query(Category.name, func.sum(Transaction.amount_cents))
        .join(Category, Category.id == Transaction.category_id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.amount_cents > 0,
        )
        .group_by(Category.name)
        .order_by(Category.name)
        .all()
    )
    return [{"category": row[0], "total_cents": int(row[1])} for row in rows]


@router.get("/installments-summary")
def installments_summary(
    scope: str = Query(default="this_month"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    today = date.today()
    current_month_start = date(today.year, today.month, 1)
    if today.month == 12:
        next_month_start = date(today.year + 1, 1, 1)
    else:
        next_month_start = date(today.year, today.month + 1, 1)
    if next_month_start.month == 12:
        after_next_month_start = date(next_month_start.year + 1, 1, 1)
    else:
        after_next_month_start = date(next_month_start.year, next_month_start.month + 1, 1)

    q = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.amount_cents > 0,
        Transaction.installment_group_id.is_not(None),
    )

    if scope == "this_month":
        q = q.filter(Transaction.date >= current_month_start.isoformat(), Transaction.date < next_month_start.isoformat())
    elif scope == "next_month":
        q = q.filter(Transaction.date >= next_month_start.isoformat(), Transaction.date < after_next_month_start.isoformat())
    elif scope == "total":
        q = q.filter(Transaction.date >= current_month_start.isoformat())
    else:
        return {"scope": scope, "total_cents": 0}

    total = q.with_entities(func.coalesce(func.sum(Transaction.amount_cents), 0)).scalar() or 0
    return {"scope": scope, "total_cents": int(total)}
