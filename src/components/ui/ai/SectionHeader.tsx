import { LucideIcon } from "lucide-react";
import { AIBadge } from "./AIBadge";

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  showBadge?: boolean;
  action?: React.ReactNode;
}

export const SectionHeader = ({ icon: Icon, title, subtitle, showBadge, action }: Props) => (
  <div className="flex items-start justify-between gap-4 mb-4">
    <div className="flex items-start gap-3">
      <div className="rounded-xl p-2.5 ai-border">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          {showBadge && <AIBadge />}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);
