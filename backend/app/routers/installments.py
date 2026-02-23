from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import InstallmentGroup, Transaction, User
from ..schemas import InstallmentGroupIn
from ..utils import add_months, build_dedupe_hash

router = APIRouter(prefix="/installments", tags=["installments"])


@router.post("/groups", status_code=201)
def create_group(payload: InstallmentGroupIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    if payload.installments <= 0:
        raise HTTPException(status_code=400, detail="installments must be > 0")

    total_cents = payload.total_cents
    if total_cents is None and payload.amount_per_installment_cents is None:
        raise HTTPException(status_code=400, detail="total_cents or amount_per_installment_cents is required")
    if total_cents is None and payload.amount_per_installment_cents is not None:
        total_cents = payload.amount_per_installment_cents * payload.installments

    assert total_cents is not None
    total_cents = abs(total_cents)
    base_each = int(total_cents / payload.installments)
    remainder = total_cents - (base_each * payload.installments)

    group = InstallmentGroup(
        user_id=user.id,
        base_description=payload.base_description.strip(),
        total_cents=total_cents,
        installments=payload.installments,
        start_date=payload.start_date,
    )
    db.add(group)
    db.flush()

    for i in range(1, payload.installments + 1):
        amount = base_each + (remainder if i == payload.installments else 0)
        tx_date = add_months(payload.start_date, (i - 1) * payload.interval_months)
        desc = f"{payload.base_description.strip()} ({i}/{payload.installments})"
        dedupe_hash = build_dedupe_hash(tx_date, desc, abs(amount), str(payload.account_id or "none"))
        db.add(
            Transaction(
                user_id=user.id,
                date=tx_date,
                description=desc,
                amount_cents=abs(amount),
                category_id=payload.category_id,
                account_id=payload.account_id,
                source="manual",
                dedupe_hash=dedupe_hash,
                installment_group_id=group.id,
                installment_number=i,
                installment_total=payload.installments,
            )
        )

    db.commit()
    db.refresh(group)
    return {"id": group.id, "base_description": group.base_description, "installments": group.installments}


@router.get("/groups/{group_id}/transactions")
def list_group_transactions(group_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id, Transaction.installment_group_id == group_id)
        .order_by(Transaction.installment_number.asc())
        .all()
    )
    return [
        {
            "id": tx.id,
            "date": tx.date,
            "description": tx.description,
            "amount_cents": tx.amount_cents,
            "installment_number": tx.installment_number,
            "installment_total": tx.installment_total,
        }
        for tx in txs
    ]


@router.delete("/groups/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    group = db.query(InstallmentGroup).filter(InstallmentGroup.id == group_id, InstallmentGroup.user_id == user.id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    db.query(Transaction).filter(Transaction.user_id == user.id, Transaction.installment_group_id == group_id).delete()
    db.delete(group)
    db.commit()
    return {"deleted": True}
