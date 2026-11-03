# Nexus AI

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**Ask questions about your documents and get answers with source citations.** Nexus AI is a full-stack document Q&A app: upload PDF, DOCX, or CSV files, inspect what was extracted, and chat with evidence, retrieval scores, and confidence shown for every answer.

## Live demo

**Frontend:** [frontend-27gl.vercel.app](https://frontend-27gl.vercel.app)

The app needs a running backend API. If the hosted demo can't reach one, run the backend locally (see [Quick start](#quick-start)) and open the app on `localhost`.

![Nexus AI overview](docs/screenshots/nexus-ai-overview.png)

<details>
<summary>More screenshots: document workspace, inspector, and chat</summary>

![Nexus AI document workspace](docs/screenshots/nexus-ai-workspace.png)
</details>

## Features

- **Accounts:** register and sign in with hashed passwords and JWT bearer tokens.
- **Uploads:** PDF, DOCX, and CSV with a configurable size limit.
- **Document insights:** extracted text, searchable chunks, summaries, topics, and suggested questions.
- **Cited answers:** every answer shows its evidence, retrieval scores, and confidence.
- **Scoped search:** query all documents or only the ones you select.
- **History:** save, revisit, and delete conversations and documents.
- **Data isolation:** documents and conversations are private to each account.
- **Operations:** `/health` and `/ready` endpoints, SQLite for local use, PostgreSQL with Alembic migrations for deployment.

## How it works

```
Upload (PDF / DOCX / CSV)
        │
        ▼
Extract text ──► Chunk ──► Store (per user)
                              │
Question ──► Retrieve & rank chunks ──► Answer + citations, scores, confidence
```

Retrieval and document insights are generated locally with heuristics. See [Current scope](#current-scope).

## Tech stack

| Area | Tools |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Backend | Python, FastAPI, SQLAlchemy, Pydantic |
| Database | SQLite (local), PostgreSQL + Alembic (deployment) |
| Auth | JWT bearer tokens, hashed passwords |
| CI | GitHub Actions: backend tests, frontend type check and build, dependency audit |

## Quick start

**Requirements:** Python 3.12+, Node.js 22+.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
Copy-Item .env.example .env       # macOS/Linux: cp .env.example .env
uvicorn app.main:app --reload
```

API: `http://localhost:8000`, docs: `http://localhost:8000/docs`. The example config uses SQLite and creates its tables on startup.

### 2. Frontend

In a second terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The frontend reads `NEXT_PUBLIC_API_BASE_URL` from `.env.local` (default `http://localhost:8000/api/v1`).

### PostgreSQL (optional)

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/nexus_ai
AUTO_INIT_DB=false
```
```powershell
cd backend
.venv\Scripts\alembic.exe upgrade head
.venv\Scripts\uvicorn.exe app.main:app --reload
```

Keep real secrets in local `.env` files or your host's secret store. Commit only the `.env.example` templates.

## API

Application routes use the `/api/v1` prefix.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Sign in and receive a token |
| `POST` | `/upload` | Upload and process a document |
| `GET` | `/documents` | List your documents |
| `GET` | `/documents/{document_id}` | Inspect a document and its chunks |
| `DELETE` | `/documents/{document_id}` | Delete a document |
| `POST` | `/chat` | Retrieve evidence and answer a question |
| `GET` | `/conversations` | List saved conversations |
| `DELETE` | `/conversations/{conversation_id}` | Delete a conversation |
| `GET` | `/history?conversation_id=...` | Read a conversation's messages |

Outside the prefix: `GET /health`, `GET /ready`, and FastAPI's `/docs`.

## Testing and evaluation

| Check | Result |
|---|---:|
| Backend unit and API integration tests | **13 / 13 passed** |
| Frontend TypeScript check and production build | **Passed** |
| `npm audit` | **0 vulnerabilities** |
| SQLite Alembic migration check | **Passed** |
| Browser smoke test (register, upload CSV, view insights, cited answer, saved history) | **Passed** |

### Retrieval evaluation

Ranking quality on 12 hand-written questions over 12 synthetic document chunks:

| Metric | Result |
|---|---:|
| Top-1 accuracy | **10 / 12 (83.3%)** |
| Recall@3 | **11 / 12 (91.7%)** |
| Mean reciprocal rank | **0.875** |

```powershell
cd backend
python evals/evaluate_retrieval.py     # writes backend/evals/latest_results.json
```

**This is a smoke test, not an accuracy claim.** The corpus and questions are synthetic, with only 12 chunks, and the test does not assess answer factuality or citation correctness. The eval runs in CI alongside the backend tests.

![Retrieval evaluation](docs/analytics/retrieval-eval.png)
<!-- Add a chart of the eval results here, or delete this line -->

### Run all checks

```powershell
cd backend
.venv\Scripts\python.exe -m unittest discover -s tests -v
cd ..\frontend
npm ci; npm run typecheck; npm run build; npm audit
```

## Current scope

Nexus AI is an MVP. It uses **local heuristic retrieval and insight generation**. It does not yet include:

- OCR for scanned PDFs (documents with no extractable text are rejected with an error)
- Vector/embedding search
- A hosted language model
- Streaming responses or Redis-backed processing

## Repository layout

```
backend/    FastAPI app, database migrations, tests, evals
frontend/   Next.js app
docs/       Screenshots
.github/    CI workflow
```

## Author

**Jabez Bodkhe**: [LinkedIn](https://www.linkedin.com/in/jabez-bodkhe/) | [GitHub](https://github.com/jzezz) | [Portfolio](https://jzezz-portfolio.vercel.app)
