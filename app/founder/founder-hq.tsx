"use client";

import { useEffect, useState } from "react";

type Metrics = { dials: number; ownerConversations: number; demosBooked: number; demosHeld: number; trials: number; customers: number; mrr: number };
type Entry = Metrics & { note: string };
type Commit = { sha: string; message: string; author: string; committedAt: string; url: string };
type Draft = { id: string; category: string; body: string; status: string };
type Conversation = { id: string; score: number; platform: string; title: string; author: string | null; url: string; publishedAt: string | null; source: string; rawSnippet: string; rationale: string; suggestedResponse: string; status: string };
type ContextResponse = { date: string; commits: Commit[]; entry: Entry; drafts: Draft[]; postedContent: Array<{ id: string; body: string; postedAt: string | null }> };

const EMPTY_ENTRY: Entry = { note: "", dials: 0, ownerConversations: 0, demosBooked: 0, demosHeld: 0, trials: 0, customers: 0, mrr: 0 };
const METRIC_FIELDS: Array<{ key: keyof Metrics; label: string; prefix?: string }> = [
  { key: "dials", label: "Dials" },
  { key: "ownerConversations", label: "Owner conversations" },
  { key: "demosBooked", label: "Demos booked" },
  { key: "demosHeld", label: "Demos held" },
  { key: "trials", label: "Trials" },
  { key: "customers", label: "Customers" },
  { key: "mrr", label: "MRR", prefix: "$" },
];

async function founderApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

