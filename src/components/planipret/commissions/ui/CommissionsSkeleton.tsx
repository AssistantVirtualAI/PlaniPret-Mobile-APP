/** Chart-shaped loading skeletons, so the page keeps its layout while data loads. */
export default function CommissionsSkeleton() {
  const Card = ({ h }: { h: number }) => (
    <div
      className="ov3d-card"
      style={{
        padding: 14, borderRadius: 16, border: "1px solid var(--pp-bg-border)",
        background: "linear-gradient(160deg, var(--pp-bg-elevated) 0%, var(--pp-bg-card) 100%)",
      }}
    >
      <div className="pp-skel" style={{ width: 160, height: 12, borderRadius: 6, marginBottom: 12 }} />
      <div className="pp-skel" style={{ height: h, borderRadius: 12 }} />
    </div>
  );
  return (
    <div className="grid gap-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ov3d-card" style={{ padding: 14, borderRadius: 14, border: "1px solid var(--pp-bg-border)", background: "var(--pp-bg-elevated)" }}>
            <div className="pp-skel" style={{ width: 70, height: 9, borderRadius: 5 }} />
            <div className="pp-skel" style={{ width: 120, height: 20, borderRadius: 6, marginTop: 10 }} />
          </div>
        ))}
      </div>
      <Card h={260} />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <Card h={200} />
        <Card h={200} />
      </div>
    </div>
  );
}
