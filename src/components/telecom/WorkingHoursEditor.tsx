import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, RotateCcw, Save } from "lucide-react";
import type { WorkingHourDay } from "@/hooks/useMyTelecomSettings";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function defaultDay(d: number): WorkingHourDay {
  const weekday = d >= 1 && d <= 5;
  return {
    day_of_week: d,
    is_working_day: weekday,
    start_time: "09:00",
    end_time: "17:00",
    break_start: null,
    break_end: null,
    timezone: "America/Toronto",
  };
}

type Props = {
  initial: WorkingHourDay[];
  saving?: boolean;
  resetting?: boolean;
  lang?: "en" | "fr";
  onSave: (days: WorkingHourDay[]) => void;
  onResetOrgDefault: () => void;
};

export default function WorkingHoursEditor({
  initial, saving, resetting, lang = "en", onSave, onResetOrgDefault,
}: Props) {
  const [days, setDays] = useState<WorkingHourDay[]>(() => {
    const byDow = new Map((initial ?? []).map((d) => [d.day_of_week, d]));
    return Array.from({ length: 7 }, (_, i) => byDow.get(i) ?? defaultDay(i));
  });

  useEffect(() => {
    const byDow = new Map((initial ?? []).map((d) => [d.day_of_week, d]));
    setDays(Array.from({ length: 7 }, (_, i) => byDow.get(i) ?? defaultDay(i)));
  }, [initial]);

  const labels = lang === "fr" ? DAY_LABELS_FR : DAY_LABELS;

  const update = (i: number, patch: Partial<WorkingHourDay>) =>
    setDays((arr) => arr.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2">
        <div className="col-span-2">{lang === "fr" ? "Jour" : "Day"}</div>
        <div className="col-span-2">{lang === "fr" ? "Actif" : "Active"}</div>
        <div className="col-span-3">{lang === "fr" ? "Début" : "Start"}</div>
        <div className="col-span-3">{lang === "fr" ? "Fin" : "End"}</div>
        <div className="col-span-2">{lang === "fr" ? "Fuseau" : "Timezone"}</div>
      </div>
      {days.map((d, i) => (
        <div key={d.day_of_week} className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded-md px-2 py-2">
          <Label className="col-span-2 text-sm font-medium">{labels[d.day_of_week]}</Label>
          <div className="col-span-2">
            <Switch checked={d.is_working_day} onCheckedChange={(v) => update(i, { is_working_day: v })} />
          </div>
          <Input
            type="time"
            className="col-span-3 h-8"
            value={d.start_time?.slice(0, 5) ?? "09:00"}
            disabled={!d.is_working_day}
            onChange={(e) => update(i, { start_time: e.target.value })}
          />
          <Input
            type="time"
            className="col-span-3 h-8"
            value={d.end_time?.slice(0, 5) ?? "17:00"}
            disabled={!d.is_working_day}
            onChange={(e) => update(i, { end_time: e.target.value })}
          />
          <Input
            className="col-span-2 h-8 text-xs"
            value={d.timezone ?? "America/Toronto"}
            onChange={(e) => update(i, { timezone: e.target.value })}
          />
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2">
        <Button onClick={() => onSave(days)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {lang === "fr" ? "Enregistrer" : "Save"}
        </Button>
        <Button variant="outline" onClick={onResetOrgDefault} disabled={resetting}>
          {resetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
          {lang === "fr" ? "Défaut org" : "Reset to org default"}
        </Button>
      </div>
    </div>
  );
}
