from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Category, User
from ..schemas import CategoryIn

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post("", status_code=201)
def create_category(payload: CategoryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    name = " ".join(payload.name.strip().split())
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    existing = db.query(Category).filter(func.lower(Category.name) == name.lower()).first()
    if existing:
        return {"id": existing.id, "name": existing.name}

    cat = Category(user_id=user.id, name=name)
    db.add(cat)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category already exists") from exc
    return {"id": cat.id, "name": cat.name}


@router.get("")
def list_categories(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    cats = db.query(Category).order_by(Category.name.asc(), Category.id.asc()).all()
    seen: set[str] = set()
    deduped: list[dict] = []
    for category in cats:
        key = category.name.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append({"id": category.id, "name": category.name})
    return deduped
