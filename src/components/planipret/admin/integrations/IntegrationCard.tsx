import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export type IntegrationStatus = "connected" | "pending" | "error" | "unconfigured";

const STATUS_STYLE: Record<IntegrationStatus, { label: string; bg: string; border: string; color: string; dot: string }> = {
  connected:    { label: "Connecté",       bg: "#0D3D2A", border: "#1A5A3F", color: "#00D4AA", dot: "#00D4AA" },
  pending:      { label: "En attente",     bg: "#2A1A00", border: "#4A3000", color: "#F5A623", dot: "#F5A623" },
  error:        { label: "Erreur",         bg: "#3D1010", border: "#5A1A1A", color: "#E84C4C", dot: "#E84C4C" },
  unconfigured: { label: "Non configuré",  bg: "#0D1F35", border: "#0E2A45", color: "#4A7FA5", dot: "#4A7FA5" },
};

export function StatusPill({ status }: { status: IntegrationStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
      style={{
        background: on ? "linear-gradient(90deg,#1A5A8A,#2E9BDC)" : "#1A2A3A",
        opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
        style={{ transform: on ? "translateX(22px)" : "translateX(2px)" }} />
    </button>
  );
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block mb-1.5" style={{ fontSize: 11, fontWeight: 600, color: "#8FA8C0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}{required && <span style={{ color: "#E84C4C", marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5" style={{ fontSize: 11, color: "#4A7FA5" }}>{hint}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#0D1F35", border: "1px solid #0E2A45", borderRadius: 10,
  padding: "10px 14px", color: "#E8EDF5", fontSize: 13, outline: "none", width: "100%",
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style ?? {}) }} />;
}

export function SecretInput({ value, onChange, placeholder, hasSavedValue, savedSource }: {
  value: string; onChange: (v: string) => void; placeholder?: string; hasSavedValue?: boolean;
  /** Where the saved value comes from — shown as a small badge. */
  savedSource?: "backend" | "db" | "both";
}) {
  const [show, setShow] = useState(false);
  const filled = hasSavedValue && !value;
  const badgeLabel =
    savedSource === "backend" ? "Backend" :
    savedSource === "both"    ? "Backend + BDD" :
    savedSource === "db"      ? "Sauvegardé" : "Sauvegardé";
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={filled ? "••••••••••••••••••••••••" : value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => { if (filled) e.target.select(); }}
        placeholder={placeholder ?? ""}
        style={{
          ...inputStyle,
          paddingRight: filled ? 130 : 38,
          background: filled ? "#0B1A2E" : "#0D1F35",
          borderColor: filled ? "#1A5A3F" : "#0E2A45",
          color: filled ? "#8FB8A8" : "#E8EDF5",
          fontFamily: filled ? "monospace" : undefined,
          letterSpacing: filled ? "0.05em" : undefined,
        }}
      />
      {filled && (
        <span
          className="absolute top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold pointer-events-none"
          style={{ right: 40, background: "rgba(0,212,170,0.1)", border: "1px solid #1A5A3F", color: "#00D4AA" }}
        >
          <CheckCircle2 className="w-2.5 h-2.5" /> {badgeLabel}
        </span>
      )}
      <button type="button" onClick={() => setShow((v) => !v)}
        title={filled ? "Valeur masquée — la clé réelle n'est jamais exposée dans le navigateur" : (show ? "Masquer" : "Afficher")}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/5"
        style={{ color: "#4A7FA5" }}>
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={async () => {
      await navigator.clipboard.writeText(value);
      setCopied(true); toast.success("Copié");
      setTimeout(() => setCopied(false), 1200);
    }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
      style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#8FA8C0" }}>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {label}
    </button>
  );
}

