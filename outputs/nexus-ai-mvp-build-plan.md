# Nexus AI MVP Build Plan

## Current project shape

Nexus AI is now a working local MVP that lets a user:

1. Register or sign in
2. Upload a PDF, DOCX, or CSV
3. Inspect chunked document metadata and generated insights
4. Ask questions against all documents or a scoped subset
5. Receive cited answers with saved conversation history
6. Reopen previous conversations with their document scope restored

## What is already implemented

- FastAPI backend with JWT auth and protected API routes
- SQLAlchemy persistence with SQLite default local runtime
- Alembic migration scaffolding and a Postgres-ready schema path
- Document ingestion for PDF, DOCX, and CSV
- Chunk metadata including page numbers, token counts, and keyword signatures
- Lightweight retrieval scoring with citations and confidence output
- Conversation persistence with stored message history and scoped document metadata
- Next.js frontend for auth, uploads, document browsing, chat, citations, and history
- Local session persistence in the frontend so refresh does not immediately reset the workspace
- Dockerfiles for backend and frontend

## Current MVP boundaries

The app is still intentionally MVP-grade in these areas:

- Retrieval is heuristic and lexical, not embedding-backed
- No OCR pipeline for scanned PDFs yet
- No Redis-backed session or job layer yet
- No model-backed direct-answer path yet
- No streaming chat responses yet
- No frontend or API-level automated test suite yet
- Local Git metadata appears broken and should be repaired before normal team workflows

## Next production passes

### Phase 1: Make the deployment path real

- Validate Postgres locally as the primary database path
- Run Alembic migrations end-to-end against Postgres
- Move away from SQLite-first assumptions for non-dev environments
- Repair repository Git metadata so normal commits and pushes work again

### Phase 2: Upgrade retrieval quality

- Add embeddings for chunk indexing
- Add Qdrant or another vector store
- Blend lexical retrieval with semantic retrieval
- Improve answer synthesis and citation ranking

### Phase 3: Add real orchestration

- Replace the local direct-response guidance with a model-backed path
- Add structured routing for retrieval vs general questions
- Introduce conversation-aware answer generation
- Add streaming responses in the frontend

### Phase 4: Production hardening

- Expand the backend regression suite and add frontend tests
- Add structured logging and better operational error handling
- Add rate limiting for upload and chat endpoints
- Add deployment configuration for frontend, backend, and database services
- Add secrets management and environment validation for production

## Recommended next coding pass

The highest-leverage next implementation step is:

1. Verify and stabilize a real Postgres plus Alembic local workflow
2. Expand tests from the current core-flow regression suite to the API and frontend
3. Replace the placeholder direct-answer branch with a model-backed assistant path
4. Add embeddings and vector retrieval

## Definition of done for v1

From a public URL, the app should answer at least 7 out of 10 known questions correctly from a 20-page document, each with a valid citation, while supporting a reliable login, upload, and conversation workflow.
## Post-Deployment To-Do
- Rate limits (upload/chat)
- Frontend automated tests
- Streaming chat UI (optional)
- Embeddings + Qdrant (optional v1+)
- Confirm 7/10 citation accuracy on public URL
