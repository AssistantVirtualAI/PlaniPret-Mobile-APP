import { useState } from "react";
import { Hourglass, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import PendingCommissionsCard from "./PendingCommissionsCard";
import RegisterCommissions from "./RegisterCommissions";

export default function CommissionSections({
  lang,
  scope,
  presentation = "portal",
  personalUsersId,
  cacheScope,
  defaultSection = "pending",
}: {
  lang: "fr" | "en";
  scope: "admin" | "broker";
  /** Mobile shares the portal reports but removes desktop-only diagnostic detail. */
  presentation?: "portal" | "mobile";
  /** Explicit own Maestro id for an administrator's personal view only. */
  personalUsersId?: string;
  /** Cache partition; mobile caches never cross a signed-in account or view. */
  cacheScope?: string;
  defaultSection?: "pending" | "paid";
}) {
  const [section, setSection] = useState<"pending" | "paid">(defaultSection);
  const fr = lang === "fr";
  return (
    <div className="mt-5">
      <div role="tablist" aria-label={fr ? "Statut des commissions" : "Commission status"} className="flex flex-wrap justify-start gap-2 border-b pb-3 mb-4">
        <Button role="tab" variant={section === "pending" ? "default" : "outline"} onClick={() => setSection("pending")} aria-selected={section === "pending"} id="commission-pending-tab" aria-controls="commission-pending-panel" className="gap-2 px-5"><Hourglass className="h-4 w-4" />{fr ? "En attente" : "Pending"}</Button>
        <Button role="tab" variant={section === "paid" ? "default" : "outline"} onClick={() => setSection("paid")} aria-selected={section === "paid"} id="commission-paid-tab" aria-controls="commission-paid-panel" className="gap-2 px-5"><WalletCards className="h-4 w-4" />{fr ? "Déboursées" : "Paid"}</Button>
      </div>
      <div role="tabpanel" id="commission-pending-panel" aria-labelledby="commission-pending-tab" hidden={section !== "pending"}>
        {section === "pending" && (
          <PendingCommissionsCard lang={lang} filters={personalUsersId ? { users_id: personalUsersId } : undefined} cacheScope={cacheScope ?? scope} presentation={presentation} />
        )}
      </div>
      <div role="tabpanel" id="commission-paid-panel" aria-labelledby="commission-paid-tab" hidden={section !== "paid"}>
        {section === "paid" && <>
          {/* One canonical paid-commission source for portal and mobile: the
              verified register. The historical paid summary used a different
              aggregation and is deliberately not rendered. */}
          <RegisterCommissions lang={lang} scope={scope} presentation={presentation} cacheScope={cacheScope} />
        </>}
      </div>
    </div>
  );
}
