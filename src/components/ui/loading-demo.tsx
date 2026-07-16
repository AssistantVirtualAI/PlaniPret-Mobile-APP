import { LoadingIcon, LoadingVariant, LoadingSize } from "./loading-icon";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

const variants: LoadingVariant[] = ["spinner", "dots", "ring", "ball", "bars", "infinity"];
const sizes: LoadingSize[] = ["sm", "md", "lg"];

export function LoadingDemo() {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Loading Icon Variants</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {variants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border/50">
              <span className="text-sm font-medium capitalize">{variant}</span>
              <div className="flex flex-col items-center gap-3">
                {sizes.map((size) => (
                  <div key={size} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{size}</span>
                    <LoadingIcon variant={variant} size={size} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
