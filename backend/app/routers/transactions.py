from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Transaction, User
from ..schemas import TransactionIn
from ..utils import build_dedupe_hash, normalize_description

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("", status_code=201)
def create_transaction(payload: TransactionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    account_scope = str(payload.account_id or "none")
    dedupe_hash = build_dedupe_hash(payload.date, payload.description, payload.amount_cents, account_scope)
    tx = Transaction(
        user_id=user.id,
        date=payload.date,
        description=normalize_description(payload.description),
        amount_cents=payload.amount_cents,
        category_id=payload.category_id,
        account_id=payload.account_id,
        source="manual",
        dedupe_hash=dedupe_hash,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return {"id": tx.id}


@router.get("")
def list_transactions(
    start_date: str | None = None,
    end_date: str | None = None,
    category_id: int | None = None,
    query: str | None = Query(default=None),
    account_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    q = db.query(Transaction).filter(Transaction.user_id == user.id)
    if start_date:
        q = q.filter(Transaction.date >= start_date)
    if end_date:
        q = q.filter(Transaction.date <= end_date)
    if category_id is not None:
        q = q.filter(Transaction.category_id == category_id)
    if account_id is not None:
        q = q.filter(Transaction.account_id == account_id)
    if query:
        q = q.filter(Transaction.description.ilike(f"%{query}%"))

    txs = q.order_by(Transaction.date.desc(), Transaction.id.desc()).all()
    return [
        {
            "id": tx.id,
            "date": tx.date,
            "description": tx.description,
            "amount_cents": tx.amount_cents,
            "category_id": tx.category_id,
            "account_id": tx.account_id,
            "source": tx.source,
        }
        for tx in txs
    ]
