// Version mobile de la page commissions du portail, limitée au courtier connecté.
import PABrokerCommissions from "@/pages/planipret/admin/PABrokerCommissions";

export default function MBrokerCommissionCharts() {
  return (
    <div className="px-3 pb-24 pt-3 [&_table]:text-xs [&_select]:max-w-full">
      <PABrokerCommissions selfOnly />
    </div>
  );
}
