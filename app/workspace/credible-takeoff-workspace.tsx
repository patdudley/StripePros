"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Layer as LeafletLayer, Map as LeafletMap, TileLayer } from "leaflet";
import Link from "next/link";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toPng } from "html-to-image";
import { activateTileLayer } from "@/lib/map-imagery";
import { captureLotScanSections } from "@/lib/lot-scan-capture";
import { calculateQuote } from "@/lib/quote-math";
import { pavementAreaSqFt } from "@/lib/takeoff/geometry";
import { aggregateAnnotationQuote, DEFAULT_TAKEOFF_PRICES } from "@/lib/takeoff/quote";
import { generateStallRow } from "@/lib/takeoff/row-assist";
import type { AnnotationReviewStatus, AnnotationType, ExclusionType, LotExclusion, PolygonGeometry, StripingService, TakeoffAnnotation, TakeoffGeometry } from "@/lib/takeoff/types";
import { ScheduleView } from "./schedule-view";

type GeocodeResult = { label: string; lat: number; lng: number; provider?: "google" };
type AddressSuggestion = GeocodeResult & { primary: string; secondary: string };
type MapImageryConfig = {
  provider: "esri" | "google" | "mapbox" | "nearmap";
  tileUrl: string;
  maxZoom: number;
  nativeMaxZoom?: number | null;
  coverageStatus: "available" | "unchecked" | "unconfigured" | "unavailable" | "error";
  captureDate: string | null;
  resolutionCm: number | null;
  attribution?: string;
};
type SavedEstimate = { id: string; address: string; total: number; measurements: number; updatedAt: string };
type IntegrationStatus = { jobber: boolean; quickbooks: boolean; hubspot: boolean; webhook: boolean };
type LotScanResult = {
  stalls: number;
  ada: number;
  arrows: number;
  accessAisles: number;
  confidence: number;
  summary: string;
  warnings: string[];
  requiresManualConfirmation: boolean;
  occludedRows: Array<{ sectionId: string; rowId: string; reason: string; confidence: number }>;
  detections: Array<{ type: "stall" | "ada" | "arrow" | "access_aisle"; lat: number; lng: number; confidence: number; rowId: string }>;
};
type DrawShape = "Polygon" | "Line" | "Marker";
type DrawIntent = "boundary" | "exclusion" | "row" | AnnotationType | null;
type DrawLayer = LeafletLayer & {
  toGeoJSON(): { geometry: TakeoffGeometry };
  getBounds?(): import("leaflet").LatLngBounds;
  setStyle?(options: Record<string, unknown>): void;
  bindTooltip?(text: string, options?: Record<string, unknown>): void;
  on(event: string, handler: () => void): DrawLayer;
  pm?: { enable(options?: Record<string, unknown>): void; disable(): void };
};
type GeomanMap = LeafletMap & { pm: { enableDraw(shape: DrawShape, options?: Record<string, unknown>): void; disableDraw(): void } };

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const ESRI_IMAGERY_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_CENTER: [number, number] = [32.7849, -117.1258];
const MAP_CLASS_NAME = "live-map";
const ADDRESS_ZOOM = 19.5;
const LOT_REVIEW_ZOOM = 20.25;

function estimatedScanPercent(elapsedMs: number) {
  return Math.min(94, Math.round(6 + 88 * (1 - Math.exp(-elapsedMs / 32_000))));
}

const TYPE_LABELS: Record<AnnotationType, string> = {
  standard_stall: "Standard stall",
  ada_stall: "ADA stall",
  ada_access_aisle: "ADA aisle / hatching",
  directional_arrow: "Directional arrow",
  crosswalk: "Crosswalk",
  stop_bar: "Stop bar",
  wheel_stop: "Wheel stop",
  painted_text: "Painted text / stencil",
  painted_curb: "Painted curb line",
};

const TYPE_SHORT: Record<AnnotationType, string> = {
  standard_stall: "STALL", ada_stall: "ADA", ada_access_aisle: "AISLE", directional_arrow: "ARROW",
  crosswalk: "XWALK", stop_bar: "STOP", wheel_stop: "BLOCK", painted_text: "TEXT", painted_curb: "CURB",
};

const ANNOTATION_COLORS: Record<AnnotationType, string> = {
  standard_stall: "#ffb400", ada_stall: "#2f8cff", ada_access_aisle: "#58a6ff", directional_arrow: "#74e08b",
  crosswalk: "#ffffff", stop_bar: "#ff6b4a", wheel_stop: "#d58cff", painted_text: "#ffe16b", painted_curb: "#ff3d3d",
};

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function geometryFromLayer(layer: DrawLayer): TakeoffGeometry {
  return layer.toGeoJSON().geometry;
}

function annotationShape(type: AnnotationType): DrawShape {
  if (type === "ada_access_aisle" || type === "crosswalk") return "Polygon";
  if (type === "painted_curb" || type === "stop_bar") return "Line";
  return "Marker";
}

function quoteCategory(id: string): "Striping" | "Job" {
  return id === "mobilization" ? "Job" : "Striping";
}

