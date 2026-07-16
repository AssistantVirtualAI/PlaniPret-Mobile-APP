import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, Phone, CreditCard, Activity, FileText, Server, ArrowRight } from "lucide-react";
import { PortalRoleBadge } from "@/components/portals/PortalShells";

const quick = [
  { title: "Organizations", desc: "Manage all customer & reseller orgs", to: "/platform/organizations", icon: Building2 },
  { title: "All Users", desc: "Global users across every workspace", to: "/platform/users", icon: Users },
  { title: "All Calls", desc: "Platform-wide call records & CDR search", to: "/platform/calls", icon: Phone },
  { title: "Telephony Core", desc: "FusionPBX sync, domains, SIP trunks", to: "/platform/telephony", icon: Server },
  { title: "Billing", desc: "Stripe subscriptions, invoicing, MRR", to: "/platform/billing", icon: CreditCard },
  { title: "System Health", desc: "Edge functions, webhooks, sync jobs", to: "/platform/system", icon: Activity },
  { title: "Audit Logs", desc: "Security events and impersonation trail", to: "/platform/audit", icon: FileText },
];

export default function PlatformDashboard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <PortalRoleBadge role="platform" />
          <h1 className="text-3xl font-bold mt-1">Platform Overview</h1>
          <p className="text-muted-foreground text-sm">AVA / Lemtel internal control plane</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quick.map((q) => (
          <Card key={q.to} className="hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <q.icon className="h-4 w-4 text-primary" /> {q.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{q.desc}</p>
              <Button asChild size="sm" variant="outline">
                <Link to={q.to}>Open <ArrowRight className="ml-1 h-3 w-3" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
