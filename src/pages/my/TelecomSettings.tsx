import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Phone, ShieldCheck, AlertTriangle } from "lucide-react";
import { useMyTelecomSettings } from "@/hooks/useMyTelecomSettings";
import WorkingHoursEditor from "@/components/telecom/WorkingHoursEditor";
import AfterHoursPanel from "@/components/telecom/AfterHoursPanel";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function TelecomSettings() {
  const { language } = useLanguage();
  const lang: "en" | "fr" = language === "fr" ? "fr" : "en";
  const { query, saveHours, saveHandling, resetToOrgDefault } = useMyTelecomSettings();

  const data = query.data;
  const ext = data?.extension;

  const handleSaveHours = (days: any[]) => {
    saveHours.mutate(days, {
      onSuccess: () => toast.success(lang === "fr" ? "Heures enregistrées" : "Working hours saved"),
      onError: (e: any) => toast.error(e?.message ?? "save_failed"),
    });
  };

  const handleSaveHandling = (h: any) => {
    saveHandling.mutate(h, {
      onSuccess: () => toast.success(lang === "fr" ? "Routage enregistré" : "Call handling saved"),
      onError: (e: any) => {
        if (e?.message === "forward_external_not_permitted") {
          toast.error(lang === "fr"
            ? "Le renvoi externe n'est pas autorisé par votre organisation."
            : "External forwarding is not permitted by your organization.");
        } else {
          toast.error(e?.message ?? "save_failed");
        }
      },
    });
  };

  const handleReset = () => {
    resetToOrgDefault.mutate(undefined, {
      onSuccess: () => toast.success(lang === "fr" ? "Réinitialisé" : "Reset to org default"),
      onError: (e: any) => toast.error(e?.message ?? "reset_failed"),
    });
  };

  const syncBadge = () => {
    const s = data?.call_handling?.sync_status;
    if (!s) return <Badge variant="secondary">{lang === "fr" ? "Non configuré" : "Not configured"}</Badge>;
    if (s === "synced") return <Badge className="bg-emerald-500/15 text-emerald-700">Synced</Badge>;
    if (s === "pending") return <Badge className="bg-amber-500/15 text-amber-700">Pending</Badge>;
    return <Badge variant="destructive">Failed</Badge>;
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">
          {lang === "fr" ? "Paramètres téléphonie" : "Telecom Settings"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {lang === "fr"
            ? "Gérez votre extension, vos heures de travail et le routage hors-heures."
            : "Manage your extension, working hours and after-hours call handling."}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" /> {lang === "fr" ? "Extension" : "Extension"}
          </CardTitle>
          {ext ? (
            <Badge className="bg-primary/10 text-primary">{ext.extension}@{ext.sip_domain}</Badge>
          ) : (
            <Badge variant="secondary">{lang === "fr" ? "Aucune extension" : "No extension"}</Badge>
          )}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {ext ? (lang === "fr"
            ? "Votre extension SIP est active. Le mot de passe n'est jamais affiché ici."
            : "Your SIP extension is active. The password is never displayed in this app.")
          : (
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              {lang === "fr"
                ? "Aucune extension assignée. Contactez votre administrateur."
                : "No extension assigned. Contact your administrator."}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> {lang === "fr" ? "Heures de travail" : "Working Hours"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : (
            <WorkingHoursEditor
              initial={data?.working_hours ?? []}
              saving={saveHours.isPending}
              resetting={resetToOrgDefault.isPending}
              lang={lang}
              onSave={handleSaveHours}
              onResetOrgDefault={handleReset}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> {lang === "fr" ? "Disponibilité et hors-heures" : "Availability & After-hours"}
          </CardTitle>
          {syncBadge()}
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <AfterHoursPanel
              initial={data?.call_handling ?? null}
              saving={saveHandling.isPending}
              lang={lang}
              onSave={handleSaveHandling}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
