import { DesktopDownloadCard } from "@/components/telephony/DesktopDownloadCard";
import { LiveReleaseCard } from "@/components/telephony/LiveReleaseCard";
import { Card } from "@/components/ui/card";

export default function Download() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-6 py-5 flex items-center gap-3">
          <img src="/lemtel-logo.png?v=3" alt="Lemtel Telecom" className="h-9 w-9 rounded-lg" />
          <div>
            <div className="font-bold text-lg leading-tight">Lemtel Telecom</div>
            <div className="text-xs text-muted-foreground">Download</div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-4xl space-y-8">
        <section className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-extrabold">Download Lemtel Telecom</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            AI-Powered Business Softphone for Lemtel Communications. Make and receive calls,
            send SMS, and access AI insights from any device.
          </p>
        </section>

        <LiveReleaseCard />
        <DesktopDownloadCard />

        <Card className="p-6 border-amber-500/40 bg-amber-500/5">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <span aria-hidden>🍎</span> macOS : « Lemtel Telecom est endommagé » ?
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            macOS bloque les apps non signées par Apple (Gatekeeper). L'app n'est
            pas endommagée — il suffit de retirer l'attribut de quarantaine.
          </p>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold mb-1">Option 1 — Terminal (recommandé)</div>
              <pre className="text-xs bg-background border border-border rounded p-3 overflow-auto">
{`xattr -cr ~/Downloads/Lemtel.Telecom-arm64.dmg
open ~/Downloads/Lemtel.Telecom-arm64.dmg`}
              </pre>
            </div>
            <div>
              <div className="text-xs font-semibold mb-1">Option 2 — Finder</div>
              <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                <li>Clic droit sur le .dmg → <b>Ouvrir</b></li>
                <li>Si la dialog refuse : <b>Réglages Système → Confidentialité et sécurité</b></li>
                <li>Tout en bas, cliquer <b>« Ouvrir quand même »</b></li>
              </ol>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">System requirements</h2>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li><b className="text-foreground">Windows:</b> Windows 10 or later, 64-bit</li>
            <li><b className="text-foreground">Mac:</b> macOS 11 Big Sur or later (Intel or Apple Silicon)</li>
            <li><b className="text-foreground">Linux:</b> Ubuntu 20.04+ or equivalent (AppImage / .deb)</li>
            <li><b className="text-foreground">All platforms:</b> Internet connection required · Microphone required for calls</li>
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Also available on mobile</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <a
              href="https://apps.apple.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download on the App Store"
            >
              <img
                src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
                alt="Download on the App Store"
                className="h-12"
              />
            </a>
            <a
              href="https://play.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Get it on Google Play"
            >
              <img
                src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                alt="Get it on Google Play"
                className="h-12"
              />
            </a>
          </div>
        </Card>
      </main>

      <footer className="border-t border-border mt-12">
        <div className="container mx-auto px-6 py-6 text-center text-sm text-muted-foreground">
          Powered by AVA AI ·{" "}
          <a href="https://assistantvirtualai.com" className="text-primary hover:underline">
            assistantvirtualai.com
          </a>
        </div>
      </footer>
    </div>
  );
}
