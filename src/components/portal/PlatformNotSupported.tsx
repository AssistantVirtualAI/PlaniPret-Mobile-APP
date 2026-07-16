import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

export function PlatformNotSupported({
  title,
  description,
  primaryCtaLabel = "Voir les conversations",
  primaryCtaHref,
}: {
  title: string;
  description: string;
  primaryCtaLabel?: string;
  primaryCtaHref: string;
}) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/30">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-lg font-semibold mb-2">{title}</h1>
        <p className="text-muted-foreground max-w-lg">{description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link to={primaryCtaHref}>{primaryCtaLabel}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={"/portal/dashboard"}>Tableau de bord</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
