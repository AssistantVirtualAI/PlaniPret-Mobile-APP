// Reusable shimmer skeletons for Planipret UI
import type { CSSProperties } from "react";

export function Shimmer({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div style={style} className={`pp-skeleton ${className}`} />;
}

export function CallRowSkeleton() {
  return (
    <li className="bg-white rounded-xl px-3 py-3 flex items-center gap-3 shadow-sm">
      <Shimmer className="w-12 h-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3 w-[70%]" />
        <Shimmer className="h-3 w-[40%]" />
      </div>
    </li>
  );
}

export function MessageRowSkeleton() {
  return (
    <div className="bg-white rounded-2xl px-3 py-3 flex items-center gap-3 shadow-sm">
      <Shimmer className="w-12 h-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3 w-[70%]" />
        <Shimmer className="h-3 w-[40%]" />
      </div>
      <Shimmer className="h-6 w-10 rounded-md" />
    </div>
  );
}

export function VoicemailRowSkeleton() {
  return (
    <div className="bg-white rounded-2xl px-3 py-3 flex items-center gap-3 shadow-sm">
      <Shimmer className="w-12 h-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3 w-[70%]" />
        <Shimmer className="h-3 w-[40%]" />
      </div>
      <Shimmer className="h-5 w-12 rounded-full" />
    </div>
  );
}

export function TableRowSkeleton({ cells = 6, withAvatar = false, withToggles = 0 }: { cells?: number; withAvatar?: boolean; withToggles?: number }) {
  return (
    <tr className="border-t border-slate-100">
      {withAvatar && (
        <td className="p-3"><Shimmer className="w-8 h-8 rounded-full" /></td>
      )}
      {Array.from({ length: cells }).map((_, i) => (
        <td key={i} className="p-3"><Shimmer className="h-3 w-3/4" /></td>
      ))}
      {Array.from({ length: withToggles }).map((_, i) => (
        <td key={`t${i}`} className="p-3"><Shimmer className="h-6 w-10 rounded-full" /></td>
      ))}
    </tr>
  );
}

export function BarChartSkeleton() {
  const heights = [60, 90, 45, 110, 70, 130, 80, 100];
  return (
    <div className="flex items-end gap-2 h-40 p-4">
      {heights.map((h, i) => (
        <Shimmer key={i} className="flex-1 rounded-t" style={{ height: `${h}px` }} />
      ))}
    </div>
  );
}

export function DonutSkeleton() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="relative w-32 h-32">
        <Shimmer className="absolute inset-0 rounded-full" />
        <div className="absolute inset-6 rounded-full" style={{ background: "var(--pp-bg-base, #060D1A)" }} />
      </div>
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="space-y-4 p-2">
      <Shimmer className="h-14 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm p-4">
        <table className="w-full">
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRowSkeleton key={i} cells={6} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
