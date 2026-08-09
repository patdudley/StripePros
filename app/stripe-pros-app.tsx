"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Polygon as LeafletPolygon, TileLayer } from "leaflet";
import turfArea from "@turf/area";
import { PRICE_UNITS, UNIT_LABELS, type PriceUnit } from "@/lib/price-book";

type User = { id: string; email: string; companyName: string };
type GeocodeResult = { label: string; lat: number; lng: number };
type AddressSuggestion = GeocodeResult & { primary: string; secondary: string };
type MapImageryConfig = {
  provider: "esri" | "nearmap";
  tileUrl: string;
  maxZoom: number;
  coverageStatus: "available" | "unchecked" | "unconfigured" | "unavailable" | "error";
  captureDate: string | null;
  resolutionCm: number | null;
};
type DemoBoundary = LeafletPolygon & {
  pm: { enable(options?: Record<string, unknown>): void; disable(): void };
  toGeoJSON(): Parameters<typeof turfArea>[0];
};
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

function ProductDemo() {
  const demoMapElementRef = useRef<HTMLDivElement>(null);
  const demoMapRef = useRef<LeafletMap | null>(null);
  const demoLeafletRef = useRef<typeof import("leaflet") | null>(null);
  const demoTileLayerRef = useRef<TileLayer | null>(null);
  const demoBoundaryRef = useRef<DemoBoundary | null>(null);
  const demoScanZoomRef = useRef(19);
  const [phase, setPhase] = useState<"typing" | "scanning" | "quote">("typing");
  const [address, setAddress] = useState("");
  const [selectedSite, setSelectedSite] = useState<GeocodeResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [imageryDetail, setImageryDetail] = useState("STANDARD AERIAL · HD READY");
  const [boundaryEditing, setBoundaryEditing] = useState(false);
  const [lotArea, setLotArea] = useState(0);
  const [draftCounts, setDraftCounts] = useState({ stalls: 0, ada: 0, arrows: 0, curb: 0 });
  const suppressSuggestionsRef = useRef(false);

  useEffect(() => {
    if (!demoMapElementRef.current || demoMapRef.current) return;
    let active = true;
    let map: LeafletMap | null = null;
    void (async () => {
      const L = await import("leaflet");
      if (!active || !demoMapElementRef.current) return;
      demoLeafletRef.current = L;
      (window as unknown as { L: typeof L }).L = L;
      await import("@geoman-io/leaflet-geoman-free");
      map = L.map(demoMapElementRef.current, { center: [32.7849, -117.1258], zoom: 18, zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
      demoMapRef.current = map;
      demoTileLayerRef.current = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 19, crossOrigin: "anonymous", attribution: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" }).addTo(map);
      await configureDemoImagery();
    })();
    return () => { active = false; map?.remove(); demoMapRef.current = null; demoLeafletRef.current = null; demoTileLayerRef.current = null; demoBoundaryRef.current = null; };
  }, []);

  async function configureDemoImagery(site?: GeocodeResult) {
    const map = demoMapRef.current;
    const L = demoLeafletRef.current;
    if (!map || !L) return;
    try {
      const query = site ? `?lat=${encodeURIComponent(site.lat)}&lng=${encodeURIComponent(site.lng)}` : "";
      const response = await fetch(`/api/map-config${query}`);
      if (!response.ok) return;
      const config = await response.json() as MapImageryConfig;
      const nextLayer = L.tileLayer(config.tileUrl, {
        maxZoom: config.maxZoom,
        maxNativeZoom: config.maxZoom,
        crossOrigin: "anonymous",
        attribution: config.provider === "nearmap" ? "Aerial imagery © Nearmap" : "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      }).addTo(map) as TileLayer;
      if (demoTileLayerRef.current) map.removeLayer(demoTileLayerRef.current);
      demoTileLayerRef.current = nextLayer;
      demoScanZoomRef.current = config.maxZoom;
      if (config.provider === "nearmap") {
        const captured = config.captureDate ? ` · ${new Date(`${config.captureDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}` : "";
        const resolution = config.resolutionCm ? ` · ${config.resolutionCm} CM/PIXEL` : "";
        setImageryDetail(`NEARMAP HD${captured}${resolution}`);
      } else if (config.coverageStatus === "unavailable") {
        setImageryDetail("NO NEARMAP COVERAGE · STANDARD AERIAL");
      } else if (config.coverageStatus === "error") {
        setImageryDetail("HD IMAGERY UNAVAILABLE · STANDARD AERIAL");
      } else {
        setImageryDetail("STANDARD AERIAL · HD READY");
      }
    } catch { /* retain the current imagery layer */ }
  }

  useEffect(() => {
    if (phase === "scanning") {
      const quoteTimer = window.setTimeout(() => setPhase("quote"), 2500);
      return () => window.clearTimeout(quoteTimer);
    }
  }, [phase]);

  useEffect(() => {
    const query = address.trim();
    if (suppressSuggestionsRef.current) {
      suppressSuggestionsRef.current = false;
      return;
    }
    if (query.length < 3 || phase !== "typing") return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggesting(true);
      try {
        const result = await api<{ results: AddressSuggestion[] }>(`/api/geocode/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        setSuggestions(result.results);
        setActiveSuggestion(-1);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggesting(false);
      }
    }, 400);

    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [address, phase]);

  function replay() {
    setAddress("");
    setPhase("typing");
    setSelectedSite(null);
    setSearchError("");
    setSuggestions([]);
    setBoundaryEditing(false);
    setLotArea(0);
    setDraftCounts({ stalls: 0, ada: 0, arrows: 0, curb: 0 });
    if (demoBoundaryRef.current) demoMapRef.current?.removeLayer(demoBoundaryRef.current);
    demoBoundaryRef.current = null;
    demoMapRef.current?.flyTo([32.7849, -117.1258], 18, { duration: .8 });
  }

  function updateDemoBoundary(boundary: DemoBoundary, initializeCounts = false, countSite = selectedSite) {
    const map = demoMapRef.current;
    if (!map) return;
    const area = turfArea(boundary.toGeoJSON()) * 10.7639;
    const bounds = boundary.getBounds();
    const perimeter = 2 * (map.distance(bounds.getNorthWest(), bounds.getNorthEast()) + map.distance(bounds.getNorthWest(), bounds.getSouthWest())) * 3.28084;
    setLotArea(area);
    boundary.setTooltipContent(`${Math.round(area).toLocaleString("en-US")} SQ FT · DRAFT OUTLINE`);
    setDraftCounts((current) => {
      if (!initializeCounts) return { ...current, curb: Math.max(0, Math.round(perimeter)) };
      const seed = countSite ? Math.abs(Math.round(countSite.lat * 1000) + Math.round(countSite.lng * 1000)) : 0;
      const stalls = 24 + seed % 11;
      const ada = stalls <= 25 ? 1 : 2;
      return { stalls, ada, arrows: Math.max(1, Math.round(stalls / 16)), curb: Math.max(0, Math.round(perimeter)) };
    });
  }

  function createDemoBoundary(site: GeocodeResult) {
    const L = demoLeafletRef.current;
    const map = demoMapRef.current;
    if (!L || !map) return;
    if (demoBoundaryRef.current) map.removeLayer(demoBoundaryRef.current);
    const halfNorthSouthFeet = 95;
    const halfEastWestFeet = 135;
    const halfLat = halfNorthSouthFeet / 364000;
    const halfLng = halfEastWestFeet / (364000 * Math.cos(site.lat * Math.PI / 180));
    const boundary = L.polygon([
      [site.lat - halfLat, site.lng - halfLng],
      [site.lat - halfLat, site.lng + halfLng],
      [site.lat + halfLat, site.lng + halfLng],
      [site.lat + halfLat, site.lng - halfLng],
    ], { color: "#ffb400", weight: 4, fillColor: "#ffb400", fillOpacity: .22, dashArray: "10 7" }).addTo(map) as unknown as DemoBoundary;
    boundary.bindTooltip("DRAFT OUTLINE", { permanent: true, direction: "center", className: "demo-lot-tooltip" });
    boundary.on("pm:edit", () => updateDemoBoundary(boundary));
    demoBoundaryRef.current = boundary;
    updateDemoBoundary(boundary, true, site);
    map.fitBounds(boundary.getBounds(), { padding: [34, 34], maxZoom: demoScanZoomRef.current, animate: true });
  }

  function toggleDemoBoundary() {
    const boundary = demoBoundaryRef.current;
    if (!boundary) return;
    if (boundaryEditing) {
      boundary.pm.disable();
      boundary.setStyle({ dashArray: "10 7", fillOpacity: .22 });
      setBoundaryEditing(false);
    } else {
      boundary.pm.enable({ allowSelfIntersection: false, snappable: true });
      boundary.setStyle({ dashArray: undefined, fillOpacity: .28 });
      setBoundaryEditing(true);
    }
  }

  function adjustDraftCount(key: "stalls" | "ada" | "arrows", delta: number) {
    setDraftCounts((current) => ({ ...current, [key]: Math.max(0, current[key] + delta) }));
  }

  function selectSuggestion(site: AddressSuggestion) {
    suppressSuggestionsRef.current = true;
    setAddress(site.label);
    setSelectedSite(site);
    setSuggestions([]);
    setActiveSuggestion(-1);
    setSearchError("");
    demoMapRef.current?.flyTo([site.lat, site.lng], 18, { duration: 1.1 });
  }

  async function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address.trim() || searching) return;
    setSearching(true);
    setSearchError("");
    setSuggestions([]);
    try {
      const result = selectedSite ? null : await api<{ results: GeocodeResult[] }>(`/api/geocode?q=${encodeURIComponent(address)}`);
      const site = selectedSite ?? result?.results[0];
      if (!site) throw new Error("We could not find that address. Try including the city and state.");
      setSelectedSite(site);
      await configureDemoImagery(site);
      createDemoBoundary(site);
      setPhase("scanning");
    } catch (caught) {
      setPhase("typing");
      setSearchError(caught instanceof Error ? caught.message : "Could not find that property.");
    } finally {
      setSearching(false);
    }
  }

  const mockQuote = useMemo(() => {
    const total = draftCounts.stalls * 5 + draftCounts.ada * 35 + draftCounts.arrows * 15 + draftCounts.curb * 1.75 + 250;
    return { ...draftCounts, lotArea, total };
  }, [draftCounts, lotArea]);

  const propertyParts = selectedSite?.label.split(",").map((part) => part.trim()) ?? [];
  const startsWithStreetNumber = /^\d/.test(propertyParts[0] ?? "");
  const propertyName = startsWithStreetNumber ? `Property at ${propertyParts.slice(0, 2).join(" ")}` : propertyParts[0] || "Your customer property";
  const propertyLocation = propertyParts.slice(startsWithStreetNumber ? 2 : 1, startsWithStreetNumber ? 5 : 4).join(", ") || "Address ready to scan";

  return (
    <section className="product-demo" aria-label="Interactive quote workflow demonstration">
      <div className="demo-browser-bar"><span><i /><i /><i /></span><b>NEW QUOTE // DEMO</b><small>ILLUSTRATIVE WORKFLOW</small></div>
      <div className="demo-workspace">
        <div className="demo-three-blocks">
        <div className="demo-address-panel demo-stage-block">
          <div className="demo-step-label"><b>01</b><span>TYPE IN THE ADDRESS</span></div>
          <h3>Start with the property.</h3>
          <p>Enter any commercial address and open current aerial imagery without leaving your desk.</p>
          <form className="demo-search" onSubmit={startScan}>
            <span aria-hidden="true">⌖</span>
            <input aria-label="Demo site address" role="combobox" aria-autocomplete="list" aria-expanded={Boolean(suggestions.length)} aria-controls="demo-address-suggestions" aria-activedescendant={activeSuggestion >= 0 ? `demo-suggestion-${activeSuggestion}` : undefined} value={address} onChange={(event) => { setAddress(event.target.value); setPhase("typing"); setSelectedSite(null); setSearchError(""); setSuggestions([]); }} onKeyDown={(event) => {
              if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setActiveSuggestion((current) => Math.min(current + 1, suggestions.length - 1)); }
              if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setActiveSuggestion((current) => Math.max(current - 1, 0)); }
              if (event.key === "Enter" && activeSuggestion >= 0) { event.preventDefault(); selectSuggestion(suggestions[activeSuggestion]); }
              if (event.key === "Escape") { setSuggestions([]); setActiveSuggestion(-1); }
            }} placeholder="Try 737 Pearl St, La Jolla, CA" autoComplete="off" />
            <button disabled={!address.trim() || searching || phase === "scanning"}>{searching ? "FINDING ADDRESS…" : phase === "scanning" ? "ANALYZING…" : "ANALYZE LOT"}</button>
            {(suggesting || suggestions.length > 0) && <div className="demo-suggestions" id="demo-address-suggestions" role="listbox">
              {suggesting && !suggestions.length ? <span>SEARCHING ADDRESSES…</span> : suggestions.map((suggestion, index) => <button id={`demo-suggestion-${index}`} role="option" aria-selected={index === activeSuggestion} className={index === activeSuggestion ? "active" : ""} type="button" key={`${suggestion.lat}-${suggestion.lng}-${index}`} onMouseDown={(event) => event.preventDefault()} onClick={() => selectSuggestion(suggestion)}><i>⌖</i><span><strong>{suggestion.primary}</strong><small>{suggestion.secondary}</small></span></button>)}
            </div>}
          </form>
          {searchError && <p className="demo-search-error" role="alert">{searchError}</p>}
          <div className="demo-progress" aria-live="polite">
            <span className={selectedSite ? "done" : "active"}><i>1</i> Address found</span>
            <b />
            <span className={phase === "scanning" ? "active" : phase === "quote" ? "done" : ""}><i>2</i> Lot measured</span>
            <b />
            <span className={phase === "quote" ? "done" : ""}><i>3</i> Quote ready</span>
          </div>
          <div className={`demo-address-found ${selectedSite ? "matched" : ""}`}><span>{selectedSite ? "PROPERTY MATCH" : "LIVE ADDRESS DEMO"}</span><strong>{propertyName}</strong><small>{propertyLocation}</small></div>
        </div>
          <div className={`lot-canvas demo-stage-block ${phase} ${boundaryEditing ? "editing" : ""}`}>
            <div ref={demoMapElementRef} className={`demo-real-map ${boundaryEditing ? "editing" : ""}`} aria-label={`Aerial imagery of ${propertyName}`} />
            <div className="demo-step-label demo-map-label"><b>02</b><span>SCAN THE PARKING LOT</span></div>
            {phase === "scanning" && <div className="scan-line"><span>MEASURING SITE</span></div>}
            {(phase === "scanning" || phase === "quote") && <div className="scan-hud"><span><i /> {imageryDetail}</span><strong>{phase === "quote" ? "DRAFT SCAN — VERIFY BELOW" : "SCANNING STRIPING LAYOUT"}</strong></div>}
            {phase === "quote" && <><button className="edit-demo-boundary" onClick={toggleDemoBoundary}>{boundaryEditing ? "SAVE LOT OUTLINE" : "EDIT LOT OUTLINE"}</button><div className="map-summary editable"><div><span>STALLS</span><b><button onClick={() => adjustDraftCount("stalls", -1)} aria-label="Remove one stall">−</button>{mockQuote.stalls}<button onClick={() => adjustDraftCount("stalls", 1)} aria-label="Add one stall">＋</button></b></div><div><span>ADA</span><b><button onClick={() => adjustDraftCount("ada", -1)} aria-label="Remove one ADA stall">−</button>{mockQuote.ada}<button onClick={() => adjustDraftCount("ada", 1)} aria-label="Add one ADA stall">＋</button></b></div><div><span>ARROWS</span><b><button onClick={() => adjustDraftCount("arrows", -1)} aria-label="Remove one directional arrow">−</button>{mockQuote.arrows}<button onClick={() => adjustDraftCount("arrows", 1)} aria-label="Add one directional arrow">＋</button></b></div></div></>}
          </div>
          <div className={`quote-preview demo-stage-block ${phase === "quote" ? "revealed" : ""}`}>
            <div className="demo-step-label demo-quote-label"><b>03</b><span>GENERATE THE QUOTE</span></div>
            <div className="quote-top"><span><BrandMark /> STRIPE PROS</span><b>EDITABLE DRAFT</b></div>
            <div className="quote-site"><small>PREPARED FOR</small><strong>{propertyName}</strong><span>{propertyLocation}</span></div>
            <div className="quote-lines">
              <div><span>Standard stalls — restripe <small>{mockQuote.stalls} × $5.00</small></span><b>${(mockQuote.stalls * 5).toFixed(2)}</b></div>
              <div><span>ADA stalls + symbols <small>{mockQuote.ada} × $35.00</small></span><b>${(mockQuote.ada * 35).toFixed(2)}</b></div>
              <div><span>Directional arrows <small>{mockQuote.arrows} × $15.00</small></span><b>${(mockQuote.arrows * 15).toFixed(2)}</b></div>
              <div><span>Curb paint <small>{mockQuote.curb} LF × $1.75</small></span><b>${(mockQuote.curb * 1.75).toFixed(2)}</b></div>
              <div><span>Mobilization <small>1 × $250.00</small></span><b>$250.00</b></div>
            </div>
            <div className="quote-total"><span>DRAFT TOTAL</span><strong>${mockQuote.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="quote-ready"><span>!</span><div><b>VERIFY BEFORE SENDING</b><small>Edit the lot outline and every detected count</small></div></div>
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
        <div className="home-nav-links"><a href="#how-it-works">How it works</a><a href="/workspace">Live workspace</a><a href="#pricing">Pricing</a></div>
        <div className="home-nav-actions"><button className="home-login" onClick={() => setAuthMode("signin")}>Log in</button><button className="home-start" onClick={() => setAuthMode("signup")}>Get started <span>→</span></button></div>
      </nav>
      <section className="home-hero">
        <div className="hero-badge"><i /> PURPOSE-BUILT FOR PARKING LOT CONTRACTORS</div>
        <h1>From address to<br /><em>quote in minutes.</em></h1>
        <p>Measure the lot from your desk, price every stripe, and send a proposal that wins the job.</p>
        <div className="hero-actions"><a className="hero-workspace-action" href="/workspace">Open the live workspace <span>→</span></a><a href="#product-demo">See how it works <span>↓</span></a></div>
      </section>
      <div id="product-demo"><ProductDemo /></div>
      <section className="workflow-section" id="how-it-works">
        <p className="section-kicker">THE WHOLE QUOTE. ONE WORKFLOW.</p>
        <h2>Drive less. Quote more.</h2>
        <div className="workflow-grid">
          <article><span>01</span><div className="workflow-icon address-icon">⌖</div><h3>Enter an address</h3><p>Open current aerial imagery for any customer site—right from your office.</p></article>
          <article><span>02</span><div className="workflow-icon scan-icon">⌗</div><h3>Scan the parking lot</h3><p>Measure stalls, lines, curbs, and markings directly on the aerial map.</p></article>
          <article><span>03</span><div className="workflow-icon quote-icon">$</div><h3>Send the proposal</h3><p>Your pricing becomes a clean, branded proposal with an annotated site map.</p></article>
        </div>
      </section>
      <section className="pricing-section" id="pricing">
        <div className="pricing-heading"><div><p>SIMPLE PRICING. START WITH REAL WORK.</p><h2>Five quotes free.<br /><em>Then grow your way.</em></h2></div><span>Made by stripers. For stripers.</span></div>
        <div className="pricing-grid">
          <article className="pricing-card"><span>FREE TRIAL</span><h3>Try it on five jobs.</h3><div className="pricing-price"><strong>$0</strong><small>FIRST 5 QUOTES</small></div><ul><li>Five complete quote previews</li><li>Editable aerial lot takeoffs</li><li>Stall, ADA, and marking counts</li></ul><button onClick={() => setAuthMode("signup")}>START FREE <b>→</b></button></article>
          <article className="pricing-card starter"><span>STARTER</span><h3>For the owner-operator.</h3><div className="pricing-price"><strong>$25</strong><small>PER MONTH</small></div><ul><li>Unlimited quote creation</li><li>Branded proposal exports</li><li>Saved estimates and price book</li></ul><button onClick={() => setAuthMode("signup")}>CHOOSE STARTER <b>→</b></button></article>
          <article className="pricing-card scale"><span>SCALE</span><h3>For growing striping crews.</h3><div className="pricing-price"><strong>$100</strong><small>PER MONTH</small></div><ul><li>Everything in Starter</li><li>Team and workflow integrations</li><li>Priority onboarding and support</li></ul><button onClick={() => setAuthMode("signup")}>CHOOSE SCALE <b>→</b></button></article>
        </div>
        <p className="pricing-note">No card required for your first five quotes. Cancel a paid plan anytime.</p>
      </section>
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
