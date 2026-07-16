import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import type { CallHandling } from "@/hooks/useMyTelecomSettings";

type Props = {
  initial: CallHandling | null;
  saving?: boolean;
  lang?: "en" | "fr";
  onSave: (h: CallHandling) => void;
};

const t = (lang: "en" | "fr", k: string) => {
  const dict: Record<string, { en: string; fr: string }> = {
    availability: { en: "Availability", fr: "Disponibilité" },
    after_hours: { en: "After-hours call handling", fr: "Routage hors-heures" },
    voicemail: { en: "Send to voicemail", fr: "Envoyer à la messagerie" },
    forward_ext: { en: "Forward to extension", fr: "Renvoyer vers extension" },
    forward_ext_ph: { en: "Extension number", fr: "Numéro d'extension" },
    forward_external: { en: "Forward to external number", fr: "Renvoyer vers numéro externe" },
    forward_external_ph: { en: "+1 555 000 0000", fr: "+1 555 000 0000" },
    follow_default: { en: "Follow organization default", fr: "Suivre la valeur par défaut de l'organisation" },
    save: { en: "Save", fr: "Enregistrer" },
    available: { en: "Available", fr: "Disponible" },
    busy: { en: "Busy", fr: "Occupé" },
    dnd: { en: "Do not disturb", fr: "Ne pas déranger" },
    away: { en: "Away", fr: "Absent" },
    vacation: { en: "Vacation", fr: "Vacances" },
  };
  return dict[k]?.[lang] ?? k;
};

export default function AfterHoursPanel({ initial, saving, lang = "en", onSave }: Props) {
  const [availability, setAvailability] = useState<CallHandling["availability"]>(initial?.availability ?? "available");
  const [action, setAction] = useState<CallHandling["after_hours_action"]>(initial?.after_hours_action ?? "voicemail");
  const [target, setTarget] = useState<string>(initial?.forward_target ?? "");

  useEffect(() => {
    setAvailability(initial?.availability ?? "available");
    setAction(initial?.after_hours_action ?? "voicemail");
    setTarget(initial?.forward_target ?? "");
  }, [initial]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>{t(lang, "availability")}</Label>
        <Select value={availability} onValueChange={(v) => setAvailability(v as any)}>
          <SelectTrigger className="w-full max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["available", "busy", "dnd", "away", "vacation"] as const).map((v) => (
              <SelectItem key={v} value={v}>{t(lang, v)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>{t(lang, "after_hours")}</Label>
        <RadioGroup value={action} onValueChange={(v) => setAction(v as any)} className="space-y-2">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="voicemail" id="ah-vm" />
            <Label htmlFor="ah-vm" className="font-normal">{t(lang, "voicemail")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="forward_extension" id="ah-ext" />
            <Label htmlFor="ah-ext" className="font-normal">{t(lang, "forward_ext")}</Label>
            {action === "forward_extension" && (
              <Input
                className="h-8 w-40 ml-2"
                placeholder={t(lang, "forward_ext_ph")}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="forward_external" id="ah-extn" />
            <Label htmlFor="ah-extn" className="font-normal">{t(lang, "forward_external")}</Label>
            {action === "forward_external" && (
              <Input
                className="h-8 w-48 ml-2"
                placeholder={t(lang, "forward_external_ph")}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="follow_org_default" id="ah-def" />
            <Label htmlFor="ah-def" className="font-normal">{t(lang, "follow_default")}</Label>
          </div>
        </RadioGroup>
      </div>

      <Button
        onClick={() => onSave({
          availability,
          after_hours_action: action,
          forward_target: action === "forward_extension" || action === "forward_external" ? target : null,
        })}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        {t(lang, "save")}
      </Button>
    </div>
  );
}
