import { useState, ComponentType } from "react";
import { ConsolePageHeader } from "@/components/console/ConsolePageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { PbxSourceId } from "@/lib/pbx/sources";

import LemtelDevices from "@/pages/lemtel/LemtelDevices";
import LemtelIVR from "@/pages/lemtel/LemtelIVR";
import LemtelQueues from "@/pages/lemtel/LemtelQueues";
import LemtelDIDs from "@/pages/lemtel/LemtelDIDs";
import AdminDestinations from "@/pages/lemtel/admin/AdminDestinations";
import AdminVoicemail from "@/pages/lemtel/admin/AdminVoicemail";
import AdminRegistrations from "@/pages/lemtel/admin/AdminRegistrations";
import AdminActiveCalls from "@/pages/lemtel/admin/AdminActiveCalls";
import AdminRecordings from "@/pages/lemtel/admin/AdminRecordings";

function makeWrapper(
  title: string, sourceId: PbxSourceId, Component: ComponentType<any>, syncAction?: string,
) {
  return function Wrapped() {
    const { toast } = useToast();
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0);
    const sync = syncAction
      ? async () => {
          setBusy(true);
          try {
            const { error } = await supabase.functions.invoke("fusionpbx-proxy", { body: { action: syncAction } });
            if (error) throw error;
            toast({ title: `${title} synced from PBX` });
            setTick(t => t + 1);
          } catch (e: any) {
            toast({ title: "Sync failed", description: e.message, variant: "destructive" });
          } finally { setBusy(false); }
        }
      : undefined;
    return (
      <div>
        <ConsolePageHeader title={title} sourceId={sourceId} onSyncFromPbx={sync} onRefresh={() => setTick(t => t + 1)} busy={busy} hasData />
        <div key={tick}><Component /></div>
      </div>
    );
  };
}

export const ConsoleDevices       = makeWrapper("Devices",         "devices",        LemtelDevices,       "sync-devices");
export const ConsoleIVRs          = makeWrapper("IVRs",             "ivrs",           LemtelIVR,           "sync-ivrs");
export const ConsoleQueues        = makeWrapper("Call Queues",      "queues",         LemtelQueues,        "sync-queues");
export const ConsoleRingGroups    = makeWrapper("Ring Groups",      "ivrs",           LemtelIVR,           "sync-ring-groups");
export const ConsoleDIDs          = makeWrapper("Phone Numbers (DIDs)", "dids",       LemtelDIDs);
export const ConsoleInboundRoutes = makeWrapper("Inbound Routes",   "inboundRoutes",  AdminDestinations,   "sync-destinations");
export const ConsoleVoicemail     = makeWrapper("Voicemail",        "voicemail",      AdminVoicemail,      "sync-voicemail-messages");
export const ConsoleRegistrations = makeWrapper("Live Registrations","liveRegistrations", AdminRegistrations);
export const ConsoleActiveCalls   = makeWrapper("Active Calls",     "activeCalls",    AdminActiveCalls);
export const ConsoleCdr           = makeWrapper("CDR & Recordings", "cdr",            AdminRecordings,     "sync-cdrs");