function IntegrationHub({ address, total, itemCount }: { address: string; total: number; itemCount: number }) {
  const [status, setStatus] = useState<IntegrationStatus>({ jobber: false, quickbooks: false, hubspot: false, webhook: false });
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/integrations/status").then((response) => response.json()).then((data: IntegrationStatus) => setStatus(data)).catch(() => undefined); }, []);
  async function send(provider: "hubspot" | "webhook") {
    const response = await fetch("/api/integrations/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, address, total, itemCount }) });
    const result = await response.json() as { message?: string; error?: string };
    setMessage(response.ok ? result.message ?? "Estimate exported." : result.error ?? "Export failed.");
  }
  return <section className="workspace-list-view integration-view">
    <header><div><p>CONNECTED WORKFLOW</p><h1>Integrations</h1></div><span className="integration-research-badge">FIELD-SERVICE READY</span></header>
    <div className="integration-intro"><strong>Quote here. Run the job where your team already works.</strong><p>Approved work can be handed to field-service, accounting, CRM, or webhook systems.</p></div>
    <div className="integration-grid">
      <article className="integration-card recommended"><div className="integration-rank">01</div><div className="integration-logo jobber-logo">J</div><div className="integration-card-copy"><span>FIELD SERVICE</span><h2>Jobber</h2><p>Customer, quote, job, scheduling, crew and invoice handoff.</p></div><div className="integration-action"><i className={status.jobber ? "ready" : ""} />{status.jobber ? "APP CREDENTIALS READY" : "OAUTH APP REQUIRED"}</div></article>
      <article className="integration-card"><div className="integration-rank">02</div><div className="integration-logo qb-logo">qb</div><div className="integration-card-copy"><span>ACCOUNTING</span><h2>QuickBooks Online</h2><p>Approved customers, service items, invoices and payments.</p></div><div className="integration-action"><i className={status.quickbooks ? "ready" : ""} />{status.quickbooks ? "APP CREDENTIALS READY" : "INTUIT APP REQUIRED"}</div></article>
      <article className="integration-card"><div className="integration-rank">03</div><div className="integration-logo hubspot-logo">H</div><div className="integration-card-copy"><span>SALES CRM</span><h2>HubSpot</h2><p>Create a deal from the current estimate.</p></div><div className="integration-action">{status.hubspot ? <button onClick={() => void send("hubspot")}>SEND DEAL →</button> : "PRIVATE APP TOKEN NEEDED"}</div></article>
      <article className="integration-card"><div className="integration-rank">04</div><div className="integration-logo webhook-logo">↗</div><div className="integration-card-copy"><span>AUTOMATION</span><h2>Zapier / Make</h2><p>Send an estimate-ready webhook event.</p></div><div className="integration-action">{status.webhook ? <button onClick={() => void send("webhook")}>SEND TEST →</button> : "WEBHOOK URL NEEDED"}</div></article>
    </div>{message && <p className="integration-message">{message}</p>}
  </section>;
}

export function CredibleTakeoffWorkspace() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const baseLayerRef = useRef<TileLayer | null>(null);
  const labelLayerRef = useRef<TileLayer | null>(null);
  const imagerySignatureRef = useRef(`esri:${ESRI_IMAGERY_URL}:19`);
  const drawingIntentRef = useRef<DrawIntent>(null);
  const annotationLayersRef = useRef(new Map<string, DrawLayer>());
  const exclusionLayersRef = useRef(new Map<string, DrawLayer>());
  const boundaryLayerRef = useRef<DrawLayer | null>(null);
  const previewLayersRef = useRef<LeafletLayer[]>([]);
  const annotationsRef = useRef<TakeoffAnnotation[]>([]);
  const undoRef = useRef<TakeoffAnnotation[][]>([]);
  const redoRef = useRef<TakeoffAnnotation[][]>([]);

  const [view, setView] = useState<"takeoff" | "saved" | "customers" | "schedule" | "integrations">("takeoff");
  const [address, setAddress] = useState("3008 El Cajon Blvd, San Diego, CA 92104");
  const [siteAddress, setSiteAddress] = useState("No property selected");
  const [selectedSite, setSelectedSite] = useState<GeocodeResult | null>(null);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [boundary, setBoundary] = useState<PolygonGeometry | null>(null);
  const [exclusions, setExclusions] = useState<LotExclusion[]>([]);
  const [selectedExclusionId, setSelectedExclusionId] = useState<string | null>(null);
  const exclusionType: ExclusionType = "building";
  const [annotations, setAnnotations] = useState<TakeoffAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [drawingIntent, setDrawingIntentState] = useState<DrawIntent>(null);
  const [boundaryEditing, setBoundaryEditing] = useState(false);
  const [rowBaseline, setRowBaseline] = useState<[[number, number], [number, number]] | null>(null);
  const [rowAngle, setRowAngle] = useState(90);
  const [rowCount, setRowCount] = useState(10);
  const [rowSpacing, setRowSpacing] = useState(9);
  const [rowMode, setRowMode] = useState<"count" | "spacing">("count");
  const [service, setService] = useState<StripingService>("restripe");
  const [includeMobilization, setIncludeMobilization] = useState(false);
  const [countsVerified, setCountsVerified] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({ ...DEFAULT_TAKEOFF_PRICES });
  const [material, setMaterial] = useState<"paint" | "thermoplastic">("paint");
  const [imageryInfo, setImageryInfo] = useState({ provider: "esri", detail: "Standard imagery", currentZoom: 18, maxZoom: 19, nativeMaxZoom: 19 as number | null, fallback: false });
  const [message, setMessage] = useState("Search an address, draw the lot, then create a manual takeoff.");
  const [saved, setSaved] = useState<SavedEstimate[]>([]);
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanConfidence, setScanConfidence] = useState<number | null>(null);
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);
  const [scanError, setScanError] = useState("");
  const suppressSuggestionsRef = useRef(false);

  annotationsRef.current = annotations;

  useEffect(() => {
    const query = address.trim();
    if (suppressSuggestionsRef.current) {
      suppressSuggestionsRef.current = false;
      return;
    }
    if (query.length < 3) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggesting(true);
      try {
        const response = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json() as { results?: AddressSuggestion[] };
        setSuggestions(response.ok ? data.results ?? [] : []);
        setActiveSuggestion(-1);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggesting(false);
      }
    }, 400);

    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [address]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("view") === "schedule") setView("schedule");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("stripepros_demo_estimates");
      if (!stored) return;
      try { setSaved(JSON.parse(stored) as SavedEstimate[]); } catch { /* ignore invalid device cache */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function setDrawingIntent(intent: DrawIntent) {
    drawingIntentRef.current = intent;
    setDrawingIntentState(intent);
  }

  function replaceAnnotations(next: TakeoffAnnotation[], recordHistory = true) {
    if (recordHistory) {
      undoRef.current.push(annotationsRef.current);
      if (undoRef.current.length > 60) undoRef.current.shift();
      redoRef.current = [];
    }
    annotationsRef.current = next;
    setAnnotations(next);
    setCountsVerified(false);
  }

  function undo() {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(annotationsRef.current);
    replaceAnnotations(previous, false);
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(annotationsRef.current);
    replaceAnnotations(next, false);
  }

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let alive = true;
    let map: LeafletMap | null = null;
    void (async () => {
      const L = await import("leaflet");
      if (!alive || !mapElementRef.current) return;
      leafletRef.current = L;
      (window as unknown as { L: typeof L }).L = L;
      await import("@geoman-io/leaflet-geoman-free");
      map = L.map(mapElementRef.current, { center: DEFAULT_CENTER, zoom: 18, zoomControl: false, zoomSnap: .25, zoomDelta: .25, wheelPxPerZoomLevel: 180, wheelDebounceTime: 80 });
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      baseLayerRef.current = L.tileLayer(ESRI_IMAGERY_URL, { maxZoom: 19, maxNativeZoom: 19, crossOrigin: "anonymous", attribution: "Imagery © Esri and contributors" }).addTo(map);
      labelLayerRef.current = L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 19, pane: "overlayPane", attribution: "Labels © Esri" }).addTo(map);
      map.on("zoomend", () => setImageryInfo((current) => ({ ...current, currentZoom: map?.getZoom() ?? current.currentZoom })));
      map.on("pm:create", (raw) => handleCreatedLayer(raw as unknown as { shape: DrawShape; layer: DrawLayer }));
      await loadAerialImagery();
    })();
    return () => { alive = false; map?.remove(); mapRef.current = null; };
    // The draw handler reads current values through refs; rebuilding the Leaflet map would discard user work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreatedLayer(event: { shape: DrawShape; layer: DrawLayer }) {
    const map = mapRef.current as GeomanMap | null;
    if (!map) return;
    const intent = drawingIntentRef.current;
    const geometry = geometryFromLayer(event.layer);
    map.removeLayer(event.layer);
    map.pm.disableDraw();
    setDrawingIntent(null);

    if (intent === "boundary" && geometry.type === "Polygon") {
      setBoundary(geometry);
      setExclusions([]);
      setAnnotations([]);
      undoRef.current = [];
      redoRef.current = [];
      setBoundaryEditing(false);
      setCountsVerified(false);
      setScanConfidence(null);
      setScanWarnings([]);
      setScanError("");
      setMessage("Lot selected. Preparing the aerial image for AI counting…");
      window.setTimeout(() => void runAiScan(geometry), 450);
      return;
    }
    if (intent === "exclusion" && geometry.type === "Polygon") {
      const id = crypto.randomUUID();
      setExclusions((current) => [...current, { id, type: exclusionType, geometry }]);
      setSelectedExclusionId(id);
      setCountsVerified(false);
      setMessage("Exclusion added and removed from pavement area.");
      return;
    }
    if (intent === "row" && geometry.type === "LineString" && geometry.coordinates.length >= 2) {
      setRowBaseline([geometry.coordinates[0], geometry.coordinates.at(-1)!]);
      setMessage("Row baseline ready. Adjust the angle, spacing or count, then commit the preview.");
      return;
    }
    if (intent && intent !== "boundary" && intent !== "exclusion" && intent !== "row") {
      const annotation: TakeoffAnnotation = {
        id: crypto.randomUUID(), type: intent, label: TYPE_LABELS[intent], geometry,
        provenance: "manual", reviewStatus: "accepted", service,
        text: intent === "painted_text" ? "TEXT" : undefined,
      };
      replaceAnnotations([...annotationsRef.current, annotation]);
      setSelectedAnnotationId(annotation.id);
      setMessage(`${TYPE_LABELS[intent]} added. Select it in the review list to edit or reject it.`);
    }
  }

  function annotationStyle(annotation: TakeoffAnnotation) {
    const color = ANNOTATION_COLORS[annotation.type];
    const hidden = annotation.reviewStatus === "rejected";
    return { color, fillColor: color, weight: annotation.type === "painted_curb" || annotation.type === "stop_bar" ? 5 : 2, fillOpacity: hidden ? .05 : .18, opacity: hidden ? .25 : 1, dashArray: annotation.reviewStatus === "unreviewed" ? "5 5" : undefined };
  }

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    annotationLayersRef.current.forEach((layer) => map.removeLayer(layer));
    annotationLayersRef.current.clear();
    for (const annotation of annotations) {
      let layer: DrawLayer;
      if (annotation.geometry.type === "Point") {
        const [lng, lat] = annotation.geometry.coordinates;
        layer = L.marker([lat, lng], { icon: L.divIcon({ className: `typed-annotation-marker type-${annotation.type}`, html: TYPE_SHORT[annotation.type], iconSize: [38, 24], iconAnchor: [19, 12] }) }) as unknown as DrawLayer;
      } else {
        const group = L.geoJSON({ type: "Feature", properties: {}, geometry: annotation.geometry } as never, { style: annotationStyle(annotation) });
        layer = group.getLayers()[0] as DrawLayer;
      }
      layer.addTo(map);
      layer.bindTooltip?.(`${TYPE_LABELS[annotation.type]} · ${annotation.reviewStatus}`, { direction: "top" });
      layer.on("click", () => setSelectedAnnotationId(annotation.id));
      layer.on("pm:edit", () => updateAnnotationGeometry(annotation.id, geometryFromLayer(layer)));
      layer.on("pm:dragend", () => updateAnnotationGeometry(annotation.id, geometryFromLayer(layer)));
      annotationLayersRef.current.set(annotation.id, layer);
    }
    // Geometry edit callbacks intentionally use the current annotation ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations]);

  useEffect(() => {
    annotationLayersRef.current.forEach((layer, id) => {
      if (!layer.pm) return;
      if (id === selectedAnnotationId) layer.pm.enable({ allowSelfIntersection: false, draggable: true });
      else layer.pm.disable();
    });
  }, [selectedAnnotationId, annotations]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (boundaryLayerRef.current) map.removeLayer(boundaryLayerRef.current);
    boundaryLayerRef.current = null;
    if (!boundary) return;
    const group = L.geoJSON({ type: "Feature", properties: {}, geometry: boundary } as never, { style: { color: "#ffb400", weight: 4, fillColor: "#ffb400", fillOpacity: .08, dashArray: "10 7" } });
    const layer = group.getLayers()[0] as DrawLayer;
    layer.addTo(map);
    layer.bindTooltip?.(`${number.format(pavementAreaSqFt(boundary, exclusions))} SQ FT PAVEMENT`, { permanent: true, direction: "center", className: "demo-lot-tooltip" });
    layer.on("pm:edit", () => { const geometry = geometryFromLayer(layer); if (geometry.type === "Polygon") { setBoundary(geometry); setCountsVerified(false); } });
    boundaryLayerRef.current = layer;
    if (boundaryEditing) layer.pm?.enable({ allowSelfIntersection: false });
  }, [boundary, exclusions, boundaryEditing]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    exclusionLayersRef.current.forEach((layer) => map.removeLayer(layer));
    exclusionLayersRef.current.clear();
    for (const exclusion of exclusions) {
      const group = L.geoJSON({ type: "Feature", properties: {}, geometry: exclusion.geometry } as never, { style: { color: "#ff6b4a", fillColor: "#11110f", weight: 2, fillOpacity: .5, dashArray: "4 4" } });
      const layer = group.getLayers()[0] as DrawLayer;
      layer.addTo(map);
      layer.bindTooltip?.(`EXCLUDE: ${exclusion.type.replaceAll("_", " ").toUpperCase()}`, { direction: "center" });
      layer.on("click", () => setSelectedExclusionId(exclusion.id));
      layer.on("pm:edit", () => { const geometry = geometryFromLayer(layer); if (geometry.type === "Polygon") setExclusions((current) => current.map((item) => item.id === exclusion.id ? { ...item, geometry } : item)); });
      if (exclusion.id === selectedExclusionId) layer.pm?.enable({ allowSelfIntersection: false, draggable: true });
      exclusionLayersRef.current.set(exclusion.id, layer);
    }
  }, [exclusions, selectedExclusionId]);

  const rowPreview = useMemo(() => rowBaseline ? generateStallRow({ start: rowBaseline[0], end: rowBaseline[1], angle: rowAngle, count: rowMode === "count" ? rowCount : undefined, spacingFt: rowSpacing, service }, (index) => `preview-${index}`) : [], [rowAngle, rowBaseline, rowCount, rowMode, rowSpacing, service]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    previewLayersRef.current.forEach((layer) => map.removeLayer(layer));
    previewLayersRef.current = [];
    for (const stall of rowPreview) {
      const group = L.geoJSON({ type: "Feature", properties: {}, geometry: stall.geometry } as never, { style: { color: "#ffb400", weight: 2, fillColor: "#ffb400", fillOpacity: .12, dashArray: "4 3" } });
      const layer = group.getLayers()[0];
      layer.addTo(map);
      previewLayersRef.current.push(layer);
    }
  }, [rowPreview]);

  async function loadAerialImagery(site?: GeocodeResult) {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    try {
      const query = site ? `?lat=${site.lat}&lng=${site.lng}` : "";
      const response = await fetch(`/api/map-config${query}`);
      if (!response.ok) return;
      const config = await response.json() as MapImageryConfig;
      const signature = `${config.provider}:${config.tileUrl}:${config.maxZoom}`;
      let fallback = false;
      if (signature !== imagerySignatureRef.current) {
        const layer = L.tileLayer(config.tileUrl, { maxZoom: config.maxZoom, ...(config.nativeMaxZoom === null ? {} : { maxNativeZoom: config.nativeMaxZoom ?? config.maxZoom }), crossOrigin: "anonymous", attribution: config.attribution ?? (config.provider === "nearmap" ? "Imagery © Nearmap" : config.provider === "mapbox" ? "Imagery © Mapbox" : "Imagery © Esri and contributors") });
        const loaded = await activateTileLayer(map, layer, baseLayerRef.current);
        if (loaded) { baseLayerRef.current = layer; imagerySignatureRef.current = signature; }
        else fallback = true;
      }
      if (labelLayerRef.current) {
        if (config.provider !== "esri" && map.hasLayer(labelLayerRef.current)) map.removeLayer(labelLayerRef.current);
        if (config.provider === "esri" && !map.hasLayer(labelLayerRef.current)) labelLayerRef.current.addTo(map);
      }
      const captured = config.captureDate ? ` · CAPTURE ${config.captureDate}` : "";
      const resolution = config.resolutionCm ? ` · ${config.resolutionCm} CM/PIXEL` : "";
      setImageryInfo({ provider: fallback ? "esri" : config.provider, detail: `${config.coverageStatus.toUpperCase()}${captured}${resolution}`, currentZoom: map.getZoom(), maxZoom: fallback ? 19 : config.maxZoom, nativeMaxZoom: fallback ? 19 : config.nativeMaxZoom ?? null, fallback });
    } catch { setImageryInfo((current) => ({ ...current, fallback: true, detail: "PROVIDER ERROR · CURRENT LAYER RETAINED" })); }
  }

  async function searchAddress(event: FormEvent) {
    event.preventDefault();
    setSearching(true); setSearchError("");
    try {
      if (selectedSite && selectedSite.label === address) {
        selectAddress(selectedSite);
        return;
      }
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      const data = await response.json() as { results?: GeocodeResult[]; error?: string };
      if (!response.ok || !data.results?.length) throw new Error(data.error ?? "Address not found.");
      setResults(data.results);
      selectAddress(data.results[0]);
    } catch (error) { setSearchError(error instanceof Error ? error.message : "Address search failed."); }
    finally { setSearching(false); }
  }

  function clearMapWork() {
    setBoundary(null); setExclusions([]); setSelectedExclusionId(null); replaceAnnotations([], false); setSelectedAnnotationId(null); setRowBaseline(null);
    setCountsVerified(false); undoRef.current = []; redoRef.current = [];
    setScanning(false); setScanConfidence(null); setScanWarnings([]); setScanError("");
  }

  function selectAddress(site: GeocodeResult) {
    suppressSuggestionsRef.current = true;
    clearMapWork();
    setAddress(site.label); setSiteAddress(site.label); setSelectedSite(site); setResults([]);
    setSuggestions([]); setSuggesting(false); setActiveSuggestion(-1); setSearchError("");
    setMessage("Address found. Draw the actual parking-lot boundary. Counts start at zero.");
    mapRef.current?.flyTo([site.lat, site.lng], ADDRESS_ZOOM, { duration: .55 });
    void loadAerialImagery(site);
  }

  function startDraw(intent: DrawIntent) {
    const map = mapRef.current as GeomanMap | null;
    if (!map) return;
    map.pm.disableDraw();
    setDrawingIntent(intent);
    const shape: DrawShape = intent === "boundary" || intent === "exclusion" ? "Polygon" : intent === "row" ? "Line" : intent ? annotationShape(intent) : "Marker";
    map.pm.enableDraw(shape, { snappable: true, continueDrawing: false, allowSelfIntersection: false });
    setMessage(intent === "row" ? "Click the beginning and end of the stall row." : `Draw ${intent ? String(intent).replaceAll("_", " ") : "annotation"} on the map.`);
  }

  function updateAnnotationGeometry(id: string, geometry: TakeoffGeometry) {
    replaceAnnotations(annotationsRef.current.map((item) => item.id === id ? { ...item, geometry, reviewStatus: "edited" } : item));
  }

  function updateAnnotation(id: string, patch: Partial<TakeoffAnnotation>) {
    replaceAnnotations(annotationsRef.current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function removeAnnotation(id: string) {
    replaceAnnotations(annotationsRef.current.filter((item) => item.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  }

  async function runAiScan(selectedBoundary = boundary) {
    const map = mapRef.current;
    const mapElement = mapElementRef.current;
    if (!selectedBoundary || !map || !mapElement) {
      setMessage("Draw the parking-lot boundary before scanning.");
      return;
    }

    setScanning(true);
    setScanProgress(6);
    setScanError("");
    setScanWarnings([]);
    setCountsVerified(false);
    setMessage("AI scan running: locating visible stalls, ADA spaces, access aisles, and directional arrows…");
    const startedAt = performance.now();
    const progressTimer = window.setInterval(() => setScanProgress(estimatedScanPercent(performance.now() - startedAt)), 700);
    try {
      const boundaryPoints = selectedBoundary.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]);
      map.fitBounds(boundaryPoints, { padding: [72, 72], maxZoom: Math.min(imageryInfo.maxZoom, LOT_REVIEW_ZOOM), animate: true, duration: .45 });
      map.invalidateSize(false);
      await new Promise((resolve) => window.setTimeout(resolve, 900));

      const sections = await captureLotScanSections({
        map,
        mapElement,
        boundary: selectedBoundary.coordinates[0].map(([lng, lat]) => map.wrapLatLng([lat, lng])),
        maxZoom: Math.min(imageryInfo.maxZoom, LOT_REVIEW_ZOOM),
        onProgress: (completed, total) => setScanProgress(Math.max(12, Math.round((completed / total) * 42))),
      });
      const response = await fetch("/api/scan-lot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: siteAddress, sections }),
      });
      const result = await response.json() as LotScanResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The AI scan could not be completed.");

      const modelAnnotations: TakeoffAnnotation[] = result.detections.map((detection, index) => {
        const type: AnnotationType = detection.type === "stall" ? "standard_stall" : detection.type === "ada" ? "ada_stall" : detection.type === "access_aisle" ? "ada_access_aisle" : "directional_arrow";
        return {
          id: `model-${crypto.randomUUID()}-${index}`,
          type,
          label: `${TYPE_LABELS[type]} ${index + 1}`,
          geometry: { type: "Point", coordinates: [detection.lng, detection.lat] },
          provenance: "model",
          reviewStatus: "accepted",
          service,
        };
      });
      const manualAnnotations = annotationsRef.current.filter((annotation) => annotation.provenance !== "model");
      replaceAnnotations([...manualAnnotations, ...modelAnnotations]);
      setScanConfidence(result.confidence);
      setScanWarnings([...result.occludedRows.map((row) => `${row.rowId}: ${row.reason}`), ...result.warnings]);
      setScanProgress(100);
      setMessage(result.requiresManualConfirmation
        ? `${modelAnnotations.length} visible markings counted. Manual confirmation required for ${result.occludedRows.length} occluded row${result.occludedRows.length === 1 ? "" : "s"}: ${result.occludedRows.map((row) => row.rowId).join(", ")}.`
        : `${modelAnnotations.length} visible markings counted: ${result.stalls} standard stalls, ${result.ada} ADA, ${result.accessAisles} ADA paths / access aisles, ${result.arrows} arrows. Review every marker before verifying.`);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The AI scan could not be completed.";
      setScanError(detail);
      setMessage(`${detail} Use the manual tools or retry the scan.`);
    } finally {
      window.clearInterval(progressTimer);
      setScanning(false);
    }
  }

  function commitRow() {
    if (!rowBaseline || !rowPreview.length) return;
    const committed = rowPreview.map((stall, index) => ({ ...stall, id: crypto.randomUUID(), label: `Standard stall ${annotationsRef.current.filter((item) => item.type === "standard_stall").length + index + 1}` }));
    replaceAnnotations([...annotationsRef.current, ...committed]);
    setRowBaseline(null);
    setMessage(`${committed.length} individually editable stalls added.`);
  }

  const quoteLines = useMemo(() => aggregateAnnotationQuote(annotations, prices, includeMobilization), [annotations, includeMobilization, prices]);
  const quoteItems = useMemo(() => quoteLines.map((line) => ({ id: line.id, name: line.description, category: quoteCategory(line.id), unit: line.unit, quantity: line.quantity, unitPrice: line.unitPrice })), [quoteLines]);
  const materialMultiplier = material === "thermoplastic" ? 2.8 : 1;
  const calculation = useMemo(() => calculateQuote(quoteItems, materialMultiplier, 450), [quoteItems, materialMultiplier]);
  const acceptedAnnotations = annotations.filter((item) => item.reviewStatus === "accepted" || item.reviewStatus === "edited");
  const counters = useMemo(() => acceptedAnnotations.reduce<Record<string, number>>((result, item) => ({ ...result, [item.type]: (result[item.type] ?? 0) + 1 }), {}), [acceptedAnnotations]);
  const pavementArea = pavementAreaSqFt(boundary, exclusions);
  const canExport = Boolean(boundary && acceptedAnnotations.length && countsVerified);

  async function saveEstimate() {
    if (!boundary) { setMessage("Draw the lot boundary before saving."); return; }
    const center = mapRef.current?.getCenter();
    const payload = { address: siteAddress, lat: selectedSite?.lat ?? center?.lat ?? DEFAULT_CENTER[0], lng: selectedSite?.lng ?? center?.lng ?? DEFAULT_CENTER[1], boundary, exclusions, annotations, quoteLines, material, materialMultiplier, countsVerified, subtotal: calculation.rawSubtotal, total: calculation.total };
    try {
      const response = await fetch("/api/takeoffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error();
      setMessage("Draft saved to your account.");
    } catch {
      const estimate = { id: crypto.randomUUID(), address: siteAddress, total: calculation.total, measurements: annotations.length, updatedAt: new Date().toISOString() };
      const next = [estimate, ...saved].slice(0, 20);
      setSaved(next); window.localStorage.setItem("stripepros_demo_estimates", JSON.stringify(next));
      setMessage("Draft saved on this device. Sign in with a configured database for account persistence.");
    }
  }

  async function exportProposal() {
    if (!canExport) { setMessage("Accept the annotations and confirm Counts verified before exporting."); return; }
    setExporting(true);
    try {
      const pdf = await PDFDocument.create();
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const amber = rgb(1, .706, 0); const ink = rgb(.067, .067, .059);
      const page = pdf.addPage([612, 792]);
      page.drawRectangle({ x: 0, y: 690, width: 612, height: 102, color: amber });
      page.drawText("STRIPE PROS", { x: 42, y: 742, size: 24, font: bold, color: ink });
      page.drawText("ANNOTATION-VERIFIED STRIPING PROPOSAL", { x: 42, y: 717, size: 9, font: bold, color: ink });
      page.drawText(siteAddress.slice(0, 92), { x: 42, y: 650, size: 10, font: regular, color: ink });
      page.drawText(`${number.format(pavementArea)} SQ FT SELECTED PAVEMENT`, { x: 42, y: 628, size: 8, font: bold, color: rgb(.42, .4, .36) });
      let y = 580;
      for (const item of quoteItems) {
        const lineTotal = item.quantity * item.unitPrice * (item.category === "Striping" ? materialMultiplier : 1);
        page.drawText(item.name, { x: 42, y, size: 9, font: regular, color: ink });
        page.drawText(`${number.format(item.quantity)} ${item.unit} x ${currency.format(item.unitPrice)}`, { x: 310, y, size: 8, font: regular, color: rgb(.38, .37, .34) });
        page.drawText(currency.format(lineTotal), { x: 510, y, size: 9, font: bold, color: ink }); y -= 30;
      }
      page.drawRectangle({ x: 350, y: y - 20, width: 220, height: 52, color: ink });
      page.drawText("TOTAL", { x: 365, y: y, size: 8, font: bold, color: amber });
      page.drawText(currency.format(calculation.total), { x: 470, y: y - 3, size: 18, font: bold, color: rgb(1, 1, 1) });
      if (mapElementRef.current) {
        try {
          const dataUrl = await toPng(mapElementRef.current, { cacheBust: true, pixelRatio: 1.5 });
          const mapImage = await pdf.embedPng(await fetch(dataUrl).then((response) => response.arrayBuffer()));
          const mapPage = pdf.addPage([612, 792]);
          mapPage.drawText("ANNOTATED SITE TAKEOFF", { x: 42, y: 744, size: 13, font: bold, color: ink });
          mapPage.drawImage(mapImage, { x: 42, y: 250, width: 528, height: 450 });
          mapPage.drawText(`${acceptedAnnotations.length} accepted annotations · counts verified`, { x: 42, y: 225, size: 8, font: bold, color: ink });
        } catch { /* imagery provider can prevent browser capture */ }
      }
      const blob = new Blob([await pdf.save() as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `Stripe-Pros-Proposal-${new Date().toISOString().slice(0, 10)}.pdf`; anchor.click(); URL.revokeObjectURL(url);
      setMessage("Branded proposal downloaded with accepted annotation quantities.");
    } catch { setMessage("Proposal generation failed. Review the takeoff and try again."); }
    finally { setExporting(false); }
  }

  return <main className="quote-workspace-shell credible-takeoff">
    <header className="quote-app-header">
      <Link className="quote-brand" href="/"><BrandMark /><span>STRIPE PROS</span></Link>
      <div className="quote-header-site"><span>TAKEOFF</span><strong>{siteAddress}</strong><small>{boundary ? `${number.format(pavementArea)} SQ FT PAVEMENT · ${acceptedAnnotations.length} ACCEPTED` : "ADDRESS → BOUNDARY → ANNOTATIONS → QUOTE"}</small></div>
      <div className="quote-header-actions"><span className="autosave-status"><i /> {scanning ? "AI SCANNING" : "AI + MANUAL TAKEOFF"}</span><button onClick={() => void saveEstimate()}>SAVE DRAFT</button><button className="export-button" onClick={() => void exportProposal()} disabled={exporting || !canExport}>{exporting ? "GENERATING…" : "EXPORT PROPOSAL"} <b>→</b></button></div>
    </header>
    <aside className="quote-sidebar">
      <p>WORKSPACE</p>
      <button className={view === "takeoff" ? "active" : ""} onClick={() => setView("takeoff")}><span>⌖</span> TAKEOFF</button>
      <button className={view === "saved" ? "active" : ""} onClick={() => setView("saved")}><span>▤</span> ESTIMATES <b>{saved.length}</b></button>
      <button className={view === "customers" ? "active" : ""} onClick={() => setView("customers")}><span>◎</span> CUSTOMERS</button>
      <button className={view === "schedule" ? "active" : ""} onClick={() => setView("schedule")}><span>□</span> SCHEDULE <b>SCALE</b></button>
      <button className={view === "integrations" ? "active" : ""} onClick={() => setView("integrations")}><span>↔</span> INTEGRATIONS</button>
      <Link href="/"><span>↙</span> MARKETING SITE</Link>
      <div className="quote-sidebar-foot"><p>TAKEOFF STATUS</p><strong>{countsVerified ? "COUNTS VERIFIED" : boundary ? "REVIEW REQUIRED" : "SELECT A LOT"}</strong><span>{acceptedAnnotations.length} accepted annotation{acceptedAnnotations.length === 1 ? "" : "s"}</span></div>
    </aside>

    {view === "takeoff" && <section className="takeoff-main">
      <div className="takeoff-toolbar">
        <form onSubmit={searchAddress} className="workspace-address-search"><span>⌕</span><input aria-label="Property address" role="combobox" aria-autocomplete="list" aria-expanded={Boolean(suggestions.length)} aria-controls="workspace-address-suggestions" aria-activedescendant={activeSuggestion >= 0 ? `workspace-suggestion-${activeSuggestion}` : undefined} value={address} autoComplete="off" onChange={(event) => { setAddress(event.target.value); setSelectedSite(null); setSearchError(""); setSuggestions([]); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setActiveSuggestion((current) => Math.min(current + 1, suggestions.length - 1)); }
          if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setActiveSuggestion((current) => Math.max(current - 1, 0)); }
          if (event.key === "Enter" && activeSuggestion >= 0) { event.preventDefault(); selectAddress(suggestions[activeSuggestion]); }
          if (event.key === "Escape") { setSuggestions([]); setActiveSuggestion(-1); }
        }} /><button disabled={!address.trim() || searching}>{searching ? "SEARCHING…" : "FIND LOT"}</button>
          {(suggesting || suggestions.length > 0) && <div className="workspace-address-suggestions" id="workspace-address-suggestions" role="listbox">
            {suggesting && !suggestions.length ? <span>SEARCHING ADDRESSES…</span> : suggestions.map((suggestion, index) => <button id={`workspace-suggestion-${index}`} role="option" aria-selected={index === activeSuggestion} className={index === activeSuggestion ? "active" : ""} type="button" key={`${suggestion.lat}-${suggestion.lng}-${index}`} onMouseDown={(event) => event.preventDefault()} onClick={() => selectAddress(suggestion)}><i>⌖</i><span><strong>{suggestion.primary}</strong><small>{suggestion.secondary}</small></span></button>)}
          </div>}
        </form>
        {results.length > 1 && <div className="address-results">{results.map((result) => <button key={`${result.lat}-${result.lng}`} onClick={() => selectAddress(result)}>{result.label}</button>)}</div>}
        {searchError && <p className="workspace-error">{searchError}</p>}
        {selectedSite && <div className="workspace-resolved-address"><b>✓ GOOGLE ADDRESS CONFIRMED</b><span>{selectedSite.label}</span></div>}
      </div>
      <div className={`map-stage ${scanning ? "scanning" : ""}`}>
        <div ref={mapElementRef} className={MAP_CLASS_NAME} data-drawing={Boolean(drawingIntent)} />
        <div className="map-workflow-strip"><button className={!boundary ? "primary" : ""} onClick={() => startDraw("boundary")}>{boundary ? "REDRAW LOT" : "1 · DRAW LOT"}</button><button disabled={!boundary} onClick={() => startDraw("exclusion")}>＋ EXCLUSION</button><button disabled={!boundary} onClick={() => setBoundaryEditing((value) => !value)}>{boundaryEditing ? "SAVE BOUNDARY" : "EDIT BOUNDARY"}</button></div>
        {Boolean(exclusions.length) && <div className="exclusion-list"><strong>EXCLUSIONS</strong>{exclusions.map((exclusion) => <div key={exclusion.id}><button className={selectedExclusionId === exclusion.id ? "selected" : ""} onClick={() => setSelectedExclusionId(exclusion.id)}>{exclusion.type.replaceAll("_", " ")}</button><button aria-label={`Delete ${exclusion.type} exclusion`} onClick={() => { setExclusions((current) => current.filter((item) => item.id !== exclusion.id)); if (selectedExclusionId === exclusion.id) setSelectedExclusionId(null); }}>×</button></div>)}</div>}
        <div className="map-history-tools"><button onClick={undo} disabled={!undoRef.current.length}>↶ UNDO</button><button onClick={redo} disabled={!redoRef.current.length}>↷ REDO</button></div>
        {drawingIntent && <div className="drawing-status">DRAWING {String(drawingIntent).replaceAll("_", " ").toUpperCase()} · CLICK MAP TO COMPLETE</div>}
        {scanning && <div className="workspace-scan-line"><span>AI SCANNING SELECTED LOT · {scanProgress}%</span><div><b style={{ width: `${scanProgress}%` }} /></div></div>}
        <div className="takeoff-message"><strong>{message}</strong></div>
      </div>
      <aside className="estimate-panel annotation-panel workspace-quote-panel">
        <div className="workspace-quote-step"><b>03</b><span>GENERATE THE QUOTE</span></div>
        <div className="quote-top"><span><BrandMark /> STRIPE PROS</span><b>EDITABLE DRAFT</b></div>
        <div className="quote-site"><small>PREPARED FOR</small><strong>{siteAddress || "Select a property"}</strong><span>{selectedSite?.label ?? ""}</span></div>
        <div className="quote-lines workspace-home-quote-lines">
          <div><span>Standard stalls — restripe <small>{counters.standard_stall ?? 0} × {currency.format(prices.standard_stall)}</small></span><b>{currency.format((counters.standard_stall ?? 0) * prices.standard_stall)}</b></div>
          <div><span>ADA stalls + symbols <small>{counters.ada_stall ?? 0} × {currency.format(prices.ada_stall)}</small></span><b>{currency.format((counters.ada_stall ?? 0) * prices.ada_stall)}</b></div>
          <div><span>ADA paths / access aisles <small>{counters.ada_access_aisle ?? 0} × {currency.format(prices.ada_access_aisle)}</small></span><b>{currency.format((counters.ada_access_aisle ?? 0) * prices.ada_access_aisle)}</b></div>
          <div><span>Directional arrows <small>{counters.directional_arrow ?? 0} × {currency.format(prices.directional_arrow)}</small></span><b>{currency.format((counters.directional_arrow ?? 0) * prices.directional_arrow)}</b></div>
        </div>
        <div className="quote-total workspace-home-quote-total"><span>DRAFT TOTAL</span><strong>{currency.format(calculation.total)}</strong></div>
        <div className="quote-ready workspace-home-quote-ready"><span>{scanError || scanWarnings.length ? "!" : "✓"}</span><div><b>{scanError ? "MANUAL COUNT REQUIRED" : scanWarnings.length ? "OCCLUDED ROWS NEED CONFIRMATION" : "AI SCAN COMPLETE — VERIFY BEFORE SENDING"}</b><small>{scanError || scanWarnings[0] || "Automatic counts can be corrected for trees, shadows, or faded markings"}</small></div></div>
        <section className="typed-tools">
          <div className="panel-section-title"><span>TYPED ANNOTATIONS</span><small>CLICK TYPE, THEN MAP</small></div>
          <div>{(Object.keys(TYPE_LABELS) as AnnotationType[]).map((type) => <button key={type} className={`type-tool type-${type}`} disabled={!boundary} onClick={() => startDraw(type)}><i style={{ background: ANNOTATION_COLORS[type] }} />{TYPE_LABELS[type]}</button>)}</div>
        </section>
        <section className="annotation-counters">
          <div className="panel-section-title"><span>LIVE ACCEPTED COUNTS</span><small>{acceptedAnnotations.length} TOTAL</small></div>
          <div>{(Object.keys(TYPE_LABELS) as AnnotationType[]).map((type) => <span key={type}><i style={{ background: ANNOTATION_COLORS[type] }} />{TYPE_SHORT[type]} <b>{counters[type] ?? 0}</b></span>)}</div>
        </section>
        <section className="annotation-review-list">
          <div className="panel-section-title"><span>ANNOTATION REVIEW</span><small>ACCEPTED / EDITED QUOTE ONLY</small></div>
          {!annotations.length ? <p>No annotations yet. Use row assist or a typed tool.</p> : annotations.map((annotation) => <article key={annotation.id} className={`${annotation.reviewStatus} ${selectedAnnotationId === annotation.id ? "selected" : ""}`}><button className="select-annotation" aria-label={`Select ${annotation.label}`} onClick={() => setSelectedAnnotationId(annotation.id)}><i style={{ background: ANNOTATION_COLORS[annotation.type] }} /></button><span><input aria-label={`${TYPE_LABELS[annotation.type]} label`} value={annotation.label} onChange={(event) => updateAnnotation(annotation.id, { label: event.target.value, reviewStatus: "edited" })} /><small>{annotation.provenance} · {annotation.reviewStatus} · {annotation.service.replace("_", " ")}</small></span><select aria-label={`${annotation.label} status`} value={annotation.reviewStatus} onChange={(event) => updateAnnotation(annotation.id, { reviewStatus: event.target.value as AnnotationReviewStatus })}><option value="accepted">Accepted</option><option value="edited">Edited</option><option value="unreviewed">Unreviewed</option><option value="rejected">Rejected</option></select>{annotation.type === "standard_stall" && <button onClick={() => updateAnnotation(annotation.id, { type: "ada_stall", label: "ADA stall", reviewStatus: "edited" })}>MAKE ADA</button>}{annotation.type === "painted_text" && <input aria-label="Stencil text" value={annotation.text ?? ""} onChange={(event) => updateAnnotation(annotation.id, { text: event.target.value, reviewStatus: "edited" })} />}<button className="delete-annotation" onClick={() => removeAnnotation(annotation.id)} aria-label={`Delete ${annotation.label}`}>×</button></article>)}
        </section>
        <section className="estimate-lines">
          <div className="panel-section-title"><span>PRICED SCOPE</span><small>ZERO QUANTITIES EXCLUDED</small></div>
          {quoteLines.map((line) => <div className="estimate-line" key={line.id}><span><strong>{line.description}</strong><small>{number.format(line.quantity)} {line.unit}</small></span><label aria-label={`${line.description} unit price`}>$<input type="number" min="0" step=".01" value={line.unitPrice} onChange={(event) => setPrices((current) => ({ ...current, [line.id]: Number(event.target.value) }))} /></label><b>{currency.format(line.quantity * line.unitPrice * (line.id === "mobilization" ? 1 : materialMultiplier))}</b></div>)}
          {!quoteLines.length && <p className="empty-quote-lines">Accept annotations to create quote lines.</p>}
        </section>
        <div className="material-switch"><span>MATERIAL</span><button className={material === "paint" ? "selected" : ""} onClick={() => setMaterial("paint")}>PAINT</button><button className={material === "thermoplastic" ? "selected" : ""} onClick={() => setMaterial("thermoplastic")}>THERMO 2.8×</button></div>
        <label className="include-mobilization"><input aria-label="Include mobilization crew and equipment setup" type="checkbox" checked={includeMobilization} onChange={(event) => setIncludeMobilization(event.target.checked)} /><span><strong>Mobilization — crew and equipment setup</strong><small>Optional flat line item. Remove at any time.</small></span></label>
        <label className="counts-verified"><input aria-label="Confirm takeoff counts are verified" type="checkbox" checked={countsVerified} onChange={(event) => setCountsVerified(event.target.checked)} disabled={!acceptedAnnotations.length} /><span><strong>Counts verified</strong><small>Required before exporting the proposal.</small></span></label>
        <div className="estimate-total"><span><small>SUBTOTAL</small><b>{currency.format(calculation.rawSubtotal)}</b></span>{calculation.minimumApplied && <span className="minimum-line"><small>MINIMUM JOB CHARGE</small><b>{currency.format(calculation.total)}</b></span>}<div><span>TOTAL</span><strong>{currency.format(calculation.total)}</strong></div></div>
      </aside>
    </section>}

    {view === "saved" && <section className="workspace-list-view"><header><div><p>ESTIMATES</p><h1>Quote pipeline</h1></div><button onClick={() => setView("takeoff")}>＋ NEW ESTIMATE</button></header><div className="saved-table"><div className="saved-table-head"><span>SITE</span><span>ANNOTATIONS</span><span>TOTAL</span><span>UPDATED</span></div>{!saved.length ? <div className="saved-empty"><strong>No saved estimates yet.</strong><span>Save a verified takeoff to see it here.</span></div> : saved.map((estimate) => <button className="saved-row" key={estimate.id} onClick={() => { setAddress(estimate.address); setView("takeoff"); }}><span><strong>{estimate.address}</strong><small>Manual takeoff</small></span><span>{estimate.measurements}</span><b>{currency.format(estimate.total)}</b><time>{new Date(estimate.updatedAt).toLocaleDateString()}</time></button>)}</div></section>}
    {view === "customers" && <section className="workspace-list-view"><header><div><p>CUSTOMERS</p><h1>Customer directory</h1></div><button>＋ ADD CUSTOMER</button></header><div className="customer-cards"><article className="customer-placeholder"><strong>Customers stay attached to estimates.</strong><p>Account-backed customer persistence remains available through the existing product database.</p></article></div></section>}
    {view === "schedule" && <ScheduleView />}
    {view === "integrations" && <IntegrationHub address={siteAddress} total={calculation.total} itemCount={quoteLines.length} />}
  </main>;
}
