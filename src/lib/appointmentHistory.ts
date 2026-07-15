/**
 * Local history of appointments created via AppointmentSheet.
 * Persisted per-device in localStorage. Emits `planipret:appointments-changed`
 * so any open history view refreshes immediately.
 */
export type ApptStatus = "created" | "error" | "canceled";

export type ApptHistoryEntry = {
  id: string;
  created_at: string;      // ISO
  status: ApptStatus;
  title: string;
  start_at: string;        // ISO
  end_at: string;          // ISO
  duration_min: number;
  contact_name: string;
  maestro_client_id?: string;
  notes?: string;
  type?: string;
  error?: string;
  remote_id?: string;      // maestro/backend id if returned
};

const KEY = "planipret.appointments.history.v1";
const EVT = "planipret:appointments-changed";
const MAX = 200;

export function loadAppointments(): ApptHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveAppointment(entry: Omit<ApptHistoryEntry, "id" | "created_at"> & Partial<Pick<ApptHistoryEntry, "id" | "created_at">>): ApptHistoryEntry {
  const full: ApptHistoryEntry = {
    id: entry.id ?? (crypto.randomUUID?.() ?? String(Date.now())),
    created_at: entry.created_at ?? new Date().toISOString(),
    ...entry,
  } as ApptHistoryEntry;
  const cur = loadAppointments();
  const next = [full, ...cur].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  try { window.dispatchEvent(new Event(EVT)); } catch {}
  return full;
}

export function subscribeAppointments(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", (e) => { if (e.key === KEY) cb(); });
  return () => {
    window.removeEventListener(EVT, handler);
  };
}
