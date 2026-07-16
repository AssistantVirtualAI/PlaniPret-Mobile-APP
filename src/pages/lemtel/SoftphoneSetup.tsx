import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Copy, Eye, EyeOff, Check, Apple, Smartphone, Monitor, Loader2, AlertTriangle } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Credentials = {
  ok: boolean;
  display_name: string;
  extension: string;
  domain: string;
  wss_url: string;
  email: string;
  expires_at: string;
  masked_password: string;
  password?: string;
  qr_ava?: string;
  qr_sip?: string;
  error?: string;
};

async function fetchInvite(token: string, reveal = false): Promise<Credentials> {
  const url = `${SUPABASE_URL}/functions/v1/lemtel-invite-redeem?token=${encodeURIComponent(token)}&reveal=${reveal ? 1 : 0}`;
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  return res.json();
}

export default function SoftphoneSetup() {
  const { token = "" } = useParams();
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [qrMode, setQrMode] = useState<"ava" | "sip">("ava");
  const [qrImg, setQrImg] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    fetchInvite(token, false).then((data) => {
      if (data.error) setError(data.error);
      else setCreds(data);
    }).catch((e) => setError(e?.message || "Network error"))
      .finally(() => setLoading(false));
  }, [token]);

  const reveal = async () => {
    const data = await fetchInvite(token, true);
    if (data.password) { setCreds(data); setRevealed(true); }
  };

  useEffect(() => {
    if (!creds) return;
    const payload = qrMode === "ava" ? (creds.qr_ava || creds.qr_sip || `sip:${creds.extension}@${creds.domain}`)
                                     : (creds.qr_sip || `sip:${creds.extension}@${creds.domain}`);
    if (!payload) return;
    QRCode.toDataURL(payload, { width: 240, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrImg).catch(() => {});
  }, [creds, qrMode]);

  // Pre-load placeholder QR with masked info (no password) so the box never sits empty
  useEffect(() => {
    if (!creds || revealed) return;
    QRCode.toDataURL(`sip:${creds.extension}@${creds.domain}`, { width: 240, margin: 1, color: { dark: "#cbd5e1", light: "#ffffff" } })
      .then(setQrImg).catch(() => {});
  }, [creds, revealed]);

  const copy = async (val: string | undefined, label: string) => {
    if (!val) return;
    try { await navigator.clipboard.writeText(val); toast.success(`${label} copied`); } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !creds?.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invitation invalide</h1>
          <p className="text-slate-600 text-sm mb-6">
            {error === "EXPIRED" ? "Ce lien a expiré. Demandez une nouvelle invitation à votre administrateur."
              : error === "REVOKED" ? "Ce lien a été révoqué par un administrateur. Demandez-en un nouveau."
              : error === "NOT_FOUND" ? "Ce lien n'existe pas ou a été remplacé par un plus récent."
              : "Une erreur est survenue. Veuillez réessayer ou contacter votre administrateur."}
          </p>
          <a href="mailto:support@assistantvirtualai.com" className="inline-block bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">Contact support</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <img src="/lemtel-logo.png" alt="Lemtel" className="h-14 mx-auto mb-3" />
          <div className="text-[11px] tracking-[4px] font-semibold text-slate-500">UNIFIED COMMUNICATIONS</div>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 text-center mb-2 tracking-tight">Get your softphone login credentials</h1>
        <p className="text-center text-slate-600 mb-8 text-sm">Use the credentials below to access your softphone app.</p>

        {/* Credentials card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
          <div className="grid md:grid-cols-[1fr_auto] gap-0">
            <div className="p-6 space-y-5">
              <Field label="DOMAIN" value={creds.domain} onCopy={() => copy(creds.domain, "Domain")} />
              <Field label="USERNAME" value={creds.extension} onCopy={() => copy(creds.extension, "Username")} />
              <div>
                <div className="text-[11px] font-semibold text-slate-500 tracking-wider mb-1.5">PASSWORD</div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-900 text-lg flex-1">
                    {revealed ? creds.password : creds.masked_password}
                  </span>
                  <button onClick={revealed ? () => setRevealed(false) : reveal}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center gap-1">
                    {revealed ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
                  </button>
                  <button onClick={() => copy(creds.password, "Password")} disabled={!revealed}
                    className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30">
                    <Copy className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              </div>
            </div>

            {/* QR */}
            <div className="bg-slate-50/60 p-6 flex flex-col items-center justify-center border-l border-slate-100">
              <div className="bg-white p-3 rounded-xl shadow-sm">
                {qrImg ? <img src={qrImg} alt="Setup QR" className="w-40 h-40" /> : <div className="w-40 h-40 animate-pulse bg-slate-100 rounded" />}
              </div>
              <div className="mt-3 inline-flex bg-white rounded-full p-0.5 border border-slate-200 text-[11px]">
                <button onClick={() => setQrMode("ava")} className={`px-3 py-1 rounded-full font-semibold ${qrMode==="ava"?"bg-slate-900 text-white":"text-slate-600"}`}>AVA app</button>
                <button onClick={() => setQrMode("sip")} className={`px-3 py-1 rounded-full font-semibold ${qrMode==="sip"?"bg-slate-900 text-white":"text-slate-600"}`}>SIP</button>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">Scan to set up on mobile</p>
              {!revealed && <p className="text-[10px] text-amber-600 mt-1">Show password to activate QR</p>}
            </div>
          </div>
        </div>

        {/* Downloads */}
        <div className="mt-10">
          <h2 className="text-center text-lg font-semibold text-slate-900 mb-5">Download the softphone app</h2>
          <div className="flex justify-center">
            <a href="https://apps.apple.com/" target="_blank" rel="noreferrer"
              className="flex items-center gap-3 bg-white border-2 border-slate-200 rounded-xl px-6 py-3 hover:border-slate-400 transition">
              <Apple className="w-7 h-7 text-slate-900" />
              <div className="text-left">
                <div className="text-[10px] text-slate-500">Download app for</div>
                <div className="font-semibold text-slate-900">Mac OS</div>
              </div>
            </a>
          </div>

          <p className="text-center text-xs text-slate-500 mt-6 mb-3">Also available on:</p>
          <div className="flex flex-wrap justify-center gap-3">
            <DownloadBadge href="https://apps.apple.com/" icon={<Apple className="w-5 h-5" />} top="Download on the" bottom="App Store" dark />
            <DownloadBadge href="/download" icon={<Apple className="w-5 h-5" />} top="Download app for" bottom="Mac OS" />
            <DownloadBadge href="https://play.google.com/" icon={<Smartphone className="w-5 h-5" />} top="GET IT ON" bottom="Google Play" dark />
            <DownloadBadge href="/download" icon={<Monitor className="w-5 h-5" />} top="Download for" bottom="Windows" />
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-10">
          Lien sécurisé · expire le {new Date(creds.expires_at).toLocaleDateString()} · Besoin d'aide ? <a className="underline" href="mailto:support@assistantvirtualai.com">support@assistantvirtualai.com</a>
        </p>
      </motion.div>
    </div>
  );
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const handle = () => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-500 tracking-wider mb-1.5">{label}</div>
      <div className="flex items-center gap-3">
        <span className="font-bold text-slate-900 text-lg flex-1 break-all">{value}</span>
        <button onClick={handle} className="p-1.5 rounded-md hover:bg-slate-100">
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
        </button>
      </div>
    </div>
  );
}

function DownloadBadge({ href, icon, top, bottom, dark }: { href: string; icon: React.ReactNode; top: string; bottom: string; dark?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className={`flex items-center gap-2 rounded-lg px-4 py-2 border-2 transition ${
        dark ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800" : "bg-white text-slate-900 border-slate-200 hover:border-slate-400"
      }`}>
      {icon}
      <div className="text-left leading-tight">
        <div className="text-[9px] opacity-80">{top}</div>
        <div className="text-sm font-bold">{bottom}</div>
      </div>
    </a>
  );
}