export function FounderHQ({ founder }: { founder: { email: string; companyName: string } }) {
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [entry, setEntry] = useState<Entry>(EMPTY_ENTRY);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      founderApi<ContextResponse>("/api/founder/context"),
      founderApi<{ results: Conversation[] }>("/api/founder/conversations"),
    ]).then(([daily, market]) => {
      if (!active) return;
      setContext(daily);
      setEntry(daily.entry);
      setDrafts(daily.drafts.slice(0, 3));
      setConversations(market.results);
    }).catch((error: Error) => setMessage(error.message));
    return () => { active = false; };
  }, []);

  async function saveContext() {
    setWorking("context"); setMessage("");
    try {
      await founderApi("/api/founder/context", { method: "PUT", body: JSON.stringify({ note: entry.note, metrics: entry }) });
      setMessage("Daily context saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    finally { setWorking(""); }
  }

  async function generateDrafts() {
    setWorking("drafts"); setMessage("");
    try {
      await saveContext();
      const result = await founderApi<{ drafts: Draft[] }>("/api/founder/drafts", { method: "POST" });
      setDrafts(result.drafts);
      setMessage("Generated exactly three new drafts.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate drafts."); }
    finally { setWorking(""); }
  }

  function editDraft(id: string, body: string) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, body } : draft));
  }

  async function updateDraft(draft: Draft, status: "saved" | "posted") {
    setWorking(draft.id); setMessage("");
    try {
      const result = await founderApi<{ draft: Draft }>(`/api/founder/drafts/${draft.id}`, { method: "PATCH", body: JSON.stringify({ body: draft.body, status }) });
      setDrafts((current) => current.map((item) => item.id === draft.id ? result.draft : item));
      setMessage(status === "posted" ? "Marked as posted." : "Draft saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update draft."); }
    finally { setWorking(""); }
  }

  async function refreshConversations() {
    setWorking("signals"); setMessage("");
    try {
      const result = await founderApi<{ results: Conversation[]; searched: number }>("/api/founder/conversations", { method: "POST" });
      setConversations(result.results);
      setMessage(result.searched ? "Market scan complete." : "No strong public conversations found in this scan.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not scan conversations."); }
    finally { setWorking(""); }
  }

  async function updateConversation(conversation: Conversation, status: "saved" | "ignored" | "responded") {
    setWorking(conversation.id); setMessage("");
    try {
      const result = await founderApi<{ conversation: Conversation }>(`/api/founder/conversations/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ status, suggestedResponse: conversation.suggestedResponse }) });
      setConversations((current) => status === "ignored" ? current.filter((item) => item.id !== conversation.id) : current.map((item) => item.id === conversation.id ? result.conversation : item));
      setMessage(`Conversation marked ${status}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update conversation."); }
    finally { setWorking(""); }
  }

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setMessage(`${label} copied.`);
  }

  return <main className="founder-shell">
    <header className="founder-header"><div><span>STRIPE PROS / INTERNAL</span><h1>Founder HQ</h1></div><div><b>PRIVATE</b><span>{founder.email}</span></div></header>
    {message && <div className="founder-toast" role="status">{message}</div>}

    <section className="founder-section">
      <div className="founder-section-head"><div><span>01</span><h2>Daily Context</h2><p>{context?.date || "Loading today…"}</p></div><button onClick={saveContext} disabled={working === "context"}>{working === "context" ? "SAVING…" : "SAVE DAY"}</button></div>
      <div className="founder-context-grid">
        <div className="founder-card"><h3>GitHub · last 24 hours</h3><div className="founder-commits">{!context ? <p>Loading commits…</p> : !context.commits.length ? <p>No commits found in the last 24 hours.</p> : context.commits.map((commit) => <a href={commit.url} target="_blank" rel="noreferrer" key={commit.sha}><code>{commit.sha}</code><span>{commit.message}</span><time>{new Date(commit.committedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></a>)}</div></div>
        <label className="founder-card founder-note"><h3>Founder note</h3><textarea value={entry.note} onChange={(event) => setEntry((current) => ({ ...current, note: event.target.value }))} placeholder="What shipped, what changed your mind, what customers said…" /></label>
      </div>
      <div className="founder-metrics">{METRIC_FIELDS.map((field) => <label key={field.key}><span>{field.label}</span><div>{field.prefix && <b>{field.prefix}</b>}<input type="number" min="0" step={field.key === "mrr" ? ".01" : "1"} value={entry[field.key]} onChange={(event) => setEntry((current) => ({ ...current, [field.key]: Number(event.target.value) }))} /></div></label>)}</div>
    </section>

    <section className="founder-section">
      <div className="founder-section-head"><div><span>02</span><h2>Content Agent</h2><p>Exactly three editable X drafts</p></div><button onClick={generateDrafts} disabled={working === "drafts"}>{working === "drafts" ? "GENERATING…" : "GENERATE 3 DRAFTS"}</button></div>
      <div className="founder-drafts">{!drafts.length ? <div className="founder-empty">Save today’s context, then generate the three daily angles.</div> : drafts.map((draft) => <article className="founder-card" key={draft.id}><div className="founder-card-label"><span>{draft.category}</span><b>{draft.status.toUpperCase()}</b></div><textarea value={draft.body} onChange={(event) => editDraft(draft.id, event.target.value)} /><div className="founder-actions"><button onClick={() => void copy(draft.body, "Draft")}>COPY</button><button onClick={() => void updateDraft(draft, "saved")} disabled={working === draft.id}>SAVE</button><button className="founder-primary" onClick={() => void updateDraft(draft, "posted")} disabled={working === draft.id}>MARK POSTED</button></div></article>)}</div>
      {!!context?.postedContent.length && <details className="posted-history"><summary>Recent posted content ({context.postedContent.length})</summary>{context.postedContent.map((post) => <p key={post.id}>{post.body}</p>)}</details>}
    </section>

    <section className="founder-section">
      <div className="founder-section-head"><div><span>03</span><h2>Conversations to Join</h2><p>Top five public signals · never auto-replies</p></div><button onClick={refreshConversations} disabled={working === "signals"}>{working === "signals" ? "SCANNING…" : "SCAN PUBLIC CONVERSATIONS"}</button></div>
      <div className="founder-conversations">{!conversations.length ? <div className="founder-empty">Run a scan to rank fresh public discussions.</div> : conversations.map((conversation) => <article className="founder-card conversation-card" key={conversation.id}><div className="conversation-top"><strong>{conversation.score}</strong><span>{conversation.platform}</span><a href={conversation.url} target="_blank" rel="noreferrer">OPEN ORIGINAL ↗</a></div><h3>{conversation.title}</h3><p className="conversation-meta">{conversation.author || "Unknown author"}{conversation.publishedAt ? ` · ${new Date(conversation.publishedAt).toLocaleDateString()}` : ""} · {conversation.source}</p><p className="conversation-snippet">{conversation.rawSnippet}</p><div className="conversation-why"><b>WHY IT MATTERS</b><span>{conversation.rationale}</span></div><label><b>SUGGESTED RESPONSE</b><textarea value={conversation.suggestedResponse} onChange={(event) => setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, suggestedResponse: event.target.value } : item))} /></label><div className="founder-actions"><button onClick={() => void copy(conversation.suggestedResponse, "Reply")}>COPY REPLY</button><button onClick={() => void updateConversation(conversation, "ignored")}>IGNORE</button><button onClick={() => void updateConversation(conversation, "saved")}>SAVE</button><button className="founder-primary" onClick={() => void updateConversation(conversation, "responded")}>MARK RESPONDED</button></div></article>)}</div>
    </section>
  </main>;
}
