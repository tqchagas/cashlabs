from __future__ import annotations

from fastapi import FastAPI

from .database import Base, engine
from .routers import accounts, auth, categories, imports, installments, reports, transactions


def create_app() -> FastAPI:
    app = FastAPI(title="CashLab API", version="0.1.0")
    Base.metadata.create_all(bind=engine)

    app.include_router(auth.router)
    app.include_router(accounts.router)
    app.include_router(categories.router)
    app.include_router(transactions.router)
    app.include_router(imports.router)
    app.include_router(installments.router)
    app.include_router(reports.router)

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
