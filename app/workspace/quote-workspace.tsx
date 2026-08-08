"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Layer as LeafletLayer } from "leaflet";
import Link from "next/link";
import turfArea from "@turf/area";
import turfLength from "@turf/length";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toPng } from "html-to-image";
import { calculateQuote } from "@/lib/quote-math";

type Measurement = {
  id: string;
  label: string;
  kind: "area" | "length" | "count";
  value: number;
  unit: "sqft" | "LF" | "each";
  linkedItem: "sealcoat" | "curb" | "stalls";
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
type SavedEstimate = { id: string; address: string; total: number; measurements: number; updatedAt: string };
type DrawLayer = LeafletLayer & { toGeoJSON(): Parameters<typeof turfArea>[0] };
type DrawMode = "Polygon" | "Line" | "Marker";
type GeomanMap = LeafletMap & { pm: { enableDraw(shape: DrawMode, options?: Record<string, unknown>): void; disableDraw(): void } };

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

export function QuoteWorkspace() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerByMeasurementRef = useRef(new Map<string, LeafletLayer>());
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [view, setView] = useState<"takeoff" | "saved" | "customers">("takeoff");
  const [address, setAddress] = useState("742 Evergreen Industrial Way, Sacramento, CA");
  const [siteAddress, setSiteAddress] = useState("742 Evergreen Industrial Way, Sacramento, CA");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [standardStalls, setStandardStalls] = useState(84);
  const [adaStalls, setAdaStalls] = useState(2);
  const [arrows, setArrows] = useState(4);
  const [stopBars, setStopBars] = useState(2);
  const [material, setMaterial] = useState<"paint" | "thermoplastic">("paint");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [saved, setSaved] = useState<SavedEstimate[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = window.localStorage.getItem("stripepros_demo_estimates");
    if (!stored) return [];
    try { return JSON.parse(stored) as SavedEstimate[]; } catch { return []; }
  });
  const [prices, setPrices] = useState({ stalls: 5, ada: 35, arrows: 15, stopBars: 3, curb: 1.75, sealcoat: 0.16, mobilization: 250 });

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let active = true;
    let map: LeafletMap | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (!active || !mapElementRef.current) return;
      (window as unknown as { L: typeof L }).L = L;
      await import("@geoman-io/leaflet-geoman-free");

      map = L.map(mapElementRef.current, { center: [38.58, -121.49], zoom: 17, zoomControl: false });
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 20,
        crossOrigin: "anonymous",
        attribution: "Tiles © Esri — commercial terms must be reviewed before launch",
      }).addTo(map);

      map.on("pm:create", (rawEvent) => {
        const event = rawEvent as unknown as { shape: string; layer: DrawLayer };
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
      });
    })();

    return () => {
      active = false;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  const mapCounts = useMemo(() => ({
    stalls: measurements.filter((item) => item.linkedItem === "stalls").reduce((sum, item) => sum + item.value, 0),
    curb: measurements.filter((item) => item.linkedItem === "curb").reduce((sum, item) => sum + item.value, 0),
    sealcoat: measurements.filter((item) => item.linkedItem === "sealcoat").reduce((sum, item) => sum + item.value, 0),
  }), [measurements]);

  const quoteItems = useMemo<QuoteItem[]>(() => [
    { id: "stalls", name: "Standard stalls — restripe", category: "Striping", unit: "each", quantity: mapCounts.stalls || standardStalls, unitPrice: prices.stalls },
    { id: "ada", name: "ADA stalls + symbols", category: "Striping", unit: "each", quantity: adaStalls, unitPrice: prices.ada },
    { id: "arrows", name: "Directional arrows", category: "Striping", unit: "each", quantity: arrows, unitPrice: prices.arrows },
    { id: "stopBars", name: "Stop bars", category: "Striping", unit: "LF", quantity: stopBars * 12, unitPrice: prices.stopBars },
    { id: "curb", name: "Curb paint", category: "Striping", unit: "LF", quantity: mapCounts.curb, unitPrice: prices.curb },
    { id: "sealcoat", name: "Sealcoat — single coat", category: "Surface", unit: "sqft", quantity: mapCounts.sealcoat, unitPrice: prices.sealcoat },
    { id: "mobilization", name: "Mobilization", category: "Job", unit: "flat", quantity: 1, unitPrice: prices.mobilization },
  ].filter((item) => item.quantity > 0), [adaStalls, arrows, mapCounts, prices, standardStalls, stopBars]);

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

  function selectAddress(result: GeocodeResult) {
    setAddress(result.label);
    setSiteAddress(result.label);
    setResults([]);
    mapRef.current?.flyTo([result.lat, result.lng], 18, { duration: 1.2 });
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

  function removeMeasurement(id: string) {
    const layer = layerByMeasurementRef.current.get(id);
    if (layer && mapRef.current) mapRef.current.removeLayer(layer);
    layerByMeasurementRef.current.delete(id);
    setMeasurements((current) => current.filter((measurement) => measurement.id !== id));
  }

  function saveEstimate() {
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
      page.drawText("Evergreen Distribution", { x: 42, y: 630, size: 18, font: bold, color: ink });
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
        <div className="quote-header-site"><span>ESTIMATE</span><strong>Evergreen Distribution</strong><small>{siteAddress}</small></div>
        <div className="quote-header-actions"><span className="autosave-status"><i /> LOCAL DEMO</span><button onClick={saveEstimate}>SAVE DRAFT</button><button className="export-button" onClick={exportProposal} disabled={exporting}>{exporting ? "GENERATING…" : "EXPORT PROPOSAL"} <b>→</b></button></div>
      </header>
      <aside className="quote-sidebar">
        <p>WORKSPACE</p>
        <button className={view === "takeoff" ? "active" : ""} onClick={() => setView("takeoff")}><span>⌖</span> TAKEOFF</button>
        <button className={view === "saved" ? "active" : ""} onClick={() => setView("saved")}><span>▤</span> ESTIMATES <b>{saved.length}</b></button>
        <button className={view === "customers" ? "active" : ""} onClick={() => setView("customers")}><span>◎</span> CUSTOMERS</button>
        <Link href="/"><span>↙</span> MARKETING SITE</Link>
        <div className="quote-sidebar-foot"><p>TAKEOFF STATUS</p><strong>{measurements.length ? "MEASUREMENTS READY" : "START DRAWING"}</strong><span>{measurements.length} mapped object{measurements.length === 1 ? "" : "s"}</span></div>
      </aside>

      {view === "takeoff" && <section className="takeoff-main">
        <div className="takeoff-toolbar">
          <form onSubmit={searchAddress} className="workspace-address-search"><span>⌕</span><input value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Property address" /><button disabled={searching}>{searching ? "SEARCHING…" : "FIND LOT"}</button></form>
          <div className="imagery-chip"><i /> ESRI WORLD IMAGERY <span>GSD UNKNOWN</span></div>
          {results.length > 1 && <div className="address-results">{results.map((result) => <button key={`${result.lat}-${result.lng}`} onClick={() => selectAddress(result)}>{result.label}</button>)}</div>}
          {searchError && <p className="workspace-error">{searchError}</p>}
        </div>
        <div className="map-stage">
          <div ref={mapElementRef} className="live-map" />
          <div className="map-draw-tools" aria-label="Map measurement tools"><button className={drawMode === "Polygon" ? "active" : ""} onClick={() => startDrawing("Polygon")}>▰ AREA</button><button className={drawMode === "Line" ? "active" : ""} onClick={() => startDrawing("Line")}>╱ LENGTH</button><button className={drawMode === "Marker" ? "active" : ""} onClick={() => startDrawing("Marker")}>• COUNT</button></div>
          <div className="map-instructions"><strong>DRAW THE TAKEOFF</strong><span>Polygon = paved area</span><span>Line = curb footage</span><span>Marker = parking stall</span></div>
          <div className="assist-banner"><span>SMART DETECTION</span><strong>Connector ready for a future vision service</strong><small>Manual tools are live and editable today.</small></div>
        </div>
        <aside className="estimate-panel">
          <div className="estimate-panel-head"><div><p>LIVE ESTIMATE</p><h1>{currency.format(calculation.total)}</h1></div><span>{quoteItems.length} ITEMS</span></div>
          <div className="material-switch"><span>MATERIAL</span><button className={material === "paint" ? "selected" : ""} onClick={() => setMaterial("paint")}>PAINT <small>1.0×</small></button><button className={material === "thermoplastic" ? "selected" : ""} onClick={() => setMaterial("thermoplastic")}>THERMO <small>2.8×</small></button></div>
          <div className="manual-counts">
            <div className="panel-section-title"><span>MANUAL COUNTS</span><small>{mapCounts.stalls ? "STALLS USE MAP MARKERS" : "ENTER COUNTS"}</small></div>
            <label>Standard stalls<input type="number" min="0" value={mapCounts.stalls || standardStalls} disabled={mapCounts.stalls > 0} onChange={(event) => setStandardStalls(Number(event.target.value))} /></label>
            <label>ADA stalls<input type="number" min="0" value={adaStalls} onChange={(event) => setAdaStalls(Number(event.target.value))} /></label>
            <label>Directional arrows<input type="number" min="0" value={arrows} onChange={(event) => setArrows(Number(event.target.value))} /></label>
            <label>Stop bars (12 LF)<input type="number" min="0" value={stopBars} onChange={(event) => setStopBars(Number(event.target.value))} /></label>
          </div>
          <div className="measurement-list">
            <div className="panel-section-title"><span>MAP MEASUREMENTS</span><small>{measurements.length} TOTAL</small></div>
            {!measurements.length ? <div className="empty-measurements"><b>⌖</b><span>Use the map tools to add area, length, or count measurements.</span></div> : measurements.map((item) => <div key={item.id} className="measurement-row"><i className={`measure-icon-${item.kind}`}>{item.kind === "area" ? "▰" : item.kind === "length" ? "╱" : "•"}</i><span><strong>{item.label}</strong><small>{number.format(item.value)} {item.unit}</small></span><button onClick={() => removeMeasurement(item.id)} aria-label={`Remove ${item.label}`}>×</button></div>)}
          </div>
          <div className="estimate-lines">
            <div className="panel-section-title"><span>PRICED SCOPE</span><small>EDIT UNIT PRICE</small></div>
            {quoteItems.map((item) => <div className="estimate-line" key={item.id}><span><strong>{item.name}</strong><small>{number.format(item.quantity)} {item.unit}</small></span><label>$<input aria-label={`${item.name} unit price`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setPrices((current) => ({ ...current, [item.id]: Number(event.target.value) }))} /></label><b>{currency.format(item.quantity * item.unitPrice * (item.category === "Striping" ? materialMultiplier : 1))}</b></div>)}
          </div>
          <div className="estimate-total"><span><small>SUBTOTAL</small><b>{currency.format(calculation.rawSubtotal)}</b></span>{calculation.minimumApplied && <span className="minimum-line"><small>MINIMUM JOB CHARGE APPLIED</small><b>{currency.format(calculation.total)}</b></span>}<div><span>TOTAL</span><strong>{currency.format(calculation.total)}</strong></div></div>
          {exportMessage && <p className="export-message">{exportMessage}</p>}
        </aside>
      </section>}

      {view === "saved" && <section className="workspace-list-view"><header><div><p>ESTIMATES</p><h1>Quote pipeline</h1></div><button onClick={() => setView("takeoff")}>＋ NEW ESTIMATE</button></header><div className="pipeline-tabs"><button className="active">ALL <b>{saved.length}</b></button><button>DRAFT</button><button>SENT</button><button>APPROVED</button></div><div className="saved-table"><div className="saved-table-head"><span>SITE</span><span>MEASUREMENTS</span><span>TOTAL</span><span>UPDATED</span></div>{!saved.length ? <div className="saved-empty"><strong>No saved estimates yet.</strong><span>Build a takeoff and save the draft to see it here.</span><button onClick={() => setView("takeoff")}>START A TAKEOFF</button></div> : saved.map((estimate) => <button key={estimate.id} className="saved-row" onClick={() => { setSiteAddress(estimate.address); setAddress(estimate.address); setView("takeoff"); }}><span><strong>Evergreen Distribution</strong><small>{estimate.address}</small></span><span>{estimate.measurements}</span><b>{currency.format(estimate.total)}</b><time>{new Date(estimate.updatedAt).toLocaleDateString()}</time></button>)}</div></section>}

      {view === "customers" && <section className="workspace-list-view"><header><div><p>CUSTOMERS</p><h1>Customer directory</h1></div><button>＋ ADD CUSTOMER</button></header><div className="customer-cards"><article><span>ED</span><div><strong>Evergreen Distribution</strong><small>Facilities Management</small><p>742 Evergreen Industrial Way<br />Sacramento, CA</p></div><b>1 ESTIMATE</b></article><article className="customer-placeholder"><strong>Minimal CRM by design.</strong><p>Customer and site records stay attached to every estimate without adding scheduling or dispatch clutter.</p></article></div></section>}
    </main>
  );
}
