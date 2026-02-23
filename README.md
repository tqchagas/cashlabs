# CashLab MVP 0.1

MVP multiusuario com FastAPI + React para:
- autenticação (JWT)
- importação tabular (`.csv` e `.xlsx`, com senha opcional)
- revisão de linhas pendentes de importação (`needs_review`)
- transações manuais
- parcelas (geração em lote)
- categorias
- relatórios mensais básicos

## Estrutura

- `backend/`: API FastAPI + SQLite
- `frontend/`: React (Vite)
- `docs/plans/2026-02-23-cashlab-mvp-design.md`: decisões e plano

## Backend

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

API em `http://localhost:8000`.

Rodar testes:

```bash
cd backend
. .venv/bin/activate
pytest -q
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend em `http://localhost:5173`.

## Deploy (GitHub + Vercel + Neon)

Use dois projetos Vercel apontando para o mesmo repositório:

1. `cashlabs-front`
- Root Directory: `frontend`
- Framework: Vite (auto detect)
- Env: `VITE_API_BASE_URL=https://<url-do-backend>`

2. `cashlabs-back`
- Root Directory: `backend`
- Runtime: Python (usando `backend/vercel.json`)
- Env:
  - `DATABASE_URL` (Neon)
  - `SECRET_KEY`

Arquivos de referência:
- `frontend/.env.example`
- `backend/.env.example`
- `backend/vercel.json`

## Notas importantes

- Valores monetários são armazenados como `amount_cents` assinado (`INTEGER`).
- Dedupe usa hash determinístico e escopo de usuário + conta.
- Importação é idempotente para mesmo conteúdo já importado.
- Para `.xlsx` protegido, informe senha no campo de importação.
- Endpoints de revisão:
  - `GET /imports/pending`
  - `PATCH /imports/pending/{id}/confirm`
