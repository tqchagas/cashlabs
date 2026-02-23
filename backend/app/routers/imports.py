from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Category, ImportJob, ImportReviewItem, Transaction, User
from ..schemas import PendingReviewResolveIn
from ..utils import build_dedupe_hash, map_row, parse_csv, parse_xlsx

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/tabular")
async def import_tabular(
    file: UploadFile = File(...),
    password: str | None = Form(default=None),
    mapping_json: str | None = Form(default=None),
    account_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    raw = await file.read()
    filename = file.filename or "unknown"
    source_type = "xlsx" if filename.lower().endswith(".xlsx") else "csv"

    import_job = ImportJob(user_id=user.id, source_type=source_type, filename=filename, status="ok", notes="")
    db.add(import_job)
    db.flush()

    try:
        if source_type == "xlsx":
            rows = parse_xlsx(raw, password=password)
        else:
            rows = parse_csv(raw)
    except Exception as exc:  # noqa: BLE001
        import_job.status = "needs_review"
        import_job.notes = f"parse_error: {exc}"
        db.commit()
        raise HTTPException(status_code=400, detail="Could not parse file") from exc

    mapping = json.loads(mapping_json) if mapping_json else None
    inserted = 0
    duplicates = 0
    pending = 0
    notes: list[str] = []

    for idx, row in enumerate(rows, start=1):
        try:
            normalized = map_row(row, mapping)
            cat_name = normalized.get("category")
            category_id = None
            if cat_name:
                category = (
                    db.query(Category)
                    .filter(Category.user_id == user.id, Category.name.ilike(cat_name))
                    .first()
                )
                if category:
                    category_id = category.id

            dedupe_hash = build_dedupe_hash(
                normalized["date"], normalized["description"], normalized["amount_cents"], str(account_id or "none")
            )
            existing = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == user.id,
                    Transaction.account_id == account_id,
                    Transaction.dedupe_hash == dedupe_hash,
                )
                .first()
            )
            if existing:
                duplicates += 1
                continue

            tx = Transaction(
                user_id=user.id,
                date=normalized["date"],
                description=normalized["description"],
                amount_cents=normalized["amount_cents"],
                category_id=category_id,
                account_id=account_id,
                source=source_type,
                import_id=import_job.id,
                dedupe_hash=dedupe_hash,
            )
            db.add(tx)
            db.flush()
            inserted += 1
        except Exception as exc:  # noqa: BLE001
            pending += 1
            error_message = str(exc)
            notes.append(f"row {idx}: {error_message}")
            db.add(
                ImportReviewItem(
                    import_id=import_job.id,
                    user_id=user.id,
                    row_number=idx,
                    raw_data=json.dumps(row, ensure_ascii=False, default=str),
                    error=error_message,
                    status="pending",
                    resolved_account_id=account_id,
                )
            )

    if pending > 0 and inserted == 0:
        import_job.status = "needs_review"
    elif pending > 0:
        import_job.status = "partial"
    else:
        import_job.status = "ok"
    import_job.notes = "\n".join(notes)
    db.commit()
    return {"import_id": import_job.id, "inserted": inserted, "duplicates": duplicates, "pending": pending}


@router.get("/pending")
def list_pending_import_rows(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = (
        db.query(ImportReviewItem)
        .filter(ImportReviewItem.user_id == user.id, ImportReviewItem.status == "pending")
        .order_by(ImportReviewItem.id.asc())
        .all()
    )
    return [
        {
            "id": row.id,
            "import_id": row.import_id,
            "row_number": row.row_number,
            "raw_data": row.raw_data,
            "error": row.error,
            "suggested_account_id": row.resolved_account_id,
        }
        for row in rows
    ]


@router.patch("/pending/{review_item_id}/confirm")
def confirm_pending_row(
    review_item_id: int,
    payload: PendingReviewResolveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    item = (
        db.query(ImportReviewItem)
        .filter(
            ImportReviewItem.id == review_item_id,
            ImportReviewItem.user_id == user.id,
            ImportReviewItem.status == "pending",
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Pending review item not found")

    dedupe_hash = build_dedupe_hash(
        payload.date, payload.description, payload.amount_cents, str(payload.account_id or item.resolved_account_id or "none")
    )
    existing = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.account_id == (payload.account_id or item.resolved_account_id),
            Transaction.dedupe_hash == dedupe_hash,
        )
        .first()
    )
    if existing:
        item.status = "duplicate"
        db.commit()
        return {"status": "duplicate", "transaction_id": existing.id}

    tx = Transaction(
        user_id=user.id,
        date=payload.date,
        description=payload.description,
        amount_cents=payload.amount_cents,
        category_id=payload.category_id,
        account_id=(payload.account_id or item.resolved_account_id),
        source="import_review",
        import_id=item.import_id,
        dedupe_hash=dedupe_hash,
    )
    db.add(tx)
    item.status = "resolved"
    item.resolved_date = payload.date
    item.resolved_description = payload.description
    item.resolved_amount_cents = payload.amount_cents
    item.resolved_category_id = payload.category_id
    item.resolved_account_id = payload.account_id or item.resolved_account_id
    db.flush()

    pending_count = (
        db.query(ImportReviewItem)
        .filter(ImportReviewItem.import_id == item.import_id, ImportReviewItem.status == "pending")
        .count()
    )
    import_job = db.get(ImportJob, item.import_id)
    if import_job and pending_count == 0 and import_job.status in {"needs_review", "partial"}:
        import_job.status = "ok"
    db.commit()
    return {"status": "resolved", "transaction_id": tx.id}
