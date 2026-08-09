"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Layer as LeafletLayer, TileLayer } from "leaflet";
import Link from "next/link";
import turfArea from "@turf/area";
import turfLength from "@turf/length";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toPng } from "html-to-image";
import { calculateQuote } from "@/lib/quote-math";
import { activateTileLayer } from "@/lib/map-imagery";

type Measurement = {
  id: string;
  label: string;
  kind: "area" | "length" | "count";
  value: number;
  unit: "sqft" | "LF" | "each";
  linkedItem: "sealcoat" | "curb" | "stalls" | "lot";
};

type QuoteItem = {
  id: string;
  name: string;
  category: "Striping" | "Surface" | "Job";
  unit: string;
  quantity: number;
  unitPrice: number;
};

type GeocodeResult = { label: string; lat: number; lng: number };
type MapImageryConfig = {
  provider: "esri" | "mapbox" | "nearmap";
  tileUrl: string;
  maxZoom: number;
  coverageStatus: "available" | "unchecked" | "unconfigured" | "unavailable" | "error";
  captureDate: string | null;
  resolutionCm: number | null;
};
type SavedEstimate = { id: string; address: string; total: number; measurements: number; updatedAt: string };
type IntegrationStatus = { jobber: boolean; quickbooks: boolean; hubspot: boolean; webhook: boolean };
type DrawLayer = LeafletLayer & { toGeoJSON(): Parameters<typeof turfArea>[0] };
type EditableDrawLayer = DrawLayer & {
  getBounds(): import("leaflet").LatLngBounds;
  getLatLngs(): Array<Array<{ lat: number; lng: number }>>;
  setStyle(options: Record<string, unknown>): void;
  on(event: string, handler: () => void): EditableDrawLayer;
  pm: { enable(options?: Record<string, unknown>): void; disable(): void };
};
type DrawMode = "Polygon" | "Line" | "Marker";
type ScanState = "idle" | "ready" | "selecting" | "active";
type GeomanMap = LeafletMap & { pm: { enableDraw(shape: DrawMode, options?: Record<string, unknown>): void; disableDraw(): void } };
type LotDimensions = { length: number; width: number; area: number; perimeter: number };

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function CountAdjuster({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="count-adjuster"><span>{label}</span><div><button onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Remove one ${label}`}>−</button><input aria-label={label} type="number" min="0" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} /><button onClick={() => onChange(value + 1)} aria-label={`Add one ${label}`}>＋</button></div></div>;
}

function IntegrationHub({ address, total, itemCount }: { address: string; total: number; itemCount: number }) {
  const [status, setStatus] = useState<IntegrationStatus>({ jobber: false, quickbooks: false, hubspot: false, webhook: false });
  const [sending, setSending] = useState<"hubspot" | "webhook" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/integrations/status").then((response) => response.json()).then((data: IntegrationStatus) => { if (active) setStatus(data); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function exportEstimate(provider: "hubspot" | "webhook") {
    setSending(provider);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, address, total, itemCount }) });
      const result = await response.json() as { message?: string; error?: string };
      setMessage(response.ok ? result.message || "Estimate exported." : result.error || "Export failed.");
    } catch { setMessage("The integration could not be reached."); }
    finally { setSending(null); }
  }

  return <section className="workspace-list-view integration-view">
    <header><div><p>CONNECTED WORKFLOW</p><h1>Integrations</h1></div><span className="integration-research-badge">RESEARCHED FOR PAVEMENT CONTRACTORS</span></header>
    <div className="integration-intro"><strong>Quote here. Run the job where your team already works.</strong><p>Stripe Pros keeps takeoff and pricing focused, then hands approved work to field-service, CRM, and accounting systems.</p></div>
    <div className="integration-grid">
      <article className="integration-card recommended"><div className="integration-rank">01</div><div className="integration-logo jobber-logo">J</div><div className="integration-card-copy"><span>BEST FIELD-SERVICE FIT</span><h2>Jobber</h2><p>Customers, quotes, jobs, scheduling, crews, invoices, and client communications. Jobber specifically markets a paving workflow and exposes a documented GraphQL/OAuth API.</p><div className="integration-tags"><b>CUSTOMERS</b><b>JOBS</b><b>SCHEDULE</b><b>INVOICES</b></div></div><div className="integration-action"><i className={status.jobber ? "ready" : ""} />{status.jobber ? "APP CREDENTIALS READY" : "OAUTH APP REQUIRED"}<small>Authorization flow activates after a Jobber developer app is registered.</small></div></article>
      <article className="integration-card"><div className="integration-rank">02</div><div className="integration-logo qb-logo">qb</div><div className="integration-card-copy"><span>ACCOUNTING STANDARD</span><h2>QuickBooks Online</h2><p>Send approved customers, service items, and invoices to the accounting system most contractors already give their bookkeeper.</p><div className="integration-tags"><b>CUSTOMERS</b><b>ITEMS</b><b>INVOICES</b><b>PAYMENTS</b></div></div><div className="integration-action"><i className={status.quickbooks ? "ready" : ""} />{status.quickbooks ? "APP CREDENTIALS READY" : "INTUIT APP REQUIRED"}<small>Requires an Intuit developer app and company authorization.</small></div></article>
      <article className="integration-card"><div className="integration-rank">03</div><div className="integration-logo hubspot-logo">H</div><div className="integration-card-copy"><span>BEST SALES CRM</span><h2>HubSpot</h2><p>Create a deal from the current estimate for commercial property-manager follow-up, pipeline reporting, and sales automation.</p><div className="integration-tags"><b>CONTACTS</b><b>COMPANIES</b><b>DEALS</b></div></div><div className="integration-action">{status.hubspot ? <button onClick={() => void exportEstimate("hubspot")} disabled={sending === "hubspot"}>{sending === "hubspot" ? "SENDING…" : `SEND ${currency.format(total)} DEAL →`}</button> : <><i />PRIVATE APP TOKEN NEEDED<small>Add the token to enable one-click deal export.</small></>}</div></article>
      <article className="integration-card"><div className="integration-rank">04</div><div className="integration-logo webhook-logo">↗</div><div className="integration-card-copy"><span>WIDEST COMPATIBILITY</span><h2>Zapier / Make webhook</h2><p>Send an estimate-ready event to QuoteIQ, Projul, Monday, Airtable, or another system through an automation webhook.</p><div className="integration-tags"><b>ESTIMATE EVENT</b><b>8,000+ APPS</b></div></div><div className="integration-action">{status.webhook ? <button onClick={() => void exportEstimate("webhook")} disabled={sending === "webhook"}>{sending === "webhook" ? "SENDING…" : "SEND TEST ESTIMATE →"}</button> : <><i />WEBHOOK URL NEEDED<small>Paste a Zapier or Make catch-hook URL in site settings.</small></>}</div></article>
    </div>
    {message && <p className="integration-message">{message}</p>}
    <div className="partner-strip"><div><span>PARTNER ACCESS NEEDED</span><strong>Bitumio · PROcru · PavementSoft · QuoteIQ full CRM sync</strong></div><p>These purpose-built pavement platforms do not expose a complete public CRM API. Stripe Pros can add native adapters when their teams provide partner credentials or API documentation.</p></div>
  </section>;
}

const SAN_DIEGO_LOT = {
  address: "Snapdragon Stadium — West Parking Lot, 2101 Stadium Way, San Diego, CA 92108",
  center: [32.7849, -117.1258] as [number, number],
};

const ESRI_IMAGERY_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function QuoteWorkspace() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseLayerRef = useRef<TileLayer | null>(null);
  const imagerySignatureRef = useRef(`esri:${ESRI_IMAGERY_URL}:19`);
  const labelLayerRef = useRef<TileLayer | null>(null);
  const imageryMaxZoomRef = useRef(19);
  const layerByMeasurementRef = useRef(new Map<string, LeafletLayer>());
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const scanBoundaryRef = useRef<EditableDrawLayer | null>(null);
  const scanBoundaryMeasurementIdRef = useRef<string | null>(null);
  const selectingBoundaryRef = useRef(false);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [mapStyle, setMapStyle] = useState<"aerial" | "street">("aerial");
  const [imageryInfo, setImageryInfo] = useState({ provider: "esri" as "esri" | "mapbox" | "nearmap", label: "ESRI STANDARD AERIAL", detail: "MAPBOX READY", maxZoom: 19 });
  const [view, setView] = useState<"takeoff" | "saved" | "customers" | "integrations">("takeoff");
  const [address, setAddress] = useState(SAN_DIEGO_LOT.address);
  const [siteAddress, setSiteAddress] = useState(SAN_DIEGO_LOT.address);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [selectedSite, setSelectedSite] = useState<GeocodeResult | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [standardStalls, setStandardStalls] = useState(84);
  const [adaStalls, setAdaStalls] = useState(2);
  const [crosswalks, setCrosswalks] = useState(1);
  const [arrows, setArrows] = useState(4);
  const [stopBars, setStopBars] = useState(2);
  const [lotDimensions, setLotDimensions] = useState<LotDimensions | null>(null);
  const [boundaryEditing, setBoundaryEditing] = useState(false);
  const [scanVerified, setScanVerified] = useState(false);
  const [material, setMaterial] = useState<"paint" | "thermoplastic">("paint");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [saved, setSaved] = useState<SavedEstimate[]>([]);
  const [prices, setPrices] = useState({ stalls: 5, ada: 35, crosswalks: 75, arrows: 15, stopBars: 3, curb: 1.75, sealcoat: 0.16, mobilization: 250 });

  useEffect(() => {
    const stored = window.localStorage.getItem("stripepros_demo_estimates");
    if (!stored) return;
    const loadSaved = window.setTimeout(() => {
      try { setSaved(JSON.parse(stored) as SavedEstimate[]); } catch { /* ignore invalid local demo state */ }
    }, 0);
    return () => window.clearTimeout(loadSaved);
  }, []);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let active = true;
    let map: LeafletMap | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (!active || !mapElementRef.current) return;
      leafletRef.current = L;
      (window as unknown as { L: typeof L }).L = L;
      await import("@geoman-io/leaflet-geoman-free");

      map = L.map(mapElementRef.current, { center: SAN_DIEGO_LOT.center, zoom: 18, zoomControl: false, zoomSnap: .25 });
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);

      baseLayerRef.current = L.tileLayer(ESRI_IMAGERY_URL, {
        maxZoom: 19,
        maxNativeZoom: 19,
        crossOrigin: "anonymous",
        attribution: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      }).addTo(map) as TileLayer;

      labelLayerRef.current = L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        maxNativeZoom: 19,
        crossOrigin: "anonymous",
        attribution: "Labels © Esri",
        pane: "overlayPane",
      }).addTo(map) as TileLayer;

      await loadAerialImagery();

      L.marker(SAN_DIEGO_LOT.center, {
        icon: L.divIcon({ className: "site-pin", html: "<span></span>", iconSize: [30, 38], iconAnchor: [15, 36] }),
        interactive: false,
      }).addTo(map);

      map.on("pm:create", (rawEvent) => {
        const event = rawEvent as unknown as { shape: string; layer: DrawLayer };
        if (event.shape === "Polygon" && selectingBoundaryRef.current) {
          const boundary = event.layer as EditableDrawLayer;
          selectingBoundaryRef.current = false;
          boundary.setStyle({ color: "#ffb400", weight: 3, fillColor: "#ffb400", fillOpacity: .2, dashArray: "8 6" });
          scanBoundaryRef.current = boundary;
          boundary.on("pm:edit", () => {
            updateScannedBoundary(boundary);
            setScanVerified(false);
            setExportMessage("Boundary updated. Review the lot dimensions and enter each striping count before exporting.");
          });
          updateScannedBoundary(boundary);
          setScanState("active");
          setBoundaryEditing(false);
          setScanVerified(false);
          setExportMessage("Lot selected. Enter the stalls, ADA spaces, crosswalks, arrows, and stop bars you can see.");
          (map as GeomanMap).pm.disableDraw();
          setDrawMode(null);
          map.fitBounds(boundary.getBounds(), { padding: [54, 54], maxZoom: imageryMaxZoomRef.current, animate: true });
          return;
        }
        const geojson = event.layer.toGeoJSON();
        const id = crypto.randomUUID();
        layerByMeasurementRef.current.set(id, event.layer);
        if (event.shape === "Polygon") {
          const value = turfArea(geojson) * 10.7639;
          setMeasurements((current) => [...current, { id, label: `Paved area ${current.filter((item) => item.kind === "area").length + 1}`, kind: "area", value, unit: "sqft", linkedItem: "sealcoat" }]);
        } else if (event.shape === "Line") {
          const value = turfLength(geojson as Parameters<typeof turfLength>[0], { units: "feet" });
          setMeasurements((current) => [...current, { id, label: `Curb run ${current.filter((item) => item.kind === "length").length + 1}`, kind: "length", value, unit: "LF", linkedItem: "curb" }]);
        } else if (event.shape === "Marker") {
          const marker = event.layer as unknown as { setIcon(icon: unknown): void };
          marker.setIcon(L.divIcon({ className: "count-pin", html: "1", iconSize: [24, 24], iconAnchor: [12, 12] }));
          setMeasurements((current) => [...current, { id, label: `Stall marker ${current.filter((item) => item.kind === "count").length + 1}`, kind: "count", value: 1, unit: "each", linkedItem: "stalls" }]);
        }
        (map as GeomanMap).pm.disableDraw();
        setDrawMode(null);
        setScanVerified(false);
      });
    })();

    return () => {
      active = false;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  async function loadAerialImagery(site?: GeocodeResult) {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    try {
      const query = site ? `?lat=${encodeURIComponent(site.lat)}&lng=${encodeURIComponent(site.lng)}` : "";
      const response = await fetch(`/api/map-config${query}`);
      if (!response.ok) return;
      const config = await response.json() as MapImageryConfig;
      const signature = `${config.provider}:${config.tileUrl}:${config.maxZoom}`;
      if (signature !== imagerySignatureRef.current) {
        const nextLayer = L.tileLayer(config.tileUrl, {
          maxZoom: config.maxZoom,
          maxNativeZoom: config.maxZoom,
          crossOrigin: "anonymous",
          attribution: config.provider === "nearmap" ? "Aerial imagery © Nearmap" : config.provider === "mapbox" ? "Imagery © Mapbox" : "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        }) as TileLayer;
        const loaded = await activateTileLayer(map, nextLayer, baseLayerRef.current);
        if (!loaded) {
          imageryMaxZoomRef.current = 19;
          setImageryInfo({ provider: "esri", label: "ESRI STANDARD AERIAL", detail: `${config.provider === "mapbox" ? "MAPBOX" : "HD SERVICE"} UNAVAILABLE`, maxZoom: 19 });
          return;
        }
        baseLayerRef.current = nextLayer;
        imagerySignatureRef.current = signature;
      }
      imageryMaxZoomRef.current = config.maxZoom;
      if (labelLayerRef.current) {
        if (config.provider !== "esri" && map.hasLayer(labelLayerRef.current)) map.removeLayer(labelLayerRef.current);
        if (config.provider === "esri" && !map.hasLayer(labelLayerRef.current)) labelLayerRef.current.addTo(map);
      }
      if (config.provider === "mapbox") {
        setImageryInfo({ provider: "mapbox", label: "MAPBOX SATELLITE HD", detail: "HIGH-DPI AERIAL · UP TO Z21", maxZoom: config.maxZoom });
      } else if (config.provider === "nearmap") {
        const captured = config.captureDate ? new Date(`${config.captureDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase() : "LATEST SURVEY";
        const resolution = config.resolutionCm ? `${config.resolutionCm} CM/PIXEL` : `NATIVE Z${config.maxZoom}`;
        setImageryInfo({ provider: "nearmap", label: "NEARMAP VERTICAL HD", detail: `${captured} · ${resolution}`, maxZoom: config.maxZoom });
      } else {
        const detail = config.coverageStatus === "unavailable" ? "NO PREMIUM COVERAGE" : config.coverageStatus === "error" ? "HD SERVICE UNAVAILABLE" : "MAPBOX READY";
        setImageryInfo({ provider: "esri", label: "ESRI STANDARD AERIAL", detail, maxZoom: 19 });
      }
    } catch { /* retain the current imagery layer */ }
  }

  const mapCounts = useMemo(() => ({
    stalls: measurements.filter((item) => item.linkedItem === "stalls").reduce((sum, item) => sum + item.value, 0),
    curb: measurements.filter((item) => item.linkedItem === "curb").reduce((sum, item) => sum + item.value, 0),
    sealcoat: measurements.filter((item) => item.linkedItem === "sealcoat").reduce((sum, item) => sum + item.value, 0),
    lot: measurements.filter((item) => item.linkedItem === "lot").reduce((sum, item) => sum + item.value, 0),
  }), [measurements]);
  const hasVerifiedScope = Boolean(
    mapCounts.stalls || mapCounts.curb || mapCounts.sealcoat || mapCounts.lot || standardStalls || adaStalls || crosswalks || arrows || stopBars,
  );
  const canExport = hasVerifiedScope && (scanState !== "active" || scanVerified);

  const quoteItems = useMemo<QuoteItem[]>(() => [
    { id: "stalls", name: "Standard stalls — restripe", category: "Striping", unit: "each", quantity: standardStalls + mapCounts.stalls, unitPrice: prices.stalls },
    { id: "ada", name: "ADA stalls + symbols", category: "Striping", unit: "each", quantity: adaStalls, unitPrice: prices.ada },
    { id: "crosswalks", name: "Crosswalks / hatch zones", category: "Striping", unit: "each", quantity: crosswalks, unitPrice: prices.crosswalks },
    { id: "arrows", name: "Directional arrows", category: "Striping", unit: "each", quantity: arrows, unitPrice: prices.arrows },
    { id: "stopBars", name: "Stop bars", category: "Striping", unit: "LF", quantity: stopBars * 12, unitPrice: prices.stopBars },
    { id: "curb", name: "Curb paint", category: "Striping", unit: "LF", quantity: mapCounts.curb, unitPrice: prices.curb },
    { id: "sealcoat", name: "Sealcoat — single coat", category: "Surface", unit: "sqft", quantity: mapCounts.sealcoat, unitPrice: prices.sealcoat },
    { id: "mobilization", name: "Mobilization", category: "Job", unit: "flat", quantity: hasVerifiedScope ? 1 : 0, unitPrice: prices.mobilization },
  ].filter((item) => item.quantity > 0), [adaStalls, arrows, crosswalks, hasVerifiedScope, mapCounts, prices, standardStalls, stopBars]);

  const materialMultiplier = material === "thermoplastic" ? 2.8 : 1;
  const calculation = useMemo(() => calculateQuote(quoteItems, materialMultiplier, 450), [materialMultiplier, quoteItems]);

  async function searchAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setSearchError("");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      const data = await response.json() as { results?: GeocodeResult[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Address search failed.");
      setResults(data.results ?? []);
      if (data.results?.[0]) selectAddress(data.results[0]);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Address search failed.");
    } finally {
      setSearching(false);
    }
  }

  function updateScannedBoundary(layer: EditableDrawLayer) {
    const map = mapRef.current;
    if (!map) return;
    const geojson = layer.toGeoJSON();
    const area = turfArea(geojson) * 10.7639;
    const bounds = layer.getBounds();
    const northWest = bounds.getNorthWest();
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    const horizontal = map.distance(northWest, northEast) * 3.28084;
    const vertical = map.distance(northWest, southWest) * 3.28084;
    const perimeter = (horizontal + vertical) * 2;
    const dimensions = {
      length: Math.max(horizontal, vertical),
      width: Math.min(horizontal, vertical),
      area,
      perimeter,
    };
    setLotDimensions(dimensions);

    const existingId = scanBoundaryMeasurementIdRef.current;
    if (existingId) {
      setMeasurements((current) => current.map((measurement) => measurement.id === existingId ? { ...measurement, value: area } : measurement));
    } else {
      const id = crypto.randomUUID();
      scanBoundaryMeasurementIdRef.current = id;
      layerByMeasurementRef.current.set(id, layer);
      setMeasurements((current) => [...current, { id, label: "Estimated lot boundary", kind: "area", value: area, unit: "sqft", linkedItem: "lot" }]);
    }

  }

  function selectAddress(result: GeocodeResult) {
    setAddress(result.label);
    setSiteAddress(result.label);
    setSelectedSite(result);
    setScanState("ready");
    setScanVerified(false);
    setResults([]);
    layerByMeasurementRef.current.forEach((layer) => mapRef.current?.removeLayer(layer));
    layerByMeasurementRef.current.clear();
    setMeasurements([]);
    setStandardStalls(0);
    setAdaStalls(0);
    setCrosswalks(0);
    setArrows(0);
    setStopBars(0);
    setLotDimensions(null);
    setBoundaryEditing(false);
    selectingBoundaryRef.current = false;
    scanBoundaryRef.current = null;
    scanBoundaryMeasurementIdRef.current = null;
    setExportMessage("New site loaded. Verify the work boundary and count the lot before generating a proposal.");
    mapRef.current?.flyTo([result.lat, result.lng], 18, { duration: 1.2 });
    if (mapStyle === "aerial") void loadAerialImagery(result);
  }

  function beginLotSelection() {
    const map = mapRef.current as GeomanMap | null;
    if (!selectedSite || !map) return;
    layerByMeasurementRef.current.forEach((layer) => map.removeLayer(layer));
    layerByMeasurementRef.current.clear();
    setMeasurements([]);
    scanBoundaryMeasurementIdRef.current = null;
    scanBoundaryRef.current = null;
    setBoundaryEditing(false);
    setScanVerified(false);
    selectingBoundaryRef.current = true;
    setScanState("selecting");
    setExportMessage("Click each corner around the actual parking lot, then click the first point again to finish.");
    map.pm.disableDraw();
    map.pm.enableDraw("Polygon", { snappable: true, continueDrawing: false, allowSelfIntersection: false });
    setDrawMode("Polygon");
  }

  function cancelLotSelection() {
    const map = mapRef.current as GeomanMap | null;
    selectingBoundaryRef.current = false;
    map?.pm.disableDraw();
    setDrawMode(null);
    setScanState("ready");
    setExportMessage("Lot selection canceled. Start again when the property is positioned correctly.");
  }

  function toggleBoundaryEditing() {
    const boundary = scanBoundaryRef.current;
    if (!boundary) return;
    if (boundaryEditing) {
      boundary.pm.disable();
      boundary.setStyle({ dashArray: "8 6", fillOpacity: .2 });
      setBoundaryEditing(false);
      setExportMessage("Lot outline saved. Review the draft counts and pricing.");
    } else {
      boundary.pm.enable({ allowSelfIntersection: false, snappable: true });
      boundary.setStyle({ dashArray: undefined, fillOpacity: .28 });
      setBoundaryEditing(true);
      setScanVerified(false);
      setExportMessage("Drag any yellow corner to match the actual parking lot. Counts recalculate when you finish a change.");
    }
  }

  function confirmScan() {
    setScanVerified(true);
    setExportMessage("Scan verified. The corrected scope is ready to save or export as a proposal.");
  }

  function startDrawing(mode: DrawMode) {
    const map = mapRef.current as GeomanMap | null;
    if (!map) return;
    map.pm.disableDraw();
    if (drawMode === mode) {
      setDrawMode(null);
      return;
    }
    map.pm.enableDraw(mode, { snappable: true, continueDrawing: false });
    setDrawMode(mode);
  }

  async function switchMapStyle(style: "aerial" | "street") {
    const map = mapRef.current;
    if (!map || style === mapStyle) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    if (labelLayerRef.current && map.hasLayer(labelLayerRef.current)) map.removeLayer(labelLayerRef.current);
    const L = await import("leaflet");
    if (style === "street") {
      baseLayerRef.current = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 20,
        crossOrigin: "anonymous",
        attribution: "Map © Esri and contributors",
      }).addTo(map);
    } else {
      await loadAerialImagery(selectedSite ?? undefined);
    }
    setMapStyle(style);
  }

  function removeMeasurement(id: string) {
    const layer = layerByMeasurementRef.current.get(id);
    if (layer && mapRef.current) mapRef.current.removeLayer(layer);
    layerByMeasurementRef.current.delete(id);
    setMeasurements((current) => current.filter((measurement) => measurement.id !== id));
    setScanVerified(false);
    if (id === scanBoundaryMeasurementIdRef.current) {
      scanBoundaryRef.current = null;
      scanBoundaryMeasurementIdRef.current = null;
      setLotDimensions(null);
      setBoundaryEditing(false);
    }
  }

  function saveEstimate() {
    if (!canExport) {
      setExportMessage(scanState === "active" ? "Verify the corrected scan before saving this estimate." : "Count or measure the selected lot before saving an estimate.");
      return;
    }
    const estimate: SavedEstimate = {
      id: crypto.randomUUID(),
      address: siteAddress,
      total: calculation.total,
      measurements: measurements.length,
      updatedAt: new Date().toISOString(),
    };
    const next = [estimate, ...saved].slice(0, 20);
    setSaved(next);
    window.localStorage.setItem("stripepros_demo_estimates", JSON.stringify(next));
    setExportMessage("Draft saved on this device.");
  }

  async function exportProposal() {
    if (!canExport) {
      setExportMessage(scanState === "active" ? "Verify the corrected scan before generating a proposal." : "Count or measure the selected lot before generating a proposal.");
      return;
    }
    setExporting(true);
    setExportMessage("");
    let mapIncluded = true;
    try {
      const pdf = await PDFDocument.create();
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const amber = rgb(1, 0.706, 0);
      const ink = rgb(0.067, 0.067, 0.059);
      const page = pdf.addPage([612, 792]);
      page.drawRectangle({ x: 0, y: 690, width: 612, height: 102, color: amber });
      page.drawText("STRIPE PROS", { x: 42, y: 742, size: 24, font: bold, color: ink });
      page.drawText("PARKING LOT STRIPING PROPOSAL", { x: 42, y: 717, size: 9, font: bold, color: ink });
      page.drawText("Prepared for", { x: 42, y: 654, size: 8, font: bold, color: rgb(.42, .4, .36) });
      page.drawText("San Diego Stadium Operations", { x: 42, y: 630, size: 18, font: bold, color: ink });
      page.drawText(siteAddress.slice(0, 88), { x: 42, y: 612, size: 9, font: regular, color: rgb(.38, .37, .34) });

      let y = 565;
      page.drawText("SCOPE & PRICING", { x: 42, y, size: 9, font: bold, color: ink });
      y -= 22;
      for (const item of quoteItems) {
        const lineTotal = item.quantity * item.unitPrice * (item.category === "Striping" ? materialMultiplier : 1);
        page.drawText(item.name, { x: 42, y, size: 9, font: regular, color: ink });
        page.drawText(`${number.format(item.quantity)} ${item.unit} x ${currency.format(item.unitPrice)}`, { x: 310, y, size: 8, font: regular, color: rgb(.38, .37, .34) });
        page.drawText(currency.format(lineTotal), { x: 510, y, size: 9, font: bold, color: ink });
        page.drawLine({ start: { x: 42, y: y - 8 }, end: { x: 570, y: y - 8 }, thickness: .5, color: rgb(.86, .84, .79) });
        y -= 31;
      }
      if (materialMultiplier !== 1) {
        page.drawText(`Thermoplastic multiplier: ${materialMultiplier.toFixed(1)}x on Striping items`, { x: 42, y, size: 8, font: bold, color: rgb(.55, .38, 0) });
        y -= 22;
      }
      if (calculation.minimumApplied) {
        page.drawText(`Minimum job charge raises total to ${currency.format(calculation.total)}`, { x: 42, y, size: 8, font: bold, color: rgb(.55, .38, 0) });
        y -= 22;
      }
      page.drawRectangle({ x: 350, y: y - 20, width: 220, height: 52, color: ink });
      page.drawText("TOTAL PROPOSAL", { x: 365, y: y + 1, size: 8, font: bold, color: amber });
      page.drawText(currency.format(calculation.total), { x: 470, y: y - 2, size: 18, font: bold, color: rgb(1, 1, 1) });
      page.drawText("Valid for 30 days. Final field conditions must be verified before work begins.", { x: 42, y: 58, size: 7, font: regular, color: rgb(.42, .4, .36) });

      if (mapElementRef.current) {
        try {
          const dataUrl = await toPng(mapElementRef.current, { cacheBust: true, pixelRatio: 1 });
          const imageBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
          const mapImage = await pdf.embedPng(imageBytes);
          const mapPage = pdf.addPage([612, 792]);
          mapPage.drawText("ANNOTATED SITE TAKEOFF", { x: 42, y: 744, size: 13, font: bold, color: ink });
          mapPage.drawText(siteAddress.slice(0, 88), { x: 42, y: 724, size: 8, font: regular, color: rgb(.4, .38, .35) });
          mapPage.drawImage(mapImage, { x: 42, y: 275, width: 528, height: 420 });
          mapPage.drawText(`${measurements.length} mapped measurements included`, { x: 42, y: 250, size: 8, font: bold, color: ink });
        } catch {
          mapIncluded = false;
        }
      }

      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Stripe-Pros-Proposal-${new Date().toISOString().slice(0, 10)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportMessage(mapIncluded ? "Branded proposal downloaded." : "Proposal downloaded. Map image was omitted because the imagery provider blocked capture.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Could not generate the proposal.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="quote-workspace-shell">
      <header className="quote-app-header">
        <Link className="quote-brand" href="/"><BrandMark /><span>STRIPE PROS</span></Link>
        <div className="quote-header-site"><span>ESTIMATE</span><strong>San Diego Stadium Operations</strong><small>{siteAddress}</small></div>
        <div className="quote-header-actions"><span className="autosave-status"><i /> LOCAL DEMO</span><button onClick={saveEstimate} disabled={!canExport}>SAVE DRAFT</button><button className="export-button" onClick={exportProposal} disabled={exporting || !canExport}>{exporting ? "GENERATING…" : "EXPORT PROPOSAL"} <b>→</b></button></div>
      </header>
      <aside className="quote-sidebar">
        <p>WORKSPACE</p>
        <button className={view === "takeoff" ? "active" : ""} onClick={() => setView("takeoff")}><span>⌖</span> TAKEOFF</button>
        <button className={view === "saved" ? "active" : ""} onClick={() => setView("saved")}><span>▤</span> ESTIMATES <b>{saved.length}</b></button>
        <button className={view === "customers" ? "active" : ""} onClick={() => setView("customers")}><span>◎</span> CUSTOMERS</button>
        <button className={view === "integrations" ? "active" : ""} onClick={() => setView("integrations")}><span>↔</span> INTEGRATIONS <b>NEW</b></button>
        <Link href="/"><span>↙</span> MARKETING SITE</Link>
        <div className="quote-sidebar-foot"><p>TAKEOFF STATUS</p><strong>{measurements.length ? "MEASUREMENTS READY" : "START DRAWING"}</strong><span>{measurements.length} mapped object{measurements.length === 1 ? "" : "s"}</span></div>
      </aside>

      {view === "takeoff" && <section className="takeoff-main">
        <div className="takeoff-toolbar">
          <form onSubmit={searchAddress} className="workspace-address-search"><span>⌕</span><input value={address} onChange={(event) => { setAddress(event.target.value); setScanState("idle"); setSelectedSite(null); }} aria-label="Property address" /><button disabled={searching}>{searching ? "SEARCHING…" : "FIND LOT"}</button></form>
          <div className={`imagery-chip ${imageryInfo.provider !== "esri" ? "hd" : ""}`}><i /> {imageryInfo.label} <span>{imageryInfo.detail}</span></div>
          {results.length > 1 && <div className="address-results">{results.map((result) => <button key={`${result.lat}-${result.lng}`} onClick={() => selectAddress(result)}>{result.label}</button>)}</div>}
          {searchError && <p className="workspace-error">{searchError}</p>}
        </div>
        <div className="map-stage">
          <div ref={mapElementRef} className="live-map" />
          {scanState !== "idle" && <div className={`scan-lot-cta ${scanState === "active" ? "active" : ""}`} role="status">
            <span>{scanState === "ready" ? "ADDRESS FOUND" : scanState === "selecting" ? "DRAWING LOT" : scanVerified ? "VERIFIED" : "MANUAL TAKEOFF"}</span>
            <div><strong>{scanState === "ready" ? "Select the actual parking lot" : scanState === "selecting" ? "Click around the paved work area" : scanVerified ? "Corrected takeoff ready" : "Review the selected lot and enter every count"}</strong><small>{scanState === "ready" ? "You choose the boundary so neighboring roads and buildings stay out." : scanState === "selecting" ? "Click each corner, then click the first point again to finish." : scanVerified ? "Save the estimate or export the proposal when ready." : "Drag the outline if needed, then use the count controls before quoting."}</small></div>
            {scanState === "ready" ? <button onClick={beginLotSelection}>DRAW LOT BOUNDARY <b>→</b></button> : scanState === "selecting" ? <button onClick={cancelLotSelection}>CANCEL DRAWING</button> : <div className="scan-lot-actions"><button onClick={toggleBoundaryEditing}>{boundaryEditing ? "SAVE OUTLINE" : "EDIT OUTLINE"}</button><button onClick={() => startDrawing("Marker")}>＋ ADD STALL</button></div>}
          </div>}
          <div className="map-style-switch" aria-label="Map style"><button className={mapStyle === "aerial" ? "active" : ""} onClick={() => void switchMapStyle("aerial")}>SATELLITE</button><button className={mapStyle === "street" ? "active" : ""} onClick={() => void switchMapStyle("street")}>STREET</button></div>
          <div className="map-draw-tools" aria-label="Map measurement tools"><button className={drawMode === "Polygon" ? "active" : ""} onClick={() => startDrawing("Polygon")}>▰ AREA</button><button className={drawMode === "Line" ? "active" : ""} onClick={() => startDrawing("Line")}>╱ LENGTH</button><button className={drawMode === "Marker" ? "active" : ""} onClick={() => startDrawing("Marker")}>• COUNT</button></div>
          <div className="map-instructions"><strong>DRAW THE TAKEOFF</strong><span>Polygon = paved area</span><span>Line = curb footage</span><span>Marker = parking stall</span></div>
          {scanState === "active" && lotDimensions && <div className="scan-review-card">
            <header><span>SELECTED LOT</span><b>{scanVerified ? "VERIFIED" : "NEEDS REVIEW"}</b></header>
            <div><span><strong>{number.format(lotDimensions.length)}′</strong><small>LENGTH</small></span><span><strong>{number.format(lotDimensions.width)}′</strong><small>WIDTH</small></span><span><strong>{number.format(lotDimensions.area)}</strong><small>SQ FT</small></span><span><strong>{number.format(lotDimensions.perimeter)}′</strong><small>PERIMETER</small></span></div>
            <p>Drag the yellow corners if the boundary needs adjustment. Then enter the visible striping items in the quote panel.</p>
            {!scanVerified && <button onClick={confirmScan}>VERIFY COUNTS &amp; UNLOCK QUOTE →</button>}
          </div>}
          {scanState === "idle" && <div className="assist-banner"><span>MANUAL TAKEOFF</span><strong>Search an address, then select the parking lot</strong><small>Choose the real work area before counting or pricing.</small></div>}
        </div>
        <aside className="estimate-panel">
          <div className="estimate-panel-head"><div><p>{scanState === "active" && !scanVerified ? "DRAFT ESTIMATE" : "LIVE ESTIMATE"}</p><h1>{currency.format(calculation.total)}</h1></div><span>{scanState === "active" && !scanVerified ? "VERIFY" : `${quoteItems.length} ITEMS`}</span></div>
          <div className="material-switch"><span>MATERIAL</span><button className={material === "paint" ? "selected" : ""} onClick={() => setMaterial("paint")}>PAINT <small>1.0×</small></button><button className={material === "thermoplastic" ? "selected" : ""} onClick={() => setMaterial("thermoplastic")}>THERMO <small>2.8×</small></button></div>
          <div className="manual-counts">
            <div className="panel-section-title"><span>MANUAL COUNTS</span><small>ENTER &amp; VERIFY</small></div>
            <CountAdjuster label="Standard stalls" value={standardStalls + mapCounts.stalls} onChange={(value) => { setStandardStalls(Math.max(0, value - mapCounts.stalls)); setScanVerified(false); }} />
            <CountAdjuster label="ADA stalls" value={adaStalls} onChange={(value) => { setAdaStalls(value); setScanVerified(false); }} />
            <CountAdjuster label="Crosswalks / hatching" value={crosswalks} onChange={(value) => { setCrosswalks(value); setScanVerified(false); }} />
            <CountAdjuster label="Directional arrows" value={arrows} onChange={(value) => { setArrows(value); setScanVerified(false); }} />
            <CountAdjuster label="Stop bars" value={stopBars} onChange={(value) => { setStopBars(value); setScanVerified(false); }} />
          </div>
          <div className="measurement-list">
            <div className="panel-section-title"><span>MAP MEASUREMENTS</span><small>{measurements.length} TOTAL</small></div>
            {!measurements.length ? <div className="empty-measurements"><b>⌖</b><span>Use the map tools to add area, length, or count measurements.</span></div> : measurements.map((item) => <div key={item.id} className="measurement-row"><i className={`measure-icon-${item.kind}`}>{item.kind === "area" ? "▰" : item.kind === "length" ? "╱" : "•"}</i><span><strong>{item.label}</strong><small>{number.format(item.value)} {item.unit}</small></span>{item.linkedItem !== "lot" && <button onClick={() => removeMeasurement(item.id)} aria-label={`Remove ${item.label}`}>×</button>}</div>)}
          </div>
          <div className="estimate-lines">
            <div className="panel-section-title"><span>PRICED SCOPE</span><small>EDIT UNIT PRICE</small></div>
            {quoteItems.map((item) => <div className="estimate-line" key={item.id}><span><strong>{item.name}</strong><small>{number.format(item.quantity)} {item.unit}</small></span><label>$<input aria-label={`${item.name} unit price`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setPrices((current) => ({ ...current, [item.id]: Number(event.target.value) }))} /></label><b>{currency.format(item.quantity * item.unitPrice * (item.category === "Striping" ? materialMultiplier : 1))}</b></div>)}
          </div>
          <div className="estimate-total"><span><small>SUBTOTAL</small><b>{currency.format(calculation.rawSubtotal)}</b></span>{calculation.minimumApplied && <span className="minimum-line"><small>MINIMUM JOB CHARGE APPLIED</small><b>{currency.format(calculation.total)}</b></span>}<div><span>TOTAL</span><strong>{currency.format(calculation.total)}</strong></div></div>
          {exportMessage && <p className="export-message">{exportMessage}</p>}
        </aside>
      </section>}

      {view === "saved" && <section className="workspace-list-view"><header><div><p>ESTIMATES</p><h1>Quote pipeline</h1></div><button onClick={() => setView("takeoff")}>＋ NEW ESTIMATE</button></header><div className="pipeline-tabs"><button className="active">ALL <b>{saved.length}</b></button><button>DRAFT</button><button>SENT</button><button>APPROVED</button></div><div className="saved-table"><div className="saved-table-head"><span>SITE</span><span>MEASUREMENTS</span><span>TOTAL</span><span>UPDATED</span></div>{!saved.length ? <div className="saved-empty"><strong>No saved estimates yet.</strong><span>Build a takeoff and save the draft to see it here.</span><button onClick={() => setView("takeoff")}>START A TAKEOFF</button></div> : saved.map((estimate) => <button key={estimate.id} className="saved-row" onClick={() => { setSiteAddress(estimate.address); setAddress(estimate.address); setView("takeoff"); }}><span><strong>San Diego Stadium Operations</strong><small>{estimate.address}</small></span><span>{estimate.measurements}</span><b>{currency.format(estimate.total)}</b><time>{new Date(estimate.updatedAt).toLocaleDateString()}</time></button>)}</div></section>}

      {view === "customers" && <section className="workspace-list-view"><header><div><p>CUSTOMERS</p><h1>Customer directory</h1></div><button>＋ ADD CUSTOMER</button></header><div className="customer-cards"><article><span>SD</span><div><strong>San Diego Stadium Operations</strong><small>Facilities Management</small><p>2101 Stadium Way<br />San Diego, CA 92108</p></div><b>1 ESTIMATE</b></article><article className="customer-placeholder"><strong>Minimal CRM by design.</strong><p>Customer and site records stay attached to every estimate without adding scheduling or dispatch clutter.</p></article></div></section>}

      {view === "integrations" && <IntegrationHub address={siteAddress} total={calculation.total} itemCount={quoteItems.length} />}
    </main>
  );
}
