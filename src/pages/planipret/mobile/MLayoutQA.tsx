import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X } from "lucide-react";
import { useSafeAreaInsets } from "@/hooks/useSafeAreaInsets";
import MobileScreen from "@/components/planipret/mobile/MobileScreen";

const PAGES: { path: string; label: string }[] = [
  { path: "/mplanipret", label: "Home" },
  { path: "/mplanipret/calls", label: "Calls" },
  { path: "/mplanipret/messages", label: "Messages" },
  { path: "/mplanipret/voicemail", label: "Voicemail" },
  { path: "/mplanipret/contacts", label: "Contacts" },
  { path: "/mplanipret/pipeline", label: "Pipeline" },
  { path: "/mplanipret/search", label: "Search" },
  { path: "/mplanipret/stats", label: "Stats" },
  { path: "/mplanipret/more", label: "More" },
  { path: "/mplanipret/ava-chat", label: "AVA Chat" },
  { path: "/mplanipret/notifications", label: "Notifications" },
  { path: "/mplanipret/kpi-audit", label: "KPI Audit" },
  { path: "/mplanipret/sip-debug", label: "SIP Debug" },
  { path: "/mplanipret/ms365-diagnostics", label: "MS365 Diag" },
  { path: "/mplanipret/diagnostics", label: "Diagnostics" },
];

const TESTS = [
  { id: "t1", label: "iOS notch: header visible" },
  { id: "t2", label: "Android status bar: pas de recouvrement" },
  { id: "t3", label: "Double-tap: aucun zoom" },
  { id: "t4", label: "Pinch: aucun zoom" },
  { id: "t5", label: "Focus input: pas de zoom (≥16px)" },
  { id: "t6", label: "Rotation: safe-areas OK" },
];

const STORAGE_KEY = "mplanipret_layout_qa_v1";

export default function MLayoutQA() {
  const nav = useNavigate();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    try { setState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")); } catch {}
  }, []);

  const toggle = (page: string, test: string) => {
    setState((prev) => {
      const next = { ...prev, [page]: { ...(prev[page] || {}), [test]: !prev[page]?.[test] } };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState({});
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#0A1425", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <button onClick={() => nav(-1)} style={{ background: "transparent", border: 0, color: "#fff" }}>
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Layout QA</div>
      <div style={{ marginLeft: "auto", fontSize: 11, color: "#94A3B8", fontFamily: "monospace" }}>
        T:{insets.top} B:{insets.bottom} L:{insets.left} R:{insets.right}
      </div>
    </div>
  );

  return (
    <MobileScreen header={header}>
      <div style={{ padding: 16, color: "#E2E8F0" }}>
        <div style={{ marginBottom: 16, padding: 12, background: "rgba(46,155,220,0.1)", border: "1px solid rgba(46,155,220,0.3)", borderRadius: 8, fontSize: 12 }}>
          Testez chaque page (T1–T6). L'overlay des safe-areas est affiché en haut à droite. Progression sauvegardée localement.
        </div>
        <button onClick={reset} style={{ marginBottom: 16, padding: "6px 12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#F87171", borderRadius: 6, fontSize: 12 }}>
          Reset checklist
        </button>
        {PAGES.map((p) => {
          const done = Object.values(state[p.path] || {}).filter(Boolean).length;
          return (
            <div key={p.path} style={{ marginBottom: 16, padding: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: "#64748B", fontFamily: "monospace" }}>{p.path}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: done === TESTS.length ? "#10B981" : "#94A3B8" }}>{done}/{TESTS.length}</span>
                  <button onClick={() => nav(p.path)} style={{ padding: "6px 12px", background: "#2E9BDC", color: "#fff", border: 0, borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                    Ouvrir
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {TESTS.map((t) => {
                  const ok = !!state[p.path]?.[t.id];
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(p.path, t.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                        background: ok ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${ok ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 6, color: "#E2E8F0", fontSize: 12, textAlign: "left", cursor: "pointer",
                      }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", background: ok ? "#10B981" : "rgba(255,255,255,0.08)" }}>
                        {ok ? <Check className="w-3 h-3" style={{ color: "#fff" }} /> : <X className="w-3 h-3" style={{ color: "#64748B" }} />}
                      </span>
                      <span style={{ fontFamily: "monospace", color: "#94A3B8", fontSize: 10 }}>{t.id.toUpperCase()}</span>
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </MobileScreen>
  );
}
