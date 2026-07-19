/**
 * MobilePageSkeleton — Lightweight skeleton screens for each mobile page.
 *
 * Used as Suspense fallback and while background data is loading.
 * Each variant matches the rough layout of its target page so the
 * transition from skeleton → real content is visually seamless.
 */

type SkeletonVariant =
  | "home"
  | "calls"
  | "messages"
  | "voicemail"
  | "contacts"
  | "more"
  | "pipeline"
  | "stats"
  | "ava"
  | "notifications"
  | "generic";

function Shimmer({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background: "linear-gradient(90deg, var(--pp-bg-elevated, #1A2540) 25%, var(--pp-bg-border-2, #243050) 50%, var(--pp-bg-elevated, #1A2540) 75%)",
        backgroundSize: "200% 100%",
        animation: "pp-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function Row({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Shimmer style={{ width: 40, height: 40, borderRadius: 20, flexShrink: 0 }} />
      <div className="flex-1 flex flex-col gap-1.5">
        <Shimmer style={{ height: 13, width: wide ? "70%" : "50%" }} />
        <Shimmer style={{ height: 11, width: wide ? "90%" : "65%" }} />
      </div>
      <Shimmer style={{ width: 36, height: 11, borderRadius: 6 }} />
    </div>
  );
}

function KpiCard() {
  return (
    <Shimmer style={{ height: 80, borderRadius: 14, flex: 1 }} />
  );
}

export default function MobilePageSkeleton({ variant = "generic" }: { variant?: SkeletonVariant }) {
  return (
    <div className="h-full w-full overflow-hidden" style={{ background: "var(--pp-bg-base)" }}>
      <style>{`
        @keyframes pp-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {variant === "home" && (
        <div className="flex flex-col gap-4 p-4">
          {/* Period selector */}
          <div className="flex gap-2">
            {[80, 70, 65, 55].map((w, i) => (
              <Shimmer key={i} style={{ height: 30, width: w, borderRadius: 20 }} />
            ))}
          </div>
          {/* KPI row */}
          <div className="flex gap-3">
            <KpiCard /><KpiCard /><KpiCard />
          </div>
          {/* Calendar header */}
          <Shimmer style={{ height: 20, width: "40%" }} />
          {/* Calendar events */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 items-start">
              <Shimmer style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
              <div className="flex-1 flex flex-col gap-1.5">
                <Shimmer style={{ height: 13, width: "60%" }} />
                <Shimmer style={{ height: 11, width: "40%" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {(variant === "calls" || variant === "messages" || variant === "voicemail") && (
        <div className="flex flex-col">
          {/* Tab bar */}
          <div className="flex gap-2 px-4 pt-3 pb-2">
            {[90, 80, 70].map((w, i) => (
              <Shimmer key={i} style={{ height: 32, width: w, borderRadius: 20 }} />
            ))}
          </div>
          {/* Search bar */}
          <Shimmer className="mx-4 mb-3" style={{ height: 36, borderRadius: 10 }} />
          {/* Rows */}
          {Array.from({ length: 8 }).map((_, i) => <Row key={i} wide />)}
        </div>
      )}

      {variant === "contacts" && (
        <div className="flex flex-col">
          <Shimmer className="mx-4 mt-3 mb-3" style={{ height: 36, borderRadius: 10 }} />
          {Array.from({ length: 10 }).map((_, i) => <Row key={i} />)}
        </div>
      )}

      {variant === "pipeline" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex gap-2 overflow-hidden">
            {[100, 90, 80].map((w, i) => (
              <Shimmer key={i} style={{ height: 32, width: w, borderRadius: 20, flexShrink: 0 }} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} style={{ height: 72, borderRadius: 14 }} />
          ))}
        </div>
      )}

      {variant === "stats" && (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex gap-3">
            <KpiCard /><KpiCard />
          </div>
          <Shimmer style={{ height: 160, borderRadius: 14 }} />
          <Shimmer style={{ height: 120, borderRadius: 14 }} />
        </div>
      )}

      {variant === "notifications" && (
        <div className="flex flex-col">
          {Array.from({ length: 7 }).map((_, i) => <Row key={i} wide />)}
        </div>
      )}

      {variant === "more" && (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Shimmer key={i} style={{ height: 52, borderRadius: 12 }} />
          ))}
        </div>
      )}

      {variant === "ava" && (
        <div className="flex flex-col gap-3 p-4 items-center">
          <Shimmer style={{ width: 80, height: 80, borderRadius: 40 }} />
          <Shimmer style={{ height: 14, width: "50%" }} />
          <Shimmer style={{ height: 11, width: "70%" }} />
          <div className="w-full mt-4 flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <Shimmer key={i} style={{ height: 44, borderRadius: 12 }} />
            ))}
          </div>
        </div>
      )}

      {variant === "generic" && (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => <Row key={i} wide />)}
        </div>
      )}
    </div>
  );
}
