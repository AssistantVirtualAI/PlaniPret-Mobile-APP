// 24h SIP stability monitor.
//
// Records every registration / disconnection event emitted by ppSipProvider in
// a rolling 24h window persisted to localStorage, so a full-day soak test can
// be reviewed from the SIP Debug screen (or exported) without Xcode attached.
import { ppSipProvider, type PpSipEvent } from "./ppSipProvider";

const KEY = "pp_sip_stability_v1";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type SipIncidentKind = "ws_disconnect" | "registration_failed" | "unregistered" | "registered";

export interface SipIncident {
  t: number;
  kind: SipIncidentKind;
  detail?: string;
}

export interface SipStabilityReport {
  startedAt: number;
  windowHours: number;
  incidents: SipIncident[];
  counts: Record<SipIncidentKind, number>;
  registeredRatio: number | null;
  lastRegisteredAt: number | null;
  longestGapMs: number;
  verdict: "stable" | "degraded" | "unstable" | "collecting";
}

interface Store {
  startedAt: number;
  incidents: SipIncident[];
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (Array.isArray(s?.incidents)) return s;
    }
  } catch { /* ignore */ }
  return { startedAt: Date.now(), incidents: [] };
}

function save(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
}

function prune(s: Store): Store {
  const cutoff = Date.now() - WINDOW_MS;
  s.incidents = s.incidents.filter((i) => i.t >= cutoff).slice(-2000);
  if (s.startedAt < cutoff) s.startedAt = cutoff;
  return s;
}

function classify(e: PpSipEvent): SipIncidentKind | null {
  const ev = String(e.event || "");
  if (/ws disconnected/i.test(ev)) return "ws_disconnect";
  if (/registration failed/i.test(ev)) return "registration_failed";
  if (/unregistered/i.test(ev)) return "unregistered";
  if (/^registered$/i.test(ev) || /register(ed)? ok/i.test(ev)) return "registered";
  return null;
}

let started = false;
let lastSeen = 0;

export function startSipStabilityMonitor(): () => void {
  if (started || typeof window === "undefined") return () => undefined;
  started = true;

  const store = prune(load());
  save(store);

  const unsubEvents = ppSipProvider.subscribeEvents((events: PpSipEvent[]) => {
    let changed = false;
    for (const e of events) {
      if (!e?.time || e.time <= lastSeen) continue;
      lastSeen = e.time;
      const kind = classify(e);
      if (!kind) continue;
      store.incidents.push({ t: e.time, kind, detail: e.detail ? String(e.detail).slice(0, 120) : undefined });
      changed = true;
    }
    if (changed) { prune(store); save(store); }
  });

  const unsubSnap = ppSipProvider.subscribe((snap) => {
    if (snap.status === "registered" && snap.lastRegistrationAt && snap.lastRegistrationAt > lastSeen) {
      lastSeen = snap.lastRegistrationAt;
      store.incidents.push({ t: snap.lastRegistrationAt, kind: "registered" });
      prune(store);
      save(store);
    }
  });

  return () => { unsubEvents(); unsubSnap(); started = false; };
}

export function getSipStabilityReport(): SipStabilityReport {
  const store = prune(load());
  const counts: Record<SipIncidentKind, number> = {
    ws_disconnect: 0, registration_failed: 0, unregistered: 0, registered: 0,
  };
  for (const i of store.incidents) counts[i.kind] = (counts[i.kind] ?? 0) + 1;

  const registered = store.incidents.filter((i) => i.kind === "registered");
  const lastRegisteredAt = registered.length ? registered[registered.length - 1].t : null;

  // Longest interval between two successful registrations (proxy for downtime).
  let longestGapMs = 0;
  const marks = [store.startedAt, ...registered.map((r) => r.t), Date.now()];
  for (let i = 1; i < marks.length; i++) longestGapMs = Math.max(longestGapMs, marks[i] - marks[i - 1]);

  const elapsed = Date.now() - store.startedAt;
  const failures = counts.ws_disconnect + counts.registration_failed;
  const hours = Math.max(elapsed / 3_600_000, 0.01);
  const failuresPerHour = failures / hours;

  const verdict: SipStabilityReport["verdict"] =
    elapsed < 30 * 60 * 1000 ? "collecting"
      : failuresPerHour === 0 ? "stable"
        : failuresPerHour < 1 ? "degraded"
          : "unstable";

  return {
    startedAt: store.startedAt,
    windowHours: Math.min(24, elapsed / 3_600_000),
    incidents: store.incidents.slice(-200).reverse(),
    counts,
    registeredRatio: registered.length ? registered.length / (registered.length + failures) : null,
    lastRegisteredAt,
    longestGapMs,
    verdict,
  };
}

export function resetSipStability() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  lastSeen = 0;
}

export function exportSipStability(): string {
  const r = getSipStabilityReport();
  return [
    `SIP stability — window ${r.windowHours.toFixed(1)}h (started ${new Date(r.startedAt).toISOString()})`,
    `Verdict: ${r.verdict}`,
    `ws_disconnect: ${r.counts.ws_disconnect} | registration_failed: ${r.counts.registration_failed} | unregistered: ${r.counts.unregistered} | registered: ${r.counts.registered}`,
    `Longest gap without REGISTER: ${(r.longestGapMs / 60000).toFixed(1)} min`,
    "",
    ...r.incidents.map((i) => `${new Date(i.t).toISOString()} ${i.kind}${i.detail ? " — " + i.detail : ""}`),
  ].join("\n");
}
