import { ReactNode } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { useWhitelabel } from "@/contexts/WhitelabelContext";
import { ImpersonationBanner } from "@/components/portal/ImpersonationBanner";
import { OrgSwitcher } from "@/components/portal/OrgSwitcher";
import { Building2 } from "lucide-react";

interface ShellProps {
  title: string;
  sections: { label: string; to: string; icon?: ReactNode }[];
  children?: ReactNode;
}

export function MasterShell({ children }: { children?: ReactNode }) {
  const { config } = useWhitelabel();
  const { slug = "lemtel" } = useParams();
  const loc = useLocation();
  const links = [
    { label: "Overview", to: `/org/${slug}/master/dashboard` },
    { label: "Organizations", to: `/org/${slug}/master/organizations` },
    { label: "All users", to: `/org/${slug}/master/users` },
    { label: "All calls", to: `/org/${slug}/master/calls` },
    { label: "Billing", to: `/org/${slug}/master/billing` },
    { label: "System", to: `/org/${slug}/master/system` },
    { label: "Audit logs", to: `/org/${slug}/master/audit` },
  ];
  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <header className="border-b sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="px-6 py-3 flex items-center gap-4">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt={config.appName} className="h-8" />
          ) : (
            <Building2 className="h-7 w-7 text-primary" />
          )}
          <div className="font-bold text-lg">{config.appName} • Master</div>
          <div className="ml-auto"><OrgSwitcher /></div>
        </div>
        <nav className="px-6 flex gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-2 text-sm border-b-2 whitespace-nowrap ${
                loc.pathname.startsWith(l.to)
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children ?? <Outlet />}</main>
    </div>
  );
}

export function ResellerShell({ children }: { children?: ReactNode }) {
  const { config } = useWhitelabel();
  const { slug } = useParams();
  const loc = useLocation();
  const links = [
    { label: "Dashboard", to: `/org/${slug}/reseller/dashboard` },
    { label: "My customers", to: `/org/${slug}/reseller/customers` },
    { label: "Users", to: `/org/${slug}/reseller/users` },
    { label: "Settings", to: `/org/${slug}/reseller/settings` },
    { label: "Billing", to: `/org/${slug}/reseller/billing` },
  ];
  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <header className="border-b sticky top-0 z-40 bg-background/95 backdrop-blur">
        <div className="px-6 py-3 flex items-center gap-4">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt={config.appName} className="h-8" />
          ) : (
            <Building2 className="h-7 w-7" style={{ color: config.primaryColor }} />
          )}
          <div className="font-bold text-lg">{config.appName}</div>
          <div className="ml-auto"><OrgSwitcher /></div>
        </div>
        <nav className="px-6 flex gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-2 text-sm border-b-2 whitespace-nowrap ${
                loc.pathname.startsWith(l.to)
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children ?? <Outlet />}</main>
    </div>
  );
}
