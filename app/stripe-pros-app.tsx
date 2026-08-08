"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PRICE_UNITS, UNIT_LABELS, type PriceUnit } from "@/lib/price-book";

type User = { id: string; email: string; companyName: string };
type PriceItem = {
  id: string;
  name: string;
  category: string;
  unit: PriceUnit;
  unitPrice: string;
  isActive: boolean;
  sortOrder: number;
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function AuthModal({ onAuthenticated, onClose, initialMode }: { onAuthenticated: (user: User) => void; onClose: () => void; initialMode: "signup" | "signin" }) {
  const [mode, setMode] = useState<"signup" | "signin">(initialMode);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ companyName: form.get("companyName"), email: form.get("email"), password: form.get("password") }),
      });
      onAuthenticated(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not continue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={onClose} aria-label="Close account form">×</button>
        <form className="auth-card" onSubmit={submit}>
          <div className="card-heading"><BrandMark /><div><p>{mode === "signup" ? "START YOUR PRICE BOOK" : "WELCOME BACK"}</p><h2 id="auth-title">{mode === "signup" ? "Build faster quotes." : "Get back to work."}</h2></div></div>
          {mode === "signup" && <label>COMPANY NAME<input name="companyName" placeholder="Dudley Striping Co." minLength={2} required autoComplete="organization" /></label>}
          <label>EMAIL ADDRESS<input name="email" type="email" placeholder="you@company.com" required autoComplete="email" /></label>
          <label>PASSWORD<input name="password" type="password" placeholder="10+ characters" minLength={10} required autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-action" disabled={loading}>{loading ? "WORKING…" : mode === "signup" ? "CREATE MY ACCOUNT" : "SIGN IN"}<span>→</span></button>
          <button type="button" className="switch-auth" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}>{mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}</button>
        </form>
      </div>
    </div>
  );
}

const DEMO_ADDRESS = "742 Evergreen Industrial Way, Sacramento, CA";

function ProductDemo() {
  const [phase, setPhase] = useState<"typing" | "ready" | "scanning" | "quote">("typing");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (phase !== "typing") return;
    if (address.length === DEMO_ADDRESS.length) {
      const readyTimer = window.setTimeout(() => setPhase("ready"), 300);
      return () => window.clearTimeout(readyTimer);
    }
    const typingTimer = window.setTimeout(() => setAddress(DEMO_ADDRESS.slice(0, address.length + 1)), address.length === 0 ? 650 : 33);
    return () => window.clearTimeout(typingTimer);
  }, [address, phase]);

  useEffect(() => {
    if (phase === "ready") {
      const scanTimer = window.setTimeout(() => setPhase("scanning"), 650);
      return () => window.clearTimeout(scanTimer);
    }
    if (phase === "scanning") {
      const quoteTimer = window.setTimeout(() => setPhase("quote"), 2500);
      return () => window.clearTimeout(quoteTimer);
    }
  }, [phase]);

  function replay() {
    setAddress("");
    setPhase("typing");
  }

  function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (address.trim()) setPhase("scanning");
  }

  return (
    <section className="product-demo" aria-label="Interactive quote workflow demonstration">
      <div className="demo-browser-bar"><span><i /><i /><i /></span><b>NEW QUOTE // DEMO</b><small>ILLUSTRATIVE WORKFLOW</small></div>
      <div className="demo-workspace">
        <div className="demo-address-panel">
          <div className="demo-step-label"><b>01</b><span>FIND THE LOT</span></div>
          <form className="demo-search" onSubmit={startScan}>
            <span aria-hidden="true">⌖</span>
            <input aria-label="Demo site address" value={address} onChange={(event) => { setAddress(event.target.value); setPhase("ready"); }} placeholder="Enter a property address" />
            <button disabled={!address.trim() || phase === "scanning"}>{phase === "scanning" ? "ANALYZING…" : "ANALYZE LOT"}</button>
          </form>
          <div className="demo-progress" aria-live="polite">
            <span className={phase !== "typing" ? "done" : "active"}><i>1</i> Address found</span>
            <b />
            <span className={phase === "scanning" ? "active" : phase === "quote" ? "done" : ""}><i>2</i> Lot measured</span>
            <b />
            <span className={phase === "quote" ? "done" : ""}><i>3</i> Quote ready</span>
          </div>
        </div>
        <div className="demo-output">
          <div className={`lot-canvas ${phase}`}>
            <div className="road-label">EVERGREEN INDUSTRIAL WAY</div>
            <div className="building"><span>742</span></div>
            <div className="island island-one" /><div className="island island-two" />
            <div className="parking-row row-one" />
            <div className="parking-row row-two" />
            <div className="parking-row row-three" />
            <div className="ada-space ada-one">ADA</div><div className="ada-space ada-two">ADA</div>
            <div className="lot-boundary"><i /><i /><i /><i /></div>
            {phase === "scanning" && <div className="scan-line"><span>MEASURING SITE</span></div>}
            {(phase === "scanning" || phase === "quote") && <div className="scan-hud"><span><i /> IMAGERY LOCKED</span><strong>{phase === "quote" ? "MEASUREMENT COMPLETE" : "SCANNING STRIPING LAYOUT"}</strong></div>}
            {phase === "quote" && <div className="map-summary"><div><b>84</b><span>STALLS</span></div><div><b>2</b><span>ADA</span></div><div><b>186</b><span>CURB LF</span></div></div>}
          </div>
          <div className={`quote-preview ${phase === "quote" ? "revealed" : ""}`}>
            <div className="quote-top"><span><BrandMark /> STRIPE PROS</span><b>PROPOSAL #SP-1042</b></div>
            <div className="quote-site"><small>PREPARED FOR</small><strong>Evergreen Distribution</strong><span>742 Evergreen Industrial Way · Sacramento, CA</span></div>
            <div className="quote-lines">
              <div><span>Standard stalls — restripe <small>84 × $5.00</small></span><b>$420.00</b></div>
              <div><span>ADA stalls + symbols <small>2 × $35.00</small></span><b>$70.00</b></div>
              <div><span>Curb paint <small>186 LF × $1.75</small></span><b>$325.50</b></div>
              <div><span>Mobilization <small>1 × $250.00</small></span><b>$250.00</b></div>
            </div>
            <div className="quote-total"><span>TOTAL PROPOSAL</span><strong>$1,065.50</strong></div>
            <div className="quote-ready"><span>✓</span><div><b>BRANDED PDF READY</b><small>Measurements, site map & pricing included</small></div></div>
          </div>
        </div>
      </div>
      <button className="replay-demo" onClick={replay}>↻ REPLAY DEMO</button>
    </section>
  );
}

function HomeScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [authMode, setAuthMode] = useState<"signup" | "signin" | null>(null);

  return (
    <main className="home-shell">
      <nav className="home-nav">
        <button className="wordmark wordmark-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><BrandMark /><span>STRIPE PROS</span></button>
        <div className="home-nav-links"><a href="#how-it-works">How it works</a><a href="#built-for-stripers">For stripers</a></div>
        <div className="home-nav-actions"><button className="home-login" onClick={() => setAuthMode("signin")}>Log in</button><button className="home-start" onClick={() => setAuthMode("signup")}>Get started <span>→</span></button></div>
      </nav>
      <section className="home-hero">
        <div className="hero-badge"><i /> PURPOSE-BUILT FOR PARKING LOT CONTRACTORS</div>
        <h1>From address to<br /><em>quote in minutes.</em></h1>
        <p>Measure the lot from your desk, price every stripe, and send a proposal that wins the job.</p>
        <div className="hero-actions"><button onClick={() => setAuthMode("signup")}>Start quoting free <span>→</span></button><a href="#product-demo">See how it works <span>↓</span></a></div>
      </section>
      <div id="product-demo"><ProductDemo /></div>
      <section className="workflow-section" id="how-it-works">
        <p className="section-kicker">THE WHOLE QUOTE. ONE WORKFLOW.</p>
        <h2>Drive less. Quote more.</h2>
        <div className="workflow-grid">
          <article><span>01</span><div className="workflow-icon address-icon">⌖</div><h3>Enter an address</h3><p>Open current aerial imagery for any customer site—right from your office.</p></article>
          <article><span>02</span><div className="workflow-icon measure-icon">⌗</div><h3>Measure the work</h3><p>Trace lots and curbs, count stalls, and keep every measurement attached to the quote.</p></article>
          <article><span>03</span><div className="workflow-icon quote-icon">$</div><h3>Send the proposal</h3><p>Your pricing becomes a clean, branded proposal with an annotated site map.</p></article>
        </div>
      </section>
      <section className="stripers-cta" id="built-for-stripers"><div><p>NO CRM BLOAT. NO GUESSWORK.</p><h2>Built for the people<br />who stripe the lot.</h2></div><button onClick={() => setAuthMode("signup")}>BUILD YOUR PRICE BOOK <span>→</span></button></section>
      <footer className="home-footer"><div className="wordmark"><BrandMark /><span>STRIPE PROS</span></div><p>Measurement-assisted quoting for parking lot striping contractors.</p><span>© 2026 STRIPE PROS</span></footer>
      {authMode && <AuthModal onAuthenticated={onAuthenticated} onClose={() => setAuthMode(null)} initialMode={authMode} />}
    </main>
  );
}

function Dashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [items, setItems] = useState<PriceItem[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All items");
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: PriceItem[] }>("/api/price-book").then((result) => setItems(result.items)).catch((caught) => setError(caught.message));
  }, []);

  const categories = useMemo(() => ["All items", ...Array.from(new Set(items.map((item) => item.category)))], [items]);
  const visible = filter === "All items" ? items : items.filter((item) => item.category === filter);

  async function update(id: string, patch: Partial<PriceItem>) {
    setSavingId(id);
    setError("");
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    try {
      const result = await api<{ item: PriceItem }>(`/api/price-book/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setItems((current) => current.map((item) => item.id === id ? result.item : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save changes.");
    } finally {
      setSavingId(null);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ item: PriceItem }>("/api/price-book", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"), category: form.get("category"), unit: form.get("unit"), unitPrice: form.get("unitPrice"),
          isActive: true, sortOrder: items.length ? Math.max(...items.map((item) => item.sortOrder)) + 10 : 10,
        }),
      });
      setItems((current) => [...current, result.item]);
      setAdding(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not add item."); }
  }

  return (
    <main className="dashboard-shell">
      <header className="app-header">
        <button className="wordmark wordmark-button" onClick={() => window.location.assign("/")}><BrandMark /><span>STRIPE PROS</span></button>
        <div className="header-center"><span className="status-dot" /> PRICE BOOK READY</div>
        <div className="account-chip"><div>{user.companyName.slice(0, 2).toUpperCase()}</div><span><strong>{user.companyName}</strong><small>{user.email}</small></span><button onClick={onSignOut} aria-label="Sign out">↗</button></div>
      </header>
      <aside className="sidebar">
        <p>WORKSPACE</p>
        <button disabled><span>01</span> QUOTES <b>SOON</b></button>
        <button className="active"><span>02</span> PRICE BOOK</button>
        <button disabled><span>03</span> CUSTOMERS <b>SOON</b></button>
        <p>ACCOUNT</p>
        <button disabled><span>04</span> SETTINGS <b>SOON</b></button>
        <div className="milestone"><strong>MILESTONE 01</strong><span>Account + pricing foundation</span><i><b /></i><small>1 OF 6</small></div>
      </aside>
      <section className="content">
        <div className="content-heading">
          <div><p className="eyebrow"><span /> YOUR NUMBERS</p><h1>Price book</h1><p>Set it once. Quote with confidence every time.</p></div>
          <button className="add-button" onClick={() => setAdding(true)}>＋ ADD LINE ITEM</button>
        </div>
        <div className="review-banner"><strong>REVIEW YOUR DEFAULTS</strong><span>These placeholder prices are a starting point. Update them to match your market before sending a quote.</span><b>21 SEEDED ITEMS</b></div>
        <div className="book-toolbar">
          <div className="filter-tabs">{categories.map((category) => <button key={category} onClick={() => setFilter(category)} className={filter === category ? "selected" : ""}>{category}</button>)}</div>
          <span>{visible.length} ITEMS</span>
        </div>
        {error && <p className="inline-error">{error}</p>}
        {adding && <form className="new-item" onSubmit={create}><input name="name" placeholder="Line item name" required /><input name="category" placeholder="Category" required /><select name="unit" defaultValue="each">{PRICE_UNITS.map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}</select><input name="unitPrice" type="number" min="0" step="0.01" placeholder="0.00" required /><button>ADD</button><button type="button" onClick={() => setAdding(false)}>CANCEL</button></form>}
        <div className="price-table">
          <div className="table-head"><span>LINE ITEM</span><span>CATEGORY</span><span>UNIT</span><span>PRICE</span><span>ACTIVE</span></div>
          {!items.length && !error ? <div className="loading-row">LOADING YOUR PRICE BOOK…</div> : visible.map((item) => (
            <div className={`price-row ${!item.isActive ? "inactive" : ""}`} key={item.id}>
              <div><span className="stripe-glyph" /> <input value={item.name} aria-label={`${item.name} name`} onChange={(event) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} onBlur={(event) => update(item.id, { name: event.target.value })} /></div>
              <span className={`category category-${item.category.toLowerCase()}`}>{item.category.toUpperCase()}</span>
              <span>{UNIT_LABELS[item.unit]}</span>
              <label className="price-input"><b>$</b><input type="number" min="0" step="0.01" value={item.unitPrice} aria-label={`${item.name} price`} onChange={(event) => setItems((current) => current.map((row) => row.id === item.id ? { ...row, unitPrice: event.target.value } : row))} onBlur={(event) => update(item.id, { unitPrice: event.target.value })} /><i>{savingId === item.id ? "…" : "✓"}</i></label>
              <button className={`toggle ${item.isActive ? "on" : ""}`} onClick={() => update(item.id, { isActive: !item.isActive })} aria-label={`${item.isActive ? "Deactivate" : "Activate"} ${item.name}`}><i /></button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export function StripeProsApp() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => { api<{ user: User }>("/api/auth/me").then((result) => setUser(result.user)).catch(() => {}).finally(() => setChecking(false)); }, []);
  if (checking) return <div className="boot-screen"><BrandMark /><span>LAYING OUT YOUR WORKSPACE</span></div>;
  if (!user) return <HomeScreen onAuthenticated={setUser} />;
  return <Dashboard user={user} onSignOut={async () => { await api("/api/auth/signout", { method: "POST" }); setUser(null); }} />;
}
