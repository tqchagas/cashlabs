from __future__ import annotations

from fastapi import APIRouter, Depends
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
    total_expenses = q.filter(Transaction.amount_cents < 0).with_entities(func.coalesce(func.sum(Transaction.amount_cents), 0)).scalar() or 0
    total_income = q.filter(Transaction.amount_cents > 0).with_entities(func.coalesce(func.sum(Transaction.amount_cents), 0)).scalar() or 0
    return {
        "year": year,
        "month": month,
        "total_expenses_cents": int(total_expenses),
        "total_income_cents": int(total_income),
        "balance_cents": int(total_income) + int(total_expenses),
    }


@router.get("/by-category")
def by_category(year: int, month: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    month_prefix = f"{year:04d}-{month:02d}-%"
    rows = (
        db.query(Category.name, func.sum(Transaction.amount_cents))
        .join(Category, Category.id == Transaction.category_id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.amount_cents < 0,
            Transaction.date.like(month_prefix),
        )
        .group_by(Category.name)
        .order_by(Category.name)
        .all()
    )
    return [{"category": r[0], "total_cents": int(r[1])} for r in rows]
