import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  PhoneCall,
  Smartphone,
  Apple,
  Play,
  Monitor,
  Zap,
  CheckCircle2,
  Copy,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import pbxShowcase from "@/assets/fashionpbx-showcase.jpg";
import mobileShowcase from "@/assets/mobile-app-showcase.jpg";

const LEMTEL_LOGO = "/lemtel-logo.png";
const DESKTOP_ICON = "/desktop-app-icon.png";

// Build a lemtel:// URL (matches Chrome extension + desktop protocol handler)
const buildLemtelUrl = (number: string) => {
  const cleaned = number.replace(/[^\d+]/g, "");
  return `lemtel://call/${encodeURIComponent(cleaned)}`;
};

const triggerLemtelProtocol = (number: string) => {
  const url = buildLemtelUrl(number);
  // Hidden iframe trick = avoids "leaving page" prompt and works across browsers
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 1500);
  // Fallback: also try window.location for browsers that prefer it
  try {
    window.location.href = url;
  } catch {
    /* no-op */
  }
};

const sampleNumbers = [
  { label: "Sales", number: "+1 514 555 0142" },
  { label: "Support", number: "+1 438 555 0177" },
  { label: "Demo Line", number: "+1 800 555 0199" },
];

export const LemtelInteractiveDemo = () => {
  const { toast } = useToast();
  const [number, setNumber] = useState("+1 514 555 0142");
  const [dialing, setDialing] = useState(false);
  const [lastDialed, setLastDialed] = useState<string | null>(null);

  const handleDial = (target?: string) => {
    const n = target ?? number;
    if (!n.trim()) {
      toast({ title: "Enter a number first", variant: "destructive" });
      return;
    }
    setDialing(true);
    setLastDialed(n);
    triggerLemtelProtocol(n);
    toast({
      title: "📞 Calling via Lemtel Desktop",
      description: `Opening lemtel://call/${n.replace(/[^\d+]/g, "")}`,
    });
    setTimeout(() => setDialing(false), 2200);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(buildLemtelUrl(number));
    toast({ title: "Copied lemtel:// URL" });
  };

  return (
    <section
      id="lemtel-demo"
      className="relative py-24 px-4 overflow-hidden bg-gradient-to-b from-background via-card/30 to-background"
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14 max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-4 uppercase tracking-wider">
            <img
              src={LEMTEL_LOGO}
              alt="Lemtel logo"
              width={20}
              height={20}
              className="w-5 h-5 object-contain"
            />
            Lemtel FashionPBX · Live Demo
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-transparent">
            Click-to-dial, en direct depuis ton navigateur
          </h2>
          <p className="text-lg text-muted-foreground">
            Tape un numéro, clique <span className="text-primary font-semibold">Appeler</span> — l'app
            desktop Lemtel s'ouvre via le protocole{" "}
            <code className="px-1.5 py-0.5 rounded bg-muted text-primary text-xs">lemtel://</code>{" "}
            et compose automatiquement.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* LEFT — Interactive dialer */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="relative rounded-3xl border border-primary/30 bg-card/60 backdrop-blur-xl p-6 md:p-8 shadow-[0_0_60px_-15px_hsl(var(--primary)/0.35)]"
          >
            <div className="flex items-center gap-3 mb-6">
              <img
                src={DESKTOP_ICON}
                alt="Lemtel Desktop App icon"
                width={48}
                height={48}
                className="w-12 h-12 object-contain rounded-xl border border-border/60 bg-background/60 p-1.5"
              />
              <div>
                <h3 className="font-bold text-lg leading-tight">Lemtel Desktop Dialer</h3>
                <p className="text-xs text-muted-foreground">
                  Protocole <code className="text-primary">lemtel://call/&lt;number&gt;</code>
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto bg-primary/15 text-primary border-primary/30">
                Live
              </Badge>
            </div>

            {/* Dial pad */}
            <div className="space-y-4">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="+1 514 555 0123"
                  className="pl-9 h-14 text-lg font-mono tracking-wide bg-background/60"
                  inputMode="tel"
                  aria-label="Phone number to dial"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {sampleNumbers.map((s) => (
                  <button
                    key={s.number}
                    onClick={() => {
                      setNumber(s.number);
                      handleDial(s.number);
                    }}
                    className="px-3 py-2.5 rounded-lg border border-border/60 bg-background/40 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground group-hover:text-primary">
                      {s.label}
                    </div>
                    <div className="text-xs font-mono truncate">{s.number}</div>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleDial()}
                  disabled={dialing}
                  className="flex-1 h-12 bg-primary hover:bg-primary/90 text-base font-semibold"
                >
                  <PhoneCall className={`w-5 h-5 mr-2 ${dialing ? "animate-pulse" : ""}`} />
                  {dialing ? "Opening Lemtel..." : "Appeler via lemtel://"}
                </Button>
                <Button
                  onClick={handleCopyUrl}
                  variant="outline"
                  className="h-12 border-primary/30 hover:bg-primary/10"
                  aria-label="Copy lemtel:// URL"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>

              {/* Status feedback */}
              <AnimatePresence>
                {lastDialed && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5 text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">Protocole déclenché</div>
                      <code className="text-xs text-muted-foreground break-all">
                        {buildLemtelUrl(lastDialed)}
                      </code>
                      <div className="text-xs text-muted-foreground mt-1">
                        Si rien ne s'ouvre, installe d'abord{" "}
                        <a href="/download" className="text-primary underline">
                          Lemtel Desktop
                        </a>
                        .
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Feature list */}
            <ul className="mt-6 pt-6 border-t border-border/60 space-y-2 text-sm">
              {[
                "Détection automatique des numéros sur n'importe quelle page (extension Chrome)",
                "Auto-dial 1s après ouverture de l'app desktop",
                "Pré-remplissage instantané dans le softphone",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-foreground/85">{t}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* RIGHT — PBX visual + Mobile download */}
          <div className="space-y-6">
            {/* PBX hero card */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
              className="relative rounded-3xl overflow-hidden border border-border/60 bg-card/60 backdrop-blur-xl"
            >
              <div className="relative aspect-[16/10]">
                <img
                  src={pbxShowcase}
                  alt="Lemtel FashionPBX cloud telecom infrastructure"
                  loading="lazy"
                  width={1024}
                  height={640}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-background/80 backdrop-blur-md border border-border/60">
                  <img
                    src={LEMTEL_LOGO}
                    alt="Lemtel logo"
                    width={28}
                    height={28}
                    className="w-7 h-7 object-contain"
                  />
                  <span className="text-xs font-semibold">FashionPBX</span>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-xl font-bold mb-1">Cloud PBX × AVA AI</h3>
                  <p className="text-sm text-muted-foreground">
                    Extensions, DIDs, IVR, queues, voicemail — orchestrés par tes agents IA.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Mobile App download card */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.1 }}
              className="relative rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-6 overflow-hidden"
            >
              <div className="flex items-start gap-4">
                {/* Mobile preview */}
                <div className="relative w-24 h-32 md:w-28 md:h-36 flex-shrink-0 rounded-2xl overflow-hidden border border-border/60 shadow-lg">
                  <img
                    src={mobileShowcase}
                    alt="Lemtel Mobile App preview"
                    loading="lazy"
                    width={224}
                    height={288}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-background/80 backdrop-blur">
                    <img
                      src={LEMTEL_LOGO}
                      alt=""
                      width={16}
                      height={16}
                      className="w-4 h-4 object-contain"
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-lg">Lemtel Mobile App</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Softphone iOS &amp; Android. Même parcours click-to-dial qu'sur desktop.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      asChild
                      variant="outline"
                      className="border-primary/30 hover:bg-primary/10 justify-start"
                    >
                      <a href="/download?platform=ios" aria-label="Download for iOS">
                        <Apple className="w-4 h-4 mr-2" />
                        <div className="text-left leading-tight">
                          <div className="text-[10px] opacity-70">Download on the</div>
                          <div className="text-sm font-semibold">App Store</div>
                        </div>
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="border-primary/30 hover:bg-primary/10 justify-start"
                    >
                      <a href="/download?platform=android" aria-label="Get it on Google Play">
                        <Play className="w-4 h-4 mr-2" />
                        <div className="text-left leading-tight">
                          <div className="text-[10px] opacity-70">Get it on</div>
                          <div className="text-sm font-semibold">Google Play</div>
                        </div>
                      </a>
                    </Button>
                  </div>

                  <button
                    onClick={() => handleDial()}
                    className="mt-3 w-full text-xs text-primary hover:text-primary/80 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-primary/30 hover:bg-primary/5 transition"
                  >
                    <Phone className="w-3 h-3" />
                    Tester le même click-to-dial depuis ici
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Desktop deep-link strip */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card/40 to-accent/10 p-4 flex items-center gap-3"
            >
              <img
                src={DESKTOP_ICON}
                alt="Lemtel Desktop"
                width={40}
                height={40}
                className="w-10 h-10 object-contain rounded-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Ouvrir l'app Desktop maintenant</div>
                <div className="text-xs text-muted-foreground">
                  Auto-dial + pré-remplissage — exactement comme l'extension Chrome.
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleDial()}
                className="bg-primary hover:bg-primary/90 flex-shrink-0"
              >
                <Monitor className="w-4 h-4 mr-1.5" />
                Lancer
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LemtelInteractiveDemo;
