from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class LoginIn(RegisterIn):
    pass


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class CategoryIn(BaseModel):
    name: str


class CategoryOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class AccountIn(BaseModel):
    name: str


class AccountOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class TransactionIn(BaseModel):
    date: str
    description: str
    amount_cents: int
    category_id: int | None = None
    account_id: int | None = None


class InstallmentGroupIn(BaseModel):
    start_date: str
    base_description: str
    total_cents: int | None = None
    amount_per_installment_cents: int | None = None
    installments: int
    interval_months: int = 1
    account_id: int | None = None
    category_id: int | None = None


class InstallmentGroupOut(BaseModel):
    id: int
    base_description: str
    installments: int

    model_config = ConfigDict(from_attributes=True)


class PendingReviewResolveIn(BaseModel):
    date: str
    description: str
    amount_cents: int
    category_id: int | None = None
    account_id: int | None = None
