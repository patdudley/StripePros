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

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
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
        body: JSON.stringify({
          companyName: form.get("companyName"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      onAuthenticated(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not continue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <nav className="public-nav">
        <button className="wordmark wordmark-button" onClick={() => window.location.assign("/")}><BrandMark /><span>STRIPE PROS</span></button>
        <button className="nav-link" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
          {mode === "signup" ? "Sign in" : "Create account"}
        </button>
      </nav>
      <section className="auth-grid">
        <div className="auth-copy">
          <p className="eyebrow"><span /> BUILT FOR STRIPERS</p>
          <h1>Quote the lot.<br /><em>Win the job.</em></h1>
          <p className="lede">Turn an address into a precise, professional striping proposal—without burning half a day on a site visit.</p>
          <div className="proof-row">
            <div><strong>&lt; 5 min</strong><span>ADDRESS TO QUOTE</span></div>
            <div><strong>21</strong><span>STRIPING-NATIVE ITEMS</span></div>
            <div><strong>100%</strong><span>YOUR PRICING</span></div>
          </div>
        </div>
        <div className="auth-card-wrap">
          <div className="corner-label">M1 // ACCOUNT SETUP</div>
          <form className="auth-card" onSubmit={submit}>
            <div className="card-heading">
              <BrandMark />
              <div><p>{mode === "signup" ? "START YOUR PRICE BOOK" : "WELCOME BACK"}</p><h2>{mode === "signup" ? "Build faster quotes." : "Get back to work."}</h2></div>
            </div>
            {mode === "signup" && <label>COMPANY NAME<input name="companyName" placeholder="Dudley Striping Co." minLength={2} required autoComplete="organization" /></label>}
            <label>EMAIL ADDRESS<input name="email" type="email" placeholder="you@company.com" required autoComplete="email" /></label>
            <label>PASSWORD<input name="password" type="password" placeholder="10+ characters" minLength={10} required autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-action" disabled={loading}>{loading ? "WORKING…" : mode === "signup" ? "CREATE MY ACCOUNT" : "SIGN IN"}<span>→</span></button>
            <p className="form-foot">{mode === "signup" ? "Your account starts with 21 editable industry defaults." : "Single-user accounts keep every quote private."}</p>
          </form>
        </div>
      </section>
      <div className="ticker" aria-hidden="true"><span>MEASURE</span><b>◆</b><span>PRICE</span><b>◆</b><span>PROPOSE</span><b>◆</b><span>WIN</span><b>◆</b><span>MEASURE</span><b>◆</b><span>PRICE</span></div>
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
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <Dashboard user={user} onSignOut={async () => { await api("/api/auth/signout", { method: "POST" }); setUser(null); }} />;
}
