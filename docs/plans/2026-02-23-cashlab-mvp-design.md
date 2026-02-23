# CashLab MVP 0.1 Design and Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Entregar um MVP multiusuário para importar CSV/XLSX (com senha), lançar transações manuais e parceladas, categorizar gastos e consultar relatórios básicos com deduplicação idempotente.

**Architecture:** Monorepo com backend FastAPI + SQLite e frontend React (Vite). O backend expõe APIs REST com autenticação JWT (access/refresh), persistência em SQLAlchemy e regras de normalização/deduplicação no domínio de importação. O frontend oferece telas simples para autenticação, importação, transações, categorias, grupos de parcelas e relatórios mensais.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Alembic, Pydantic, passlib+bcrypt, PyJWT, openpyxl, msoffcrypto-tool, React, Vite, TypeScript, Axios.

---

## Decisões consolidadas

- Escopo de importação 0.1: CSV + XLSX criptografado por senha.
- PDF fica fora do 0.1.
- Multiusuário desde o início.
- Banco inicial: SQLite (com plano de migração futura para Postgres).
- `amount_cents` assinado: despesa negativa e receita positiva.
- Deduplicação por `user_id + account_id + dedupe_hash`.
- Parcelas entram no 0.1, com `installment_group_id`, `installment_number`, `installment_total`.

## Modelo de dados (MVP)

- `users`: autenticação e escopo de dados.
- `accounts`: conta financeira por usuário.
- `categories`: categoria por usuário (nome único por usuário).
- `imports`: rastreio de importações (`source_type`, `status`, `notes`).
- `installment_groups`: metadados de compra parcelada.
- `transactions`: lançamentos financeiros com campos de dedupe, origem e parcelas.

## Fluxos implementados

1. Auth: registrar, login, refresh token.
2. Import tabular:
- CSV: parse dinâmico (sniffer), mapeamento manual opcional.
- XLSX: descriptografar com senha e processar mesma pipeline canônica.
- Normalização: data ISO, `amount_cents`, limpeza de descrição.
- Deduplicação idempotente: conflito ignora insert e contabiliza duplicada.
- Resumo final: inseridas, duplicadas, pendentes.
3. Transação manual: CRUD básico.
4. Parcelas: criar grupo e gerar N transações mensais; editar/excluir grupo inteiro.
5. Categorias: CRUD simples.
6. Relatórios: resumo mensal, gastos por categoria e listagem filtrável.

## Plano de execução (TDD simplificado)

### Task 1: Base backend e autenticação

**Files:**
- Create: `backend/app/main.py`, `backend/app/models.py`, `backend/app/database.py`, `backend/app/auth.py`
- Create: `backend/tests/test_auth.py`

1. Escrever testes de registro/login/refresh.
2. Rodar testes e validar falha inicial.
3. Implementar mínimo para passar.
4. Reexecutar testes.

### Task 2: Categorias, contas e transações manuais

**Files:**
- Create/Modify: `backend/app/routers/*.py`, `backend/app/schemas.py`, `backend/app/services/*.py`
- Create: `backend/tests/test_transactions.py`

1. Testes para CRUD de categorias e criação/listagem de transações.
2. Implementar validações e escopo por usuário.
3. Validar filtros básicos por data, texto, categoria e conta.

### Task 3: Importação CSV/XLSX com dedupe

**Files:**
- Create: `backend/app/importers/tabular.py`
- Create: `backend/tests/test_imports.py`

1. Testes para CSV padrão, CSV com mapeamento, XLSX com senha e idempotência.
2. Implementar parsing canônico e cálculo de hash determinístico.
3. Persistir `imports` com status e notas.

### Task 4: Parcelas

**Files:**
- Create/Modify: `backend/app/services/installments.py`, `backend/app/routers/installments.py`
- Create: `backend/tests/test_installments.py`

1. Testes para geração de N parcelas e descrição `(i/N)`.
2. Testes para edição/regeração e exclusão em grupo.
3. Implementação mínima até verde.

### Task 5: Relatórios

**Files:**
- Create/Modify: `backend/app/routers/reports.py`
- Create: `backend/tests/test_reports.py`

1. Testar resumo mensal, gastos por categoria e listagem filtrada.
2. Implementar agregações SQL.

### Task 6: Frontend React (básico)

**Files:**
- Create: `frontend/src/*`

1. Telas: login, importação, transações, categorias, parcelas, relatórios.
2. Integração com API e estados de erro/sucesso.

### Task 7: Verificação final

1. Executar suíte de testes backend.
2. Build frontend.
3. Registrar instruções em `README.md`.

