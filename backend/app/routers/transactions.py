from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Transaction, User
from ..schemas import TransactionIn
from ..utils import build_dedupe_hash, normalize_description

router = APIRouter(prefix="/transactions", tags=["transactions"])


def serialize_transaction(tx: Transaction) -> dict:
    return {
        "id": tx.id,
        "date": tx.date,
        "description": tx.description,
        "amount_cents": tx.amount_cents,
        "category_id": tx.category_id,
        "account_id": tx.account_id,
        "source": tx.source,
    }


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
    return [serialize_transaction(tx) for tx in txs]


@router.patch("/{transaction_id}")
def update_transaction(
    transaction_id: int,
    payload: TransactionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.user_id == user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    normalized_description = normalize_description(payload.description)
    new_hash = build_dedupe_hash(payload.date, normalized_description, payload.amount_cents, str(payload.account_id or "none"))
    duplicate = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.account_id == payload.account_id,
            Transaction.dedupe_hash == new_hash,
            Transaction.id != tx.id,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Transaction would duplicate an existing record")

    tx.date = payload.date
    tx.description = normalized_description
    tx.amount_cents = payload.amount_cents
    tx.category_id = payload.category_id
    tx.account_id = payload.account_id
    tx.dedupe_hash = new_hash
    db.commit()
    db.refresh(tx)
    return serialize_transaction(tx)


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    tx = db.query(Transaction).filter(Transaction.id == transaction_id, Transaction.user_id == user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    return {"deleted": True}
