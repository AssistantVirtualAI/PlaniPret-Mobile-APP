/**
 * Full-screen skeleton shown while a lazy-loaded mobile screen chunk
 * is fetched. Matches the dark Planiprêt mobile shell to avoid the
 * white/blank flash on slow networks.
 */
export default function MobileScreenSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 14px 24px" }}>
      <div
        style={{
          marginBottom: 14,
          padding: 16,
          borderRadius: 16,
          background: "var(--pp-bg-elevated, #0F1B30)",
          border: "1px solid var(--pp-bg-border-2, rgba(255,255,255,0.06))",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Shimmer w="40%" h={14} />
        <Shimmer w="70%" h={22} />
        <Shimmer w="100%" h={12} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            marginBottom: 10,
            padding: 14,
            borderRadius: 14,
            background: "var(--pp-bg-elevated, #0F1B30)",
            border: "1px solid var(--pp-bg-border-2, rgba(255,255,255,0.06))",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Shimmer w={36} h={36} r={18} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Shimmer w="55%" h={12} />
            <Shimmer w="35%" h={10} />
          </div>
          <Shimmer w={40} h={10} />
        </div>
      ))}
    </div>
  );
}

function Shimmer({ w, h, r = 4 }: { w: number | string; h: number; r?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)",
        backgroundSize: "200% 100%",
        animation: "pp-shimmer 1.2s ease-in-out infinite",
      }}
    />
  );
}
