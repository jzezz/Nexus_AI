"""Small, deterministic retrieval ranking benchmark using synthetic fixtures."""

from __future__ import annotations

import json
import math
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.retrieval import rank_chunks, query_terms, tokenize  # noqa: E402


FIXTURES = [
    (
        "What project vision helps internal teams?",
        "vision",
        "Nexus AI helps teams search internal project documents with answers grounded in source text.",
    ),
    (
        "Which supported formats are parsed during document uploads?",
        "formats",
        "Document uploads accept PDF, DOCX, and CSV files and extract readable text for indexing.",
    ),
    (
        "How does retrieval produce source citations?",
        "retrieval",
        "Lexical retrieval ranks matching document chunks and returns source citations with scores.",
    ),
    (
        "How does Nexus keep user documents private?",
        "privacy",
        "Bearer-token authentication scopes every document and conversation query to its owner.",
    ),
    (
        "Can users reopen and delete prior chat conversations?",
        "history",
        "Saved conversation history can be revisited, and users can delete conversations when finished.",
    ),
    (
        "Which database works locally and how are schema upgrades applied?",
        "database",
        "SQLite supports local development, while Alembic migrations apply schema upgrades to PostgreSQL.",
    ),
    (
        "Does scanned PDF OCR run?",
        "ocr",
        "Scanned PDFs without extractable text are rejected because OCR is not implemented.",
    ),
    (
        "How large are chunks and how much do adjacent pieces overlap?",
        "chunking",
        "Long extracted text is split into 700-character chunks with a 100-character overlap.",
    ),
    (
        "What insights does document inspection generate?",
        "insights",
        "Document insights include a summary, key topics, and suggested questions for follow-up.",
    ),
    (
        "What file size limit protects uploads?",
        "limits",
        "The configurable upload size limit defaults to 15 MB, and reads stop at the limit plus one byte.",
    ),
    (
        "How does the browser frontend know the API server address?",
        "frontend",
        "The browser frontend reads the API server address from NEXT_PUBLIC_API_BASE_URL.",
    ),
    (
        "Do questions use machine learning embeddings or external generative models?",
        "heuristics",
        "Retrieval currently uses local lexical heuristics without vector embeddings or a hosted language model.",
    ),
]
RUNS_PER_QUERY = 250


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(fraction * len(ordered)) - 1)]


def main() -> None:
    documents = []
    for _, document_id, content in FIXTURES:
        chunk = SimpleNamespace(
            content=content,
            chunk_index=0,
            page_number=1,
            token_count=len(tokenize(content)),
            keyword_signature=", ".join(query_terms(content)[:8]),
        )
        documents.append(
            SimpleNamespace(
                id=document_id,
                filename=f"{document_id}.csv",
                retrieval_ready=True,
                chunks=[chunk],
            )
        )

    reciprocal_ranks = []
    top1_hits = 0
    top3_hits = 0
    queries_with_results = 0
    latencies_ms = []

    for question, expected_document_id, _ in FIXTURES:
        expected_rank = None
        for _ in range(RUNS_PER_QUERY):
            start = time.perf_counter_ns()
            ranked = rank_chunks(question, documents, limit=3)
            latencies_ms.append((time.perf_counter_ns() - start) / 1_000_000)
            if expected_rank is None:
                expected_rank = next(
                    (index for index, item in enumerate(ranked, start=1) if item.document.id == expected_document_id),
                    None,
                )

        top1_hits += expected_rank == 1
        top3_hits += expected_rank is not None and expected_rank <= 3
        queries_with_results += bool(ranked)
        reciprocal_ranks.append(1 / expected_rank if expected_rank else 0.0)

    query_count = len(FIXTURES)
    result = {
        "evaluation": "synthetic_retrieval_ranking",
        "evaluated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "corpus_chunks": len(documents),
        "queries": query_count,
        "runs_per_query": RUNS_PER_QUERY,
        "metrics": {
            "top_1_hits": f"{top1_hits}/{query_count}",
            "top_1_accuracy": round(top1_hits / query_count, 4),
            "recall_at_3_hits": f"{top3_hits}/{query_count}",
            "recall_at_3": round(top3_hits / query_count, 4),
            "mean_reciprocal_rank": round(statistics.mean(reciprocal_ranks), 4),
            "queries_with_ranked_results": f"{queries_with_results}/{query_count}",
            "ranking_latency_ms": {
                "p50": round(percentile(latencies_ms, 0.50), 4),
                "p95": round(percentile(latencies_ms, 0.95), 4),
                "mean": round(statistics.mean(latencies_ms), 4),
            },
        },
        "limitations": [
            "Queries and documents are hand-authored synthetic fixtures, not user data.",
            "Ranking latency is an in-process microbenchmark on a 12-chunk corpus, not API or production latency.",
            "Ranking metrics do not measure answer factuality or citation correctness.",
        ],
    }
    report = json.dumps(result, indent=2)
    Path(__file__).with_name("latest_results.json").write_text(report + "\n", encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
