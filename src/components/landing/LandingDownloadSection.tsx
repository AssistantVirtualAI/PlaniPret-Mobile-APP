import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Apple, MonitorDown, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchLatestRelease, resolveUrl } from "@/lib/githubRelease";

export const LandingDownloadSection = () => {
  const { data: release } = useQuery({
    queryKey: ["gh-release-latest"],
    queryFn: fetchLatestRelease,
    staleTime: 30 * 60_000,
    retry: false,
  });

  const downloads = [
    {
      platform: "Mac Apple Silicon",
      icon: Apple,
      label: "macOS (M1/M2/M3/M4)",
      sublabel: ".dmg · Apple Silicon",
      url: resolveUrl(release ?? null, "macArm"),
    },
    {
      platform: "Mac Intel",
      icon: Apple,
      label: "macOS (Intel)",
      sublabel: ".dmg · Intel chip",
      url: resolveUrl(release ?? null, "macIntel"),
    },
    {
      platform: "Windows",
      icon: MonitorDown,
      label: "Windows 10/11",
      sublabel: ".exe · Auto-installer",
      url: resolveUrl(release ?? null, "windows"),
    },
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 max-w-2xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Download Lemtel Telecom
          </h2>
          <p className="text-muted-foreground">
            Native desktop softphone. HD audio, click-to-dial, and AI-powered call insights.
            {release?.version && (
              <span className="block text-xs mt-1 opacity-70">Latest: {release.version}</span>
            )}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto"
        >
          {downloads.map((d) => {
            const Icon = d.icon;
            return (
              <Button
                key={d.platform}
                asChild
                variant="outline"
                className="h-auto py-5 px-5 justify-start gap-3 border-primary/30 hover:bg-primary/10 hover:border-primary/60"
              >
                <a href={d.url} download>
                  <Icon className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex flex-col items-start text-left flex-1">
                    <span className="text-sm font-semibold">{d.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.sublabel}
                    </span>
                  </div>
                  <Download className="h-4 w-4 text-muted-foreground opacity-60 shrink-0" />
                </a>
              </Button>
            );
          })}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center text-xs text-muted-foreground mt-8"
        >
          Also available on{" "}
          <a href="/download" className="text-primary hover:underline underline-offset-2">
            mobile and Linux
          </a>
          .
        </motion.p>
      </div>
    </section>
  );
};
