from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Account, User
from ..schemas import AccountIn

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.post("", status_code=201)
def create_account(payload: AccountIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    account = Account(user_id=user.id, name=payload.name.strip())
    db.add(account)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Account already exists") from exc
    return {"id": account.id, "name": account.name}


@router.get("")
def list_accounts(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    accounts = db.query(Account).filter(Account.user_id == user.id).order_by(Account.name).all()
    return [{"id": a.id, "name": a.name} for a in accounts]
