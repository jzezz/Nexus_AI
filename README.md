# Nexus AI

Nexus AI is a full-stack document Q&A MVP. Upload PDF, DOCX, or CSV files, inspect the extracted content, and ask questions with source citations. The app includes account authentication, per-user data isolation, document insights, and saved conversation history.

## Frontend screenshots

The screenshots below were captured from the production frontend build.

### Overview

![Nexus AI overview](docs/screenshots/nexus-ai-overview.png)

### Document workspace, inspector, and chat panels

![Nexus AI document workspace](docs/screenshots/nexus-ai-workspace.png)

## Features

- Register and sign in with password hashing and bearer-token authentication.
- Upload PDF, DOCX, and CSV files with a configurable size limit.
- Extract text, create searchable chunks, and inspect document summaries, topics, and suggested questions.
- Search across all uploaded files or limit retrieval to selected documents.
- View evidence citations, retrieval scores, and confidence for answers.
- Save and revisit conversations; delete documents and conversations.
- Keep documents and conversations isolated between accounts.
- Check service health and database readiness through dedicated endpoints.
- Develop locally with SQLite or run against PostgreSQL with Alembic migrations.

## Test and build analytics

Latest local verification: **November 3, 2026**.

| Check | Result |
| --- | ---: |
| Backend unit and API integration tests | **13 / 13 passed** (1.31 s) |
| API flow tests | **5 passed** |
| Ingestion and retrieval tests | **5 passed** |
| PDF, DOCX, and CSV parser tests | **3 passed** |
| Frontend TypeScript check | **Passed** |
| Next.js production build | **Passed** |
| Frontend `npm audit` | **0 vulnerabilities** across 60 dependencies |
| SQLite Alembic migration check | **Passed** |
| Browser workflow smoke check | **Passed** — register, upload CSV, inspect insights, retrieve a cited answer, and view saved history |

The browser smoke check connected the Next.js frontend to the local FastAPI backend. The response used the retrieval route and displayed its citation, score, and confidence; the conversation also appeared in history.

### Run the checks

From the repository root, run the backend suite:

```powershell
Push-Location backend
.venv\Scripts\python.exe -m unittest discover -s tests -v
Pop-Location
```

Run the frontend checks:

```powershell
Push-Location frontend
npm ci
npm run typecheck
npm run build
npm audit
Pop-Location
```

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Backend:** Python, FastAPI, SQLAlchemy, Pydantic
- **Database:** SQLite for local development; PostgreSQL supported through Alembic migrations
- **Authentication:** JWT bearer tokens and hashed passwords
- **Document processing:** PDF, DOCX, and CSV text extraction
- **CI:** GitHub Actions for backend tests, frontend type checking/build, and dependency audit

## Run locally

Requirements: Python 3.12+ and Node.js 22+.

### 1. Start the API

In PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

The example configuration uses SQLite and initializes its tables on startup. The API runs at `http://localhost:8000`; interactive documentation is at `http://localhost:8000/docs`.

### 2. Start the frontend

In a second terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The frontend reads `NEXT_PUBLIC_API_BASE_URL` from `frontend/.env.local`; its default points to `http://localhost:8000/api/v1`.

## Configuration

Copy the example environment files and adjust the values for your setup:

- `backend/.env.example` — API, database, CORS, token, and upload settings.
- `frontend/.env.example` — API base URL used by the browser.

For PostgreSQL, set `DATABASE_URL`, set `AUTO_INIT_DB=false`, then run migrations before starting the API:

```powershell
cd backend
.venv\Scripts\alembic.exe upgrade head
.venv\Scripts\uvicorn.exe app.main:app --reload
```

Example database settings:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/nexus_ai
AUTO_INIT_DB=false
```

Keep real secrets in local `.env` files or your deployment provider's secret store. The repository ignores local environment files, virtual environments, dependency folders, Python bytecode, and SQLite databases. Commit the `.env.example` templates, never secret values.

## API routes

Application routes use the `/api/v1` prefix.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Sign in and receive a token |
| `POST` | `/upload` | Upload and process a document |
| `GET` | `/documents` | List the current user's documents |
| `GET` | `/documents/{document_id}` | Inspect a document and its chunks |
| `DELETE` | `/documents/{document_id}` | Delete a document |
| `POST` | `/chat` | Retrieve evidence and answer a question |
| `GET` | `/conversations` | List saved conversations |
| `DELETE` | `/conversations/{conversation_id}` | Delete a conversation |
| `GET` | `/history?conversation_id=...` | Read conversation messages |

Service endpoints outside the prefix are `GET /health`, `GET /ready`, and FastAPI's `/docs`.

## Current scope

This MVP uses local heuristic retrieval and document-insight generation. It does not currently provide OCR for scanned PDFs, vector/embedding search, a hosted language model, Redis-backed processing, or streaming responses. Scanned PDFs and documents with no extractable text are rejected with an error instead of being indexed as empty content.

## Repository layout

```text
backend/       FastAPI application, database migrations, and tests
frontend/      Next.js application
docs/          Screenshots used in this README
outputs/       MVP implementation plan
.github/       GitHub Actions workflow
```

## GitHub

GitHub Actions runs the automated checks on pushes and pull requests. To publish the current local branch to the configured `origin` remote:

```powershell
git status
git add .
git commit -m "Prepare Nexus AI MVP for GitHub"
git push -u origin main
```

The implementation plan is available at [`outputs/nexus-ai-mvp-build-plan.md`](outputs/nexus-ai-mvp-build-plan.md).
