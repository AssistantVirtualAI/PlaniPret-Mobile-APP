import { ReactNode } from "react";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";

/**
 * MobileScreen — wrapper standard pour toute page mobile Planiprêt.
 * Applique automatiquement les safe-area insets (notch iOS, status bar Android)
 * au header et à la bottom-nav, et empêche tout débordement horizontal.
 */
export default function MobileScreen({
  header,
  children,
  bottomNav,
  background = "var(--pp-bg-base, #0A1425)",
}: {
  header?: ReactNode;
  children: ReactNode;
  bottomNav?: ReactNode;
  background?: string;
}) {
  const s = useSafeAreaInsets();
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background,
        overflow: "hidden",
      }}
    >
      {header && (
        <div
          style={{
            paddingTop: Math.max(s.top, 12),
            paddingLeft: s.left,
            paddingRight: s.right,
            flexShrink: 0,
          }}
        >
          {header}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          paddingLeft: s.left,
          paddingRight: s.right,
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {children}
      </div>
      {bottomNav && (
        <div
          style={{
            paddingBottom: s.bottom,
            paddingLeft: s.left,
            paddingRight: s.right,
            flexShrink: 0,
          }}
        >
          {bottomNav}
        </div>
      )}
    </div>
  );
}
