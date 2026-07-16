import { ReactNode } from "react";
import { AppLayout } from "./AppLayout";

interface CockpitLayoutProps {
  children: ReactNode;
  /** Optional page header rendered above the content with an ambient cockpit glow. */
  header?: ReactNode;
}

/**
 * Phase 3 opt-in layout for dashboards.
 *
 * Wraps the existing `AppLayout` (preserving org switcher, drag-drop nav,
 * scope filters, softphone widget) and adds a subtle ambient cockpit
 * backdrop + optional glass header slot. Pages migrate by swapping
 * `<AppLayout>` for `<CockpitLayout>` — no behavior change.
 */
export function CockpitLayout({ children, header }: CockpitLayoutProps) {
  return (
    <AppLayout>
      <div className="relative">
        {/* Ambient cockpit glow accents */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-cockpit-cyan/[0.07] blur-[120px]" />
          <div className="absolute -top-20 right-0 h-[22rem] w-[22rem] rounded-full bg-cockpit-violet/[0.06] blur-[120px]" />
        </div>
        {header ? <div className="mb-4">{header}</div> : null}
        {children}
      </div>
    </AppLayout>
  );
}

export default CockpitLayout;
