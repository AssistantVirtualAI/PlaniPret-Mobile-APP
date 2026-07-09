import { useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMplanipretLang } from "@/hooks/useMplanipretLang";

export default function UniversalSearchBar() {
  const { t } = useMplanipretLang();
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const submit = () => {
    const v = q.trim();
    if (!v) return;
    const recent = JSON.parse(localStorage.getItem("pp_recent_searches") ?? "[]");
    const next = [v, ...recent.filter((r: string) => r !== v)].slice(0, 5);
    localStorage.setItem("pp_recent_searches", JSON.stringify(next));
    navigate(`/mplanipret/search?q=${encodeURIComponent(v)}`);
    setExpanded(false); setQ("");
  };

  return (
    <div className="px-3 py-2" style={{ background: "var(--pp-bg-base, transparent)" }}>
      {expanded ? (
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: "var(--pp-bg-elevated, #fff)", border: "1px solid var(--pp-bg-border-2, #E5E7EB)" }}>
          <Search className="w-4 h-4" style={{ color: "var(--pp-text-muted, #94a3b8)" }} />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={t("searchPage.searchEverywhere")}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--pp-text-primary, #1A1A2E)" }}
          />
          <button onClick={() => { setExpanded(false); setQ(""); }} className="text-xs text-slate-400">{t("common.cancel")}</button>
        </div>
      ) : (
        <button onClick={() => setExpanded(true)} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-full text-left text-sm"
          style={{ background: "var(--pp-bg-elevated, #f1f5f9)", color: "var(--pp-text-muted, #64748b)" }}>
          <Search className="w-4 h-4" /> {t("searchPage.searchEverywhere")}
        </button>
      )}
    </div>
  );
}
