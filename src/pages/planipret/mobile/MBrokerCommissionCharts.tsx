// The detailed mobile charts share the same approved commission report as the portal.
// Administrators keep the cabinet-wide view; brokers are explicitly restricted to self.
import { useOutletContext } from "react-router-dom";
import PABrokerCommissions from "@/pages/planipret/admin/PABrokerCommissions";
import type { PlanipretMobileContext } from "../PlanipretMobile";

export default function MBrokerCommissionCharts() {
  const { profile } = useOutletContext<PlanipretMobileContext>();
  const isAdmin = profile?.role === "admin";
  return (
    <div className="px-3 pb-24 pt-3 [&_table]:text-xs [&_select]:max-w-full">
      <PABrokerCommissions selfOnly={!isAdmin} />
    </div>
  );
}
