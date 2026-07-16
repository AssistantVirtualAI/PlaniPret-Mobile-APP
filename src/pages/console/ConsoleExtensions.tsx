import { useState } from "react";
import { ConsolePageHeader } from "@/components/console/ConsolePageHeader";
import LemtelExtensions from "@/pages/lemtel/LemtelExtensions";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function ConsoleExtensions() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const sync = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("fusionpbx-proxy", { body: { action: "sync-extensions" } });
      if (error) throw error;
      toast({ title: "Extensions synced from PBX" });
      setTick(t => t + 1);
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <div>
      <ConsolePageHeader title="Extensions" sourceId="extensions" onSyncFromPbx={sync} onRefresh={() => setTick(t => t + 1)} busy={busy} hasData />
      <div key={tick}><LemtelExtensions /></div>
    </div>
  );
}