export function InfoBanner({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  const c = tone === "info"
    ? { bg: "rgba(46,155,220,0.08)", border: "#1A4A7A", color: "#2E9BDC" }
    : { bg: "rgba(245,166,35,0.08)", border: "#4A3000", color: "#F5A623" };
  return (
    <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: c.bg, border: `1px solid ${c.border}`, color: "#E8EDF5" }}>
      <div style={{ color: c.color, fontWeight: 600, marginBottom: 4 }}>ℹ️ Information</div>
      <div style={{ lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export interface IntegrationCardProps {
  integrationKey: string;
  name: string;
  description: string;
  emoji?: string;
  status: IntegrationStatus;
  enabled: boolean;
  lastTestedAt?: string | null;
  lastTestResult?: string | null;
  lastTestSuccess?: boolean | null;
  fullWidth?: boolean;
  defaultExpanded?: boolean;
  children: ReactNode;
  onToggleEnabled: (next: boolean) => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onTest: () => Promise<void> | void;
  saveDisabled?: boolean;
  testDisabled?: boolean;
  testDisabledReason?: string;
  /** Backend secrets detected for this integration (e.g. ["NS_API_KEY"]). */
  backendSecrets?: { present: string[]; missing: string[]; values?: Record<string, string> };
}

export function BackendSecretBadge({ present, missing }: { present: string[]; missing: string[] }) {
  if (!present.length && !missing.length) return null;
  const ok = present.length > 0;
  return (
    <span
      title={
        (ok ? `Backend: ${present.join(", ")}` : "") +
        (missing.length ? `${ok ? " · " : ""}Manquant: ${missing.join(", ")}` : "")
      }
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{
        background: ok ? "rgba(0,212,170,0.08)" : "rgba(245,166,35,0.08)",
        border: `1px solid ${ok ? "#1A5A3F" : "#4A3000"}`,
        color: ok ? "#00D4AA" : "#F5A623",
      }}
    >
      🔐 {ok ? `${present.length} clé${present.length > 1 ? "s" : ""} backend` : "Aucune clé backend"}
    </span>
  );
}

export function IntegrationCard(props: IntegrationCardProps) {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? props.status !== "connected");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  return (
    <div className={`pp-card ${props.fullWidth ? "col-span-1 md:col-span-2" : ""}`}
      style={{ background: "#0A1628", border: "1px solid #0E2A45", borderRadius: 16, padding: 0, overflow: "hidden" }}>
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02]">
        <div className="text-2xl flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: "#0D1F35", border: "1px solid #0E2A45" }}>{props.emoji ?? "🔌"}</div>
        <div className="flex-1 min-w-0">
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 15, color: "#E8EDF5" }}>{props.name}</div>
          <div style={{ fontSize: 12, color: "#4A7FA5", marginTop: 2 }}>{props.description}</div>
        </div>
        {props.backendSecrets && <BackendSecretBadge {...props.backendSecrets} />}
        <StatusPill status={props.status} />
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle on={props.enabled} onChange={(v) => props.onToggleEnabled(v)} />
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: "#4A7FA5" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "#4A7FA5" }} />}
      </button>


      {expanded && (
        <>
          <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "#0E2A45" }}>
            <div className="pt-4">{props.children}</div>
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3"
            style={{ background: "#040B16", borderTop: "1px solid #0E2A45" }}>
            <div className="text-xs" style={{ color: "#4A7FA5" }}>
              {props.lastTestedAt ? (
                <span className="inline-flex items-center gap-1.5">
                  {props.lastTestSuccess
                    ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#00D4AA" }} />
                    : <XCircle className="w-3.5 h-3.5" style={{ color: "#E84C4C" }} />}
                  Vérifié {new Date(props.lastTestedAt).toLocaleString("fr-CA")}
                  {props.lastTestResult && <span className="ml-1.5" style={{ color: props.lastTestSuccess ? "#00D4AA" : "#E84C4C" }}>· {props.lastTestResult}</span>}
                </span>
              ) : "Jamais testé"}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={testing || props.testDisabled}
                title={props.testDisabled ? (props.testDisabledReason ?? "Configuration incomplète") : undefined}
                onClick={async () => {
                  setTesting(true); try { await props.onTest(); } finally { setTesting(false); }
                }}
                className="px-3 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                style={{ background: "#0D1F35", border: "1px solid #0E2A45", color: "#E8EDF5", opacity: (testing || props.testDisabled) ? 0.5 : 1, cursor: props.testDisabled ? "not-allowed" : "pointer" }}>
                {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Tester la connexion
              </button>
              <button type="button" disabled={saving || props.saveDisabled} onClick={async () => {
                setSaving(true); try { await props.onSave(); } finally { setSaving(false); }
              }}
                className="px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                style={{ background: "linear-gradient(90deg,#1A4A8A,#2E9BDC)", color: "#fff", opacity: (saving || props.saveDisabled) ? 0.6 : 1 }}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Sauvegarder
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
