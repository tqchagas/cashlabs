from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Category, User
from ..schemas import CategoryIn

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post("", status_code=201)
def create_category(payload: CategoryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    cat = Category(user_id=user.id, name=payload.name.strip())
    db.add(cat)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category already exists") from exc
    return {"id": cat.id, "name": cat.name}


@router.get("")
def list_categories(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    cats = db.query(Category).filter(Category.user_id == user.id).order_by(Category.name).all()
    return [{"id": c.id, "name": c.name} for c in cats]
