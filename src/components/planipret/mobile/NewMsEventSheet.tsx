import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, CalendarPlus, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultDate: Date;
  lang: string;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function toLocalDateTimeInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIsoFromInput(v: string) {
  // v is "YYYY-MM-DDTHH:mm" local — convert to ISO
  return new Date(v).toISOString();
}

export default function NewMsEventSheet({ open, onClose, onCreated, defaultDate, lang }: Props) {
  const isEn = lang === "en";

  const defaultStart = new Date(defaultDate);
  defaultStart.setHours(9, 0, 0, 0);
  const defaultEnd = new Date(defaultDate);
  defaultEnd.setHours(10, 0, 0, 0);

  const [title, setTitle] = useState("");
  const [start, setStart] = useState(toLocalDateTimeInput(defaultStart));
  const [end, setEnd] = useState(toLocalDateTimeInput(defaultEnd));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [attendees, setAttendees] = useState("");
  const [teams, setTeams] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error(isEn ? "Title is required" : "Le titre est requis");
      return;
    }
    const startIso = toIsoFromInput(start);
    const endIso = toIsoFromInput(end);
    if (new Date(endIso) <= new Date(startIso)) {
      toast.error(isEn ? "End must be after start" : "La fin doit être après le début");
      return;
    }
    setSaving(true);
    try {
      const attendeeList = attendees
        .split(/[,;\n]/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));

      const { data, error } = await supabase.functions.invoke("ms365-actions", {
        body: {
          action: "create_event",
          payload: {
            subject: title.trim(),
            start: { dateTime: startIso, timeZone: "America/Toronto" },
            end: { dateTime: endIso, timeZone: "America/Toronto" },
            body: notes.trim() ? notes.trim() : undefined,
            location: location.trim() ? { displayName: location.trim() } : undefined,
            attendees: attendeeList,
            isOnlineMeeting: teams,
            onlineMeetingProvider: teams ? "teamsForBusiness" : undefined,
          },
        },
      });
      if (error || (data as any)?.success === false) {
        throw new Error((data as any)?.error ?? error?.message ?? "Erreur création événement");
      }
      toast.success(isEn ? "Event created!" : "Événement créé !");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full rounded-t-2xl flex flex-col overflow-hidden"
        style={{ background: "var(--pp-bg-surface)", maxHeight: "90dvh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--pp-bg-border)" }}>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: "var(--pp-text-muted)", background: "var(--pp-bg-elevated)" }}>
            <X className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold" style={{ color: "var(--pp-text-primary)" }}>
            {isEn ? "New Event" : "Nouvel événement"}
          </h2>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-1.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60"
            style={{ background: "var(--pp-brand-accent)", color: "#fff" }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
            {isEn ? "Create" : "Créer"}
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
              style={{ color: "var(--pp-text-muted)" }}>
              {isEn ? "Title *" : "Titre *"}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isEn ? "Meeting title" : "Titre du rendez-vous"}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
            />
          </div>

          {/* Start / End */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
                style={{ color: "var(--pp-text-muted)" }}>
                {isEn ? "Start" : "Début"}
              </label>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
                style={{ color: "var(--pp-text-muted)" }}>
                {isEn ? "End" : "Fin"}
              </label>
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
              style={{ color: "var(--pp-text-muted)" }}>
              {isEn ? "Location" : "Lieu"}
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={isEn ? "Optional" : "Optionnel"}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
            />
          </div>

          {/* Attendees */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
              style={{ color: "var(--pp-text-muted)" }}>
              {isEn ? "Attendees (emails, comma-separated)" : "Participants (courriels, séparés par virgule)"}
            </label>
            <input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="email@example.com, email2@example.com"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
              style={{ color: "var(--pp-text-muted)" }}>
              {isEn ? "Notes" : "Notes"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={isEn ? "Optional description" : "Description optionnelle"}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)", color: "var(--pp-text-primary)" }}
            />
          </div>

          {/* Teams toggle */}
          <div className="flex items-center justify-between py-2 px-3 rounded-xl"
            style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border-2)" }}>
            <span className="text-sm font-medium" style={{ color: "var(--pp-text-primary)" }}>
              {isEn ? "Add Teams meeting link" : "Ajouter un lien Teams"}
            </span>
            <button
              onClick={() => setTeams(!teams)}
              className="w-12 h-6 rounded-full transition-colors relative"
              style={{ background: teams ? "var(--pp-brand-accent)" : "var(--pp-bg-border-2)" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: teams ? "translateX(26px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
