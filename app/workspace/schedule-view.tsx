"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type JobStatus = "scheduled" | "in_progress" | "completed";
type ScheduledJob = {
  id: string; title: string; address: string; lat: number; lng: number; startDate: string; endDate: string;
  crew: string; status: JobStatus; notes: string; createdAt: string; updatedAt: string;
};
type WeatherDay = {
  date: string; level: "good" | "watch" | "high"; reasons: string[]; temperatureMax: number; temperatureMin: number;
  precipitationProbability: number; precipitationInches: number; windGustMph: number;
};
type JobDraft = Omit<ScheduledJob, "id" | "createdAt" | "updatedAt">;

const statusLabels: Record<JobStatus, string> = { scheduled: "Scheduled", in_progress: "In progress", completed: "Completed" };
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const shortDay = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function initialDraft(date = dateKey(new Date())): JobDraft {
  return { title: "", address: "", lat: 0, lng: 0, startDate: date, endDate: date, crew: "", status: "scheduled", notes: "" };
}

export function ScheduleView() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [forecast, setForecast] = useState<Record<string, WeatherDay>>({});
  const [editing, setEditing] = useState<ScheduledJob | null>(null);
  const [draft, setDraft] = useState<JobDraft>(() => initialDraft());
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const gridStart = useMemo(() => addDays(month, -month.getDay()), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart]);
  const gridEnd = days[41];

  useEffect(() => {
    let alive = true;
    void fetch(`/api/schedule/jobs?from=${dateKey(gridStart)}&to=${dateKey(gridEnd)}`)
      .then(async (response) => {
        const result = await response.json() as { jobs?: ScheduledJob[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load scheduled jobs.");
        if (alive) { setJobs(result.jobs || []); setMessage(""); }
      })
      .catch((error: Error) => alive && setMessage(error.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [gridEnd, gridStart]);

  useEffect(() => {
    let alive = true;
    const locations = new Map<string, { lat: number; lng: number }>();
    for (const job of jobs) locations.set(`${job.lat.toFixed(4)},${job.lng.toFixed(4)}`, { lat: job.lat, lng: job.lng });
    void Promise.all([...locations.entries()].map(async ([locationKey, location]) => {
      const response = await fetch(`/api/weather/forecast?lat=${location.lat}&lng=${location.lng}`);
      const result = await response.json() as { days?: WeatherDay[] };
      return response.ok ? { locationKey, days: result.days || [] } : { locationKey, days: [] };
    })).then((results) => {
      if (!alive) return;
      const next: Record<string, WeatherDay> = {};
      for (const result of results) for (const day of result.days) next[`${result.locationKey}:${day.date}`] = day;
      setForecast(next);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [jobs]);

  function weatherFor(job: ScheduledJob, date = job.startDate) {
    return forecast[`${job.lat.toFixed(4)},${job.lng.toFixed(4)}:${date}`];
  }

  function openNew(date = dateKey(new Date())) {
    setEditing(null); setDraft(initialDraft(date)); setConfirmDelete(false); setEditorOpen(true);
  }

  function showMonth(next: Date) {
    setLoading(true);
    setMonth(next);
  }

  function openJob(job: ScheduledJob) {
    setEditing(job); setDraft({ title: job.title, address: job.address, lat: job.lat, lng: job.lng, startDate: job.startDate, endDate: job.endDate, crew: job.crew, status: job.status, notes: job.notes });
    setConfirmDelete(false); setEditorOpen(true);
  }

  async function saveJob(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      let coordinates = { lat: draft.lat, lng: draft.lng };
      if (!editing || draft.address !== editing.address || !coordinates.lat || !coordinates.lng) {
        const geocodeResponse = await fetch(`/api/geocode?q=${encodeURIComponent(draft.address)}`);
        const geocode = await geocodeResponse.json() as { results?: Array<{ lat: number; lng: number }>; error?: string };
        if (!geocodeResponse.ok || !geocode.results?.length) throw new Error(geocode.error || "Address could not be located.");
        coordinates = geocode.results[0];
      }
      const payload = { ...draft, ...coordinates };
      const response = await fetch(editing ? `/api/schedule/jobs/${editing.id}` : "/api/schedule/jobs", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json() as { job?: ScheduledJob; error?: string };
      if (!response.ok || !result.job) throw new Error(result.error || "Job could not be saved.");
      setJobs((current) => editing ? current.map((job) => job.id === result.job?.id ? result.job : job) : [...current, result.job!]);
      setEditorOpen(false); setMessage(editing ? "Job updated." : "Job added to the schedule.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Job could not be saved."); }
    finally { setSaving(false); }
  }

  async function removeJob() {
    if (!editing) return;
    const response = await fetch(`/api/schedule/jobs/${editing.id}`, { method: "DELETE" });
    if (response.ok) { setJobs((current) => current.filter((job) => job.id !== editing.id)); setEditorOpen(false); setMessage("Job removed from the schedule."); }
    else setMessage("Job could not be removed.");
  }

  const atRisk = jobs
    .map((job) => ({ job, weather: weatherFor(job) }))
    .filter((item): item is { job: ScheduledJob; weather: WeatherDay } => Boolean(item.weather && item.weather.level !== "good"))
    .sort((a, b) => a.job.startDate.localeCompare(b.job.startDate));

  return <section className="workspace-list-view schedule-view">
    <header><div><p>SCALE PLAN · JOB OPERATIONS</p><h1>Schedule + weather</h1></div><button onClick={() => openNew()}>＋ ADD JOB</button></header>
    <div className="weather-overview">
      <div><span>16-DAY WEATHER LOOKAHEAD</span><strong>{atRisk.length ? `${atRisk.length} upcoming job${atRisk.length === 1 ? "" : "s"} need attention` : "No weather risks found"}</strong><small>Rain, temperature and wind screening for scheduled job locations.</small></div>
      <div className="weather-legend"><span className="risk-good"><i />GOOD</span><span className="risk-watch"><i />WATCH</span><span className="risk-high"><i />HIGH RISK</span></div>
    </div>
    {message && <p className="schedule-message">{message}</p>}
    <div className="schedule-layout">
      <div className="calendar-card">
        <div className="calendar-toolbar"><button aria-label="Previous month" onClick={() => showMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button><button onClick={() => showMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>TODAY</button><h2>{monthFormatter.format(month)}</h2><button aria-label="Next month" onClick={() => showMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button></div>
        <div className="calendar-weekdays">{days.slice(0, 7).map((day) => <span key={day.toISOString()}>{shortDay.format(day)}</span>)}</div>
        <div className="calendar-grid">{days.map((day) => {
          const key = dateKey(day);
          const dayJobs = jobs.filter((job) => job.startDate <= key && job.endDate >= key);
          const today = key === dateKey(new Date());
          return <div key={key} className={`${day.getMonth() !== month.getMonth() ? "outside" : ""} ${today ? "today" : ""}`}>
            <button className="calendar-date" onClick={() => openNew(key)} aria-label={`Add job on ${day.toLocaleDateString()}`}>{day.getDate()}</button>
            {dayJobs.slice(0, 3).map((job) => { const weather = weatherFor(job, key); return <button className={`calendar-job status-${job.status}`} key={job.id} onClick={() => openJob(job)}><i className={`risk-${weather?.level || "unknown"}`} /><span>{job.title}</span><small>{job.crew || "Crew unassigned"}</small></button>; })}
            {dayJobs.length > 3 && <span className="calendar-more">+{dayJobs.length - 3} more</span>}
          </div>;
        })}</div>
        {loading && <div className="calendar-loading">LOADING SCHEDULE…</div>}
      </div>
      <aside className="risk-panel">
        <div><span>UPCOMING RISKS</span><b>{atRisk.length}</b></div>
        {!atRisk.length ? <p>Scheduled work inside the forecast window looks clear. Forecasts become less certain farther out.</p> : atRisk.map(({ job, weather }) => <button key={job.id} onClick={() => openJob(job)}>
          <i className={`risk-${weather.level}`} /><span><strong>{job.title}</strong><small>{parseDate(job.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {job.address}</small><em>{weather.reasons.join(" · ")}</em></span><b>{weather.precipitationProbability}%</b>
        </button>)}
        <footer><span>FORECAST SCREENING ONLY</span><p>Confirm pavement condition and the selected coating manufacturer’s limits before dispatch.</p><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">WEATHER DATA BY OPEN-METEO.COM ↗</a></footer>
      </aside>
    </div>
    {editorOpen && <div className="schedule-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditorOpen(false)}><form className="schedule-editor" onSubmit={saveJob}>
      <header><div><span>{editing ? "EDIT SCHEDULED JOB" : "NEW SCHEDULED JOB"}</span><h2>{editing ? editing.title : "Add work to the calendar"}</h2></div><button type="button" aria-label="Close job editor" onClick={() => setEditorOpen(false)}>×</button></header>
      <label>JOB NAME<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="North Park restripe" minLength={2} required /></label>
      <label>PROPERTY ADDRESS<input value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} placeholder="3008 El Cajon Blvd, San Diego, CA" required /></label>
      <div className="schedule-editor-row"><label>START DATE<input type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value, endDate: current.endDate < event.target.value ? event.target.value : current.endDate }))} required /></label><label>END DATE<input type="date" min={draft.startDate} value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} required /></label></div>
      <div className="schedule-editor-row"><label>CREW<input value={draft.crew} onChange={(event) => setDraft((current) => ({ ...current, crew: event.target.value }))} placeholder="Crew A" /></label><label>STATUS<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as JobStatus }))}>{(Object.keys(statusLabels) as JobStatus[]).map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label></div>
      <label>NOTES<textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Arrival window, customer contact, materials or site instructions" /></label>
      <div className="schedule-editor-actions">{editing && (confirmDelete ? <><button type="button" className="delete-confirm" onClick={() => void removeJob()}>CONFIRM REMOVE</button><button type="button" onClick={() => setConfirmDelete(false)}>CANCEL</button></> : <button type="button" className="delete-job" onClick={() => setConfirmDelete(true)}>REMOVE JOB</button>)}<button className="save-job" disabled={saving}>{saving ? "SAVING…" : editing ? "SAVE CHANGES →" : "ADD TO CALENDAR →"}</button></div>
    </form></div>}
  </section>;
}
