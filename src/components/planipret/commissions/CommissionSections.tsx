import { useState } from "react";
import { Hourglass, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import PendingCommissionsCard from "./PendingCommissionsCard";
import RegisterCommissions from "./RegisterCommissions";
import PaidDepositsCard from "./PaidDepositsCard";

export default function CommissionSections({ lang, scope }: { lang: "fr" | "en"; scope: "admin" | "broker" }) {
  const [section, setSection] = useState("pending");
  const fr = lang === "fr";
  return (
    <div className="mt-5">
      <div role="tablist" aria-label={fr ? "Statut des commissions" : "Commission status"} className="flex flex-wrap justify-start gap-2 border-b pb-3 mb-4">
        <Button role="tab" variant={section === "pending" ? "default" : "outline"} onClick={() => setSection("pending")} aria-selected={section === "pending"} id="commission-pending-tab" aria-controls="commission-pending-panel" className="gap-2 px-5"><Hourglass className="h-4 w-4" />{fr ? "En attente" : "Pending"}</Button>
        <Button role="tab" variant={section === "paid" ? "default" : "outline"} onClick={() => setSection("paid")} aria-selected={section === "paid"} id="commission-paid-tab" aria-controls="commission-paid-panel" className="gap-2 px-5"><WalletCards className="h-4 w-4" />{fr ? "Déboursées" : "Paid"}</Button>
      </div>
      <div role="tabpanel" id="commission-pending-panel" aria-labelledby="commission-pending-tab" hidden={section !== "pending"}>
        <PendingCommissionsCard lang={lang} cacheScope={scope} />
      </div>
      <div role="tabpanel" id="commission-paid-panel" aria-labelledby="commission-paid-tab" hidden={section !== "paid"}>
        {section === "paid" && <PaidDepositsCard lang={lang} scope={scope} />}
        <h2 className="flex items-center gap-2 text-xl font-bold mt-6 mb-4"><WalletCards className="h-5 w-5 text-primary" />{fr ? "Analyse détaillée" : "Detailed analysis"}</h2>
        <RegisterCommissions lang={lang} scope={scope} />
      </div>
    </div>
  );
}