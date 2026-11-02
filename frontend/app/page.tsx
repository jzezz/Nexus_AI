"use client";

import { FormEvent, MouseEvent, useEffect, useState } from "react";

type AuthMode = "login" | "register";

type AuthResponse = {
  access_token: string;
  user_id: string;
  email: string;
};

type ChunkPreview = {
  id: string;
  chunk_index: number;
  page_number: number | null;
  token_count: number;
  keyword_signature: string;
  preview: string;
};

type DocumentInsights = {
  summary: string;
  key_topics: string[];
  suggested_questions: string[];
};

type DocumentItem = {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  page_count: number;
  chunk_count: number;
  retrieval_ready: boolean;
  processing_error: string | null;
  uploaded_at: string;
  chunks: ChunkPreview[];
  insights?: DocumentInsights | null;
};

type Citation = {
  document_id: string;
  filename: string;
  snippet: string;
  page_number: number | null;
  chunk_index: number | null;
  score: number | null;
};

type ChatResponse = {
  conversation_id: string;
  answer: string;
  route: string;
  confidence: number;
  citations: Citation[];
  scoped_document_ids: string[];
};

type HistoryMessage = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  citations: Citation[];
  created_at: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  last_message_preview: string;
  scoped_document_ids: string[];
};

type StoredSession = {
  token: string;
  email: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const SESSION_STORAGE_KEY = "nexus-ai-session";

function apiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) {
    return fallback;
  }

  const detail = payload.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : ""))
      .filter(Boolean)
      .join(" ") || fallback;
  }
  return detail ? JSON.stringify(detail) : fallback;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function statusLabel(document: DocumentItem) {
  if (document.processing_error) {
    return "Failed";
  }
  if (document.retrieval_ready) {
    return "Ready";
  }
  return document.status;
}

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [email, setEmail] = useState("demo@nexus.ai");
  const [password, setPassword] = useState("password123");
  const [token, setToken] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [chatScopeIds, setChatScopeIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("What do the uploaded documents say?");
  const [chat, setChat] = useState<ChatResponse | null>(null);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Checking for a saved workspace...");
  const [busy, setBusy] = useState<string | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [restoredSessionToken, setRestoredSessionToken] = useState<string | null>(null);

  const scopedDocuments = documents.filter((document) => chatScopeIds.includes(document.id));
  const readyDocuments = documents.filter((document) => document.retrieval_ready);
  const checklist = [
    { label: "Sign in", done: Boolean(token) },
    { label: "Upload a document", done: documents.length > 0 },
    { label: "Document retrieval ready", done: readyDocuments.length > 0 },
    { label: "Ask first question", done: Boolean(chat) },
  ];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawSession) {
      setSessionHydrated(true);
      setStatus("Ready to build the live MVP.");
      return;
    }

    try {
      const parsed = JSON.parse(rawSession) as Partial<StoredSession>;
      if (!parsed.token || !parsed.email) {
        throw new Error("Saved session is incomplete.");
      }

      setToken(parsed.token);
      setUserEmail(parsed.email);
      setRestoredSessionToken(parsed.token);
      setStatus(`Restored your workspace for ${parsed.email}.`);
    } catch {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      setStatus("Saved session was invalid. Please sign in again.");
    } finally {
      setSessionHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!restoredSessionToken) {
      return;
    }

    void loadDocuments(restoredSessionToken);
    void loadConversations(restoredSessionToken);
    setRestoredSessionToken(null);
  }, [restoredSessionToken]);

  useEffect(() => {
    if (!sessionHydrated || typeof window === "undefined") {
      return;
    }

    if (token && userEmail) {
      const session: StoredSession = { token, email: userEmail };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      return;
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }, [sessionHydrated, token, userEmail]);

  function toggleDocumentScope(documentId: string) {
    setChatScopeIds((current) =>
      current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId],
    );
  }

  function clearChatScope() {
    setChatScopeIds([]);
  }

  function clearSession() {
    setToken("");
    setUserEmail("");
    setDocuments([]);
    setSelectedDocument(null);
    setChatScopeIds([]);
    setQuestion("What do the uploaded documents say?");
    setChat(null);
    setHistory([]);
    setConversations([]);
    setConversationId(null);
    setSelectedFile(null);
    setStatus("Signed out. Sign in again to continue.");
  }

  function startNewConversation() {
    setConversationId(null);
    setChat(null);
    setHistory([]);
    setStatus("Started a new conversation. Your documents and scope are still available.");
  }

  function applySuggestedQuestion(nextQuestion: string, documentId: string) {
    setQuestion(nextQuestion);
    setChatScopeIds((current) => (current.includes(documentId) ? current : [...current, documentId]));
    setStatus(`Loaded a suggested question from ${selectedDocument?.filename ?? "the document"}.`);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("auth");
    setStatus(`${authMode === "register" ? "Creating" : "Opening"} your workspace...`);

    try {
      const response = await fetch(`${API_BASE}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Auth request failed."));
      }

      const auth = data as AuthResponse;
      setToken(auth.access_token);
      setUserEmail(auth.email);
      setConversationId(null);
      setHistory([]);
      setConversations([]);
      setChat(null);
      setSelectedDocument(null);
      setChatScopeIds([]);
      setStatus(`Signed in as ${auth.email}.`);
      await loadDocuments(auth.access_token);
      await loadConversations(auth.access_token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Auth request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function loadDocuments(activeToken = token) {
    if (!activeToken) {
      return;
    }

    setBusy("documents");
    try {
      const response = await fetch(`${API_BASE}/documents`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Could not load documents."));
      }
      const items = data as DocumentItem[];
      setDocuments(items);
      setChatScopeIds((current) => current.filter((id) => items.some((item) => item.id === id)));
      if (selectedDocument) {
        const refreshed = items.find((item) => item.id === selectedDocument.id);
        if (refreshed) {
          await loadDocumentDetail(refreshed.id, activeToken);
        }
      }
      setStatus(`Loaded ${items.length} document${items.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load documents.");
    } finally {
      setBusy(null);
    }
  }

  async function loadDocumentDetail(documentId: string, activeToken = token) {
    if (!activeToken) {
      return;
    }

    setBusy("document-detail");
    try {
      const response = await fetch(`${API_BASE}/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Could not load document detail."));
      }
      setSelectedDocument(data as DocumentItem);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load document detail.");
    } finally {
      setBusy(null);
    }
  }

  async function loadConversations(activeToken = token) {
    if (!activeToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/conversations`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Could not load conversations."));
      }
      const items = data as ConversationSummary[];
      setConversations(items);
      if (conversationId) {
        const activeConversation = items.find((item) => item.id === conversationId);
        if (activeConversation) {
          setChatScopeIds(activeConversation.scoped_document_ids);
        }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load conversations.");
    }
  }

  async function loadHistory(
    activeConversationId = conversationId,
    activeToken = token,
    activeScopeIds?: string[],
  ) {
    if (!activeToken || !activeConversationId) {
      return;
    }

    setBusy("history");
    try {
      const response = await fetch(`${API_BASE}/history?conversation_id=${encodeURIComponent(activeConversationId)}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Could not load conversation history."));
      }
      const messages = data as HistoryMessage[];
      const restoredScopeIds = activeScopeIds ?? chatScopeIds;
      setHistory(messages);
      setChatScopeIds(restoredScopeIds);
      const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
      if (lastAssistant) {
        setChat({
          conversation_id: activeConversationId,
          answer: lastAssistant.content,
          route: "history",
          confidence: 0,
          citations: lastAssistant.citations,
          scoped_document_ids: restoredScopeIds,
        });
      } else {
        setChat(null);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load conversation history.");
    } finally {
      setBusy(null);
    }
  }

  async function openConversation(summary: ConversationSummary) {
    setConversationId(summary.id);
    setChatScopeIds(summary.scoped_document_ids);
    await loadHistory(summary.id, token, summary.scoped_document_ids);
    setStatus(
      `Opened conversation: ${summary.title}. Scope restored to ${summary.scoped_document_ids.length || documents.length} document${(summary.scoped_document_ids.length || documents.length) === 1 ? "" : "s"}.`,
    );
  }

  async function deleteConversation(event: MouseEvent<HTMLButtonElement>, summary: ConversationSummary) {
    event.stopPropagation();
    if (!token) {
      return;
    }

    setBusy("delete-conversation");
    try {
      const response = await fetch(`${API_BASE}/conversations/${summary.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Could not delete conversation."));
      }
      if (summary.id === conversationId) {
        setConversationId(null);
        setHistory([]);
        setChat(null);
      }
      await loadConversations(token);
      setStatus(`Deleted conversation: ${summary.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete conversation.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedFile) {
      setStatus("Sign in and choose a file first.");
      return;
    }

    setBusy("upload");
    setStatus(`Uploading ${selectedFile.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Upload failed."));
      }
      setSelectedFile(null);
      setStatus(`Uploaded ${data.filename}.`);
      await loadDocuments();
      if (data.document_id) {
        await loadDocumentDetail(data.document_id, token);
        setChatScopeIds((current) => (current.includes(data.document_id) ? current : [...current, data.document_id]));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function askQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setStatus("Sign in before starting a conversation.");
      return;
    }

    setBusy("chat");
    setStatus(
      chatScopeIds.length > 0
        ? `Searching ${chatScopeIds.length} selected document${chatScopeIds.length === 1 ? "" : "s"}...`
        : "Running retrieval across all indexed documents...",
    );

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question, conversation_id: conversationId, document_ids: chatScopeIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, "Chat request failed."));
      }
      const result = data as ChatResponse;
      setConversationId(result.conversation_id);
      setChat(result);
      await loadHistory(result.conversation_id, token);
      setChat(result);
      await loadConversations(token);
      setStatus(
        `Answered through the ${result.route} route with confidence ${result.confidence}. Scope: ${
          result.scoped_document_ids.length || documents.length
        } document${(result.scoped_document_ids.length || documents.length) === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Chat request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="docs-shell">
      <aside className="docs-sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>Nexus AI</strong>
            <p>Document answers with citations</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <a href="#overview">Overview</a>
          <a href="#workspace">Workspace</a>
          <a href="#documents">Documents</a>
          <a href="#chat">Chat</a>
          <a href="#history">History</a>
        </nav>

        <div className="sidebar-card">
          <span className="small-label">Quick Start</span>
          <div className="checklist">
            {checklist.map((item) => (
              <div key={item.label} className={`check-item${item.done ? " done" : ""}`}>
                <span className="check-dot" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-card">
          <span className="small-label">Conversations</span>
          <div className="button-row sidebar-actions">
            <button type="button" className="primary-button" onClick={startNewConversation}>
              New chat
            </button>
          </div>
          {conversations.length === 0 ? (
            <p>No saved conversations yet.</p>
          ) : (
            <div className="conversation-list">
              {conversations.map((summary) => (
                <div key={summary.id} className={`conversation-item${conversationId === summary.id ? " active" : ""}`}>
                  <button type="button" className="conversation-button" onClick={() => openConversation(summary)}>
                    <strong>{summary.title}</strong>
                    <span>{summary.message_count} messages</span>
                    <p>{summary.last_message_preview}</p>
                    <span>{formatDate(summary.updated_at)}</span>
                  </button>
                  <button
                    type="button"
                    className="conversation-delete"
                    onClick={(event) => void deleteConversation(event, summary)}
                    disabled={busy === "delete-conversation"}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-card">
          <span className="small-label">Session</span>
          <strong>{token ? userEmail : "No active session"}</strong>
          <p>{token ? "Authenticated and saved locally on this device." : "Register or login to begin."}</p>
          {token ? (
            <div className="button-row sidebar-actions">
              <button type="button" className="ghost-button" onClick={clearSession}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>

        <div className="sidebar-card">
          <span className="small-label">Scope</span>
          <strong>{chatScopeIds.length || documents.length || 0} docs</strong>
          <p>
            {chatScopeIds.length > 0
              ? "Chat is limited to the selected documents."
              : "Chat will search everything you have uploaded."}
          </p>
        </div>
      </aside>

      <div className="docs-main">
        <section id="overview" className="hero-block">
          <span className="hero-kicker">Nexus AI / MVP</span>
          <h1>Ask your documents. See the evidence. Keep the workflow simple.</h1>
          <p className="hero-copy">
            A minimal document assistant for PDF, DOCX, and CSV uploads with authentication, chunk inspection,
            scoped retrieval, citations, saved conversation history, and document insights that help you ask better questions.
          </p>

          <div className="hero-metrics">
            <div className="metric-tile">
              <span>Documents</span>
              <strong>{documents.length}</strong>
            </div>
            <div className="metric-tile">
              <span>Ready for retrieval</span>
              <strong>{readyDocuments.length}</strong>
            </div>
            <div className="metric-tile">
              <span>Conversations</span>
              <strong>{conversations.length}</strong>
            </div>
          </div>

          <div className="status-banner">
            <span className="status-dot" />
            <div>
              <strong>Workspace status</strong>
              <p>{status}</p>
            </div>
          </div>
        </section>

        <section className="flow-strip" aria-label="Workflow summary">
          <div className="flow-card">
            <span>1</span>
            <strong>Authenticate</strong>
            <p>Create a session and unlock protected endpoints.</p>
          </div>
          <div className="flow-card">
            <span>2</span>
            <strong>Ingest</strong>
            <p>Upload documents and inspect indexed chunks.</p>
          </div>
          <div className="flow-card">
            <span>3</span>
            <strong>Understand</strong>
            <p>Review summaries, topics, and suggested questions.</p>
          </div>
          <div className="flow-card">
            <span>4</span>
            <strong>Manage</strong>
            <p>Switch between saved conversations and keep your work organized.</p>
          </div>
        </section>

        <section id="workspace" className="content-grid">
          <article className="doc-card">
            <div className="section-heading">
              <span className="small-label">Step 1</span>
              <h2>Open your workspace</h2>
            </div>
            <p className="section-copy">Register or login before uploading files or asking document questions.</p>

            <form onSubmit={submitAuth} className="stack-form">
              <label>
                Email
                <input value={email} onChange={(event) => setEmail(event.target.value)} className="field" />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="field"
                />
              </label>
              <div className="button-row">
                <button type="submit" className="primary-button" disabled={busy === "auth"}>
                  {busy === "auth" ? "Working..." : authMode === "register" ? "Register" : "Login"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setAuthMode(authMode === "register" ? "login" : "register")}
                >
                  Switch to {authMode === "register" ? "login" : "register"}
                </button>
              </div>
            </form>
          </article>

          <article className="doc-card">
            <div className="section-heading">
              <span className="small-label">Step 2</span>
              <h2>Upload source files</h2>
            </div>
            <p className="section-copy">Add a PDF, DOCX, or CSV to ingest text, create chunks, and prepare retrieval.</p>

            <form onSubmit={uploadFile} className="stack-form">
              <input
                type="file"
                accept=".pdf,.docx,.csv"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="field file-field"
              />
              <div className="button-row">
                <button type="submit" className="primary-button" disabled={busy === "upload" || !selectedFile}>
                  {busy === "upload" ? "Uploading..." : "Upload file"}
                </button>
                <button type="button" className="ghost-button" onClick={() => loadDocuments()} disabled={!token || busy === "documents"}>
                  {busy === "documents" ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </form>

            <div className="inline-note">
              {selectedFile ? `Selected file: ${selectedFile.name}` : "No file selected yet."}
            </div>
          </article>
        </section>

        <section id="documents" className="two-column">
          <article className="doc-card">
            <div className="section-heading">
              <span className="small-label">Documents</span>
              <h2>Indexed content</h2>
            </div>

            {documents.length === 0 ? (
              <p className="empty-state">No uploaded documents yet.</p>
            ) : (
              <div className="document-list">
                {documents.map((document) => {
                  const inScope = chatScopeIds.includes(document.id);
                  return (
                    <div key={document.id} className="document-item">
                      <button
                        type="button"
                        className={`document-summary${selectedDocument?.id === document.id ? " selected" : ""}`}
                        onClick={() => loadDocumentDetail(document.id)}
                      >
                        <div className="document-topline">
                          <strong>{document.filename}</strong>
                          <span className={`pill ${document.retrieval_ready ? "pill-ready" : "pill-muted"}`}>
                            {statusLabel(document)}
                          </span>
                        </div>
                        <p>
                          {document.file_type.toUpperCase()} / {document.page_count} pages / {document.chunk_count} chunks
                        </p>
                        <p>Uploaded {formatDate(document.uploaded_at)}</p>
                      </button>
                      <div className="button-row">
                        <button
                          type="button"
                          className={inScope ? "ghost-button" : "primary-button"}
                          onClick={() => toggleDocumentScope(document.id)}
                        >
                          {inScope ? "Remove from scope" : "Use in chat"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="doc-card">
            <div className="section-heading">
              <span className="small-label">Inspector</span>
              <h2>Selected document</h2>
            </div>

            {selectedDocument ? (
              <div className="inspector-stack">
                <div className="inspector-header">
                  <strong>{selectedDocument.filename}</strong>
                  <p>
                    {selectedDocument.file_type.toUpperCase()} / {selectedDocument.page_count} pages / {selectedDocument.chunk_count} chunks
                  </p>
                  <p>
                    {chatScopeIds.includes(selectedDocument.id)
                      ? "Included in active chat scope."
                      : "Not included in active chat scope."}
                  </p>
                </div>

                {selectedDocument.insights ? (
                  <div className="insight-card">
                    <div className="insight-section">
                      <span className="small-label">Summary</span>
                      <p>{selectedDocument.insights.summary}</p>
                    </div>
                    <div className="insight-section">
                      <span className="small-label">Key Topics</span>
                      <div className="topic-chips">
                        {selectedDocument.insights.key_topics.map((topic) => (
                          <span key={topic} className="topic-chip">{topic}</span>
                        ))}
                      </div>
                    </div>
                    <div className="insight-section">
                      <span className="small-label">Suggested Questions</span>
                      <div className="suggestion-list">
                        {selectedDocument.insights.suggested_questions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="suggestion-button"
                            onClick={() => applySuggestedQuestion(suggestion, selectedDocument.id)}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {selectedDocument.chunks.map((chunk) => (
                  <div key={chunk.id} className="chunk-card">
                    <strong>
                      Chunk {chunk.chunk_index}
                      {chunk.page_number ? ` / page ${chunk.page_number}` : ""}
                    </strong>
                    <p>{chunk.token_count} tokens</p>
                    <code>{chunk.keyword_signature || "No keyword signature"}</code>
                    <p>{chunk.preview}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Select a document to inspect its chunks and insights.</p>
            )}
          </article>
        </section>

        <section id="chat" className="two-column">
          <article className="doc-card">
            <div className="section-heading">
              <span className="small-label">Step 3</span>
              <h2>Ask a question</h2>
            </div>
            <p className="section-copy">
              {chatScopeIds.length > 0
                ? `Chat is scoped to ${chatScopeIds.length} selected document${chatScopeIds.length === 1 ? "" : "s"}.`
                : "Chat will search across all indexed documents."}
            </p>

            {scopedDocuments.length > 0 ? (
              <div className="scope-chips">
                {scopedDocuments.map((document) => (
                  <button key={document.id} type="button" className="scope-chip" onClick={() => toggleDocumentScope(document.id)}>
                    {document.filename}
                  </button>
                ))}
              </div>
            ) : null}

            <form onSubmit={askQuestion} className="stack-form">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="field prompt-field"
              />
              <div className="button-row">
                <button type="submit" className="primary-button" disabled={busy === "chat"}>
                  {busy === "chat" ? "Running..." : "Run chat"}
                </button>
                <button type="button" className="ghost-button" onClick={clearChatScope} disabled={chatScopeIds.length === 0}>
                  Clear scope
                </button>
                <button type="button" className="ghost-button" onClick={startNewConversation}>
                  New conversation
                </button>
                <button type="button" className="ghost-button" onClick={() => loadHistory()} disabled={!conversationId || busy === "history"}>
                  {busy === "history" ? "Loading..." : "Refresh history"}
                </button>
              </div>
            </form>
          </article>

          <article className="doc-card">
            <div className="section-heading">
              <span className="small-label">Answer</span>
              <h2>Latest response</h2>
            </div>

            {chat ? (
              <div className="answer-stack">
                <div className="answer-meta">
                  Route: {chat.route} / Confidence: {chat.confidence} / Scope: {chat.scoped_document_ids.length || documents.length}
                </div>
                <div className="answer-body">{chat.answer}</div>
              </div>
            ) : (
              <p className="empty-state">No answer yet.</p>
            )}
          </article>
        </section>

        <section className="two-column">
          <article className="doc-card">
            <div className="section-heading">
              <span className="small-label">Evidence</span>
              <h2>Citations</h2>
            </div>

            {chat?.citations.length ? (
              <div className="citation-list">
                {chat.citations.map((citation) => (
                  <div key={`${citation.document_id}-${citation.chunk_index}`} className="citation-card">
                    <strong>{citation.filename}</strong>
                    <p>
                      {citation.page_number ? `Page ${citation.page_number}` : "Page unknown"}
                      {citation.chunk_index !== null ? ` / Chunk ${citation.chunk_index}` : ""}
                      {citation.score !== null ? ` / Score ${citation.score}` : ""}
                    </p>
                    <p>{citation.snippet}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Citations will appear after a retrieval-backed answer.</p>
            )}
          </article>

          <article id="history" className="doc-card">
            <div className="section-heading">
              <span className="small-label">History</span>
              <h2>Saved conversation</h2>
            </div>

            {history.length === 0 ? (
              <p className="empty-state">No stored messages yet.</p>
            ) : (
              <div className="history-list">
                {history.map((message) => (
                  <div key={message.id} className="history-card">
                    <div className="history-topline">
                      <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
                      <span>{formatDate(message.created_at)}</span>
                    </div>
                    <p>{message.content}</p>
                    {message.citations.length > 0 ? <p>{message.citations.length} citations attached.</p> : null}
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

