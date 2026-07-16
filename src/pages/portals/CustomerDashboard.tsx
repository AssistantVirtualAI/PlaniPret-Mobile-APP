import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Phone, Headphones, BarChart3, CreditCard, Database, ArrowRight, Settings, Server } from "lucide-react";
import { PortalRoleBadge } from "@/components/portals/PortalShells";

const quick = [
  { title: "Team", desc: "Invite users, assign roles", to: "/customer/team", icon: Users },
  { title: "Extensions", desc: "SIP extensions for your team", to: "/customer/extensions", icon: Phone },
  { title: "Call Queues", desc: "Queues, supervisors, wallboard", to: "/customer/queues", icon: Headphones },
  { title: "IVR", desc: "Inbound menus & call routing", to: "/customer/ivr", icon: Server },
  { title: "Analytics", desc: "Call volume, agent KPIs", to: "/customer/analytics", icon: BarChart3 },
  { title: "Knowledge Base", desc: "Docs your AI agents use", to: "/customer/knowledge", icon: Database },
  { title: "Billing", desc: "Plan, usage, invoices", to: "/customer/billing", icon: CreditCard },
  { title: "Settings", desc: "Workspace branding, security", to: "/customer/settings", icon: Settings },
];

export default function CustomerDashboard() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <PortalRoleBadge role="customer" />
        <h1 className="text-3xl font-bold mt-1">Workspace Dashboard</h1>
        <p className="text-muted-foreground text-sm">Manage your team, telephony and AI agents</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quick.map((q) => (
          <Card key={q.to} className="hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
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
