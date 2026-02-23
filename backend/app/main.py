from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import accounts, auth, categories, imports, installments, reports, transactions


def create_app() -> FastAPI:
    app = FastAPI(title="CashLab API", version="0.1.0")
    Base.metadata.create_all(bind=engine)
    raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    allow_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins or ["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
