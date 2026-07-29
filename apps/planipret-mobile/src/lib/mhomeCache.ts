// Session cache for MHome to render instantly on remount.
export type MHomeStats = {
  calls: number; missed: number; sms: number; voicemails: number;
  meetings: number; hotLeads: number; tasks: number; outbound: number;
};

// Every Home KPI is derived from an upstream source. We record the last time
// each source produced a value plus whether it was OK/degraded/failed so the
// KPI Audit screen can surface exactly what is connected and when.
export type SourceKey =
  | "ns_cdr" | "ns_sms" | "ns_voicemail"
  | "sb_calls" | "sb_missed" | "sb_sms_unread" | "sb_voicemails"
  | "sb_hot_leads" | "sb_tasks" | "sb_outbound"
  | "sb_appointments" | "ms365_calendar" | "ava_brief";

export type SourceStatus = {
  status: "ok" | "empty" | "error" | "timeout" | "unknown";
  lastAt: number | null;
  message?: string | null;
};

export type SourceStatusMap = Partial<Record<SourceKey, SourceStatus>>;

export type MHomeCache = {
  period: string;
  stats: MHomeStats;
  recent: any[];
  hotLeads: any[];
  dueReminders: any[];
  meetings: any[];
  msMeetings: any[];
  brief: any | null;
  sources: SourceStatusMap;
  cachedAt: number;
};

const KEY_PREFIX = "planipret.mhome.cache.v2";

const emptyStats: MHomeStats = {
  calls: 0, missed: 0, sms: 0, voicemails: 0,
  meetings: 0, hotLeads: 0, tasks: 0, outbound: 0,
};

export function keyFor(userId: string | undefined | null, period: string) {
  return `${KEY_PREFIX}:${userId || "anon"}:${period}`;
}

export function loadMHomeCache(userId: string | undefined | null, period: string): MHomeCache | null {
  try {
    const raw = sessionStorage.getItem(keyFor(userId, period));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return {
      period,
      stats: { ...emptyStats, ...(v.stats || {}) },
      recent: Array.isArray(v.recent) ? v.recent : [],
      hotLeads: Array.isArray(v.hotLeads) ? v.hotLeads : [],
      dueReminders: Array.isArray(v.dueReminders) ? v.dueReminders : [],
      meetings: Array.isArray(v.meetings) ? v.meetings : [],
      msMeetings: Array.isArray(v.msMeetings) ? v.msMeetings : [],
      brief: v.brief ?? null,
      sources: (v.sources && typeof v.sources === "object") ? v.sources : {},
      cachedAt: Number(v.cachedAt || Date.now()),
    };
  } catch { return null; }
}

export function saveMHomeCache(userId: string | undefined | null, period: string, patch: Partial<MHomeCache>) {
  try {
    const current = loadMHomeCache(userId, period) ?? {
      period, stats: emptyStats, recent: [], hotLeads: [], dueReminders: [],
      meetings: [], msMeetings: [], brief: null, sources: {}, cachedAt: Date.now(),
    };
    const mergedSources: SourceStatusMap = { ...current.sources, ...(patch.sources || {}) };
    const next: MHomeCache = { ...current, ...patch, sources: mergedSources, period, cachedAt: Date.now() };
    sessionStorage.setItem(keyFor(userId, period), JSON.stringify(next));
  } catch { /* quota */ }
}

// Static description of every Home KPI's upstream source. Used by the
// KPI Audit page to render "what's wired to what" alongside cache statuses.
export type KpiWiring = {
  id: string;
  label: string;
  source: SourceKey;
  sourceLabel: string;
  description: string;
};

export const HOME_KPI_WIRING: KpiWiring[] = [
  { id: "calls",       label: "Appels",              source: "sb_calls",        sourceLabel: "planipret_phone_calls (+ NS CDR live)", description: "Total d'appels sur la période sélectionnée." },
  { id: "missed",      label: "Manqués",             source: "sb_missed",       sourceLabel: "planipret_phone_calls status=missed",   description: "Appels entrants manqués." },
  { id: "sms",         label: "SMS non lus",         source: "sb_sms_unread",   sourceLabel: "planipret_phone_messages (+ NS SMS)",   description: "Fils SMS avec messages non lus." },
  { id: "meetings",    label: "Rendez-vous",         source: "sb_appointments", sourceLabel: "appointments + Microsoft 365",          description: "Rendez-vous des 7 prochains jours." },
  { id: "hotLeads",    label: "Leads chauds",        source: "sb_hot_leads",    sourceLabel: "planipret_phone_calls lead_score>=7",   description: "Leads chauds sur la période." },
  { id: "tasks",       label: "Tâches",              source: "sb_tasks",        sourceLabel: "planipret_reminders status=pending",    description: "Rappels en attente." },
  { id: "voicemails",  label: "Messages vocaux",     source: "sb_voicemails",   sourceLabel: "planipret_voicemails (+ NS VM live)",   description: "Messages vocaux non écoutés." },
  { id: "outbound",    label: "SMS envoyés",         source: "sb_outbound",     sourceLabel: "planipret_phone_messages outbound",     description: "SMS envoyés sur la période." },
  { id: "brief",       label: "Brief IA",            source: "ava_brief",       sourceLabel: "Edge function pp-ava-brief",            description: "Résumé quotidien généré par AVA." },
  { id: "ms_calendar", label: "Calendrier Microsoft",source: "ms365_calendar",  sourceLabel: "Edge function ms365-actions",           description: "Événements du calendrier MS365." },
];
