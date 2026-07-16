import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Globe, Mic, MessageSquare, Phone, Palette } from "lucide-react";

const themes = [
  { id: "blue", name: "Bleu", primary: "#3b82f6", bg: "#1e3a5f" },
  { id: "purple", name: "Violet", primary: "#8b5cf6", bg: "#2d1b4e" },
  { id: "green", name: "Vert", primary: "#10b981", bg: "#134e4a" },
  { id: "orange", name: "Orange", primary: "#f59e0b", bg: "#451a03" },
];

const positions = [
  { id: "bottom-right", name: "Bas Droite" },
  { id: "bottom-left", name: "Bas Gauche" },
  { id: "top-right", name: "Haut Droite" },
  { id: "top-left", name: "Haut Gauche" },
];

export const WidgetPreviewDemo = () => {
  const [selectedTheme, setSelectedTheme] = useState("blue");
  const [position, setPosition] = useState("bottom-right");
  const [size, setSize] = useState([60]);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);

  const currentTheme = themes.find((t) => t.id === selectedTheme)!;

  const getPositionStyle = () => {
    switch (position) {
      case "bottom-right":
        return { bottom: "16px", right: "16px" };
      case "bottom-left":
        return { bottom: "16px", left: "16px" };
      case "top-right":
        return { top: "16px", right: "16px" };
      case "top-left":
        return { top: "16px", left: "16px" };
      default:
        return { bottom: "16px", right: "16px" };
    }
  };

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Aperçu Widget
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 grid grid-cols-2 gap-4">
        {/* Controls */}
        <div className="space-y-4">
          {/* Theme Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Thème
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {themes.map((theme) => (
                <Button
                  key={theme.id}
                  variant={selectedTheme === theme.id ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setSelectedTheme(theme.id)}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: theme.primary }}
                  />
                  {theme.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Position Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Position</Label>
            <div className="grid grid-cols-2 gap-2">
              {positions.map((pos) => (
                <Button
                  key={pos.id}
                  variant={position === pos.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPosition(pos.id)}
                >
                  {pos.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Size Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Taille</Label>
              <Badge variant="secondary">{size[0]}px</Badge>
            </div>
            <Slider
              value={size}
              onValueChange={setSize}
              min={40}
              max={80}
              step={4}
            />
          </div>
        </div>

        {/* Preview Area */}
        <div
          className="relative rounded-lg border overflow-hidden"
          style={{ backgroundColor: "#0f172a" }}
        >
          {/* Simulated webpage content */}
          <div className="p-3 space-y-2 opacity-30">
            <div className="h-3 bg-white/20 rounded w-3/4" />
            <div className="h-3 bg-white/20 rounded w-1/2" />
            <div className="h-8 bg-white/20 rounded w-full mt-4" />
            <div className="h-3 bg-white/20 rounded w-2/3" />
          </div>

          {/* Widget Button */}
          <button
            className="absolute transition-all duration-300 rounded-full flex items-center justify-center shadow-lg hover:scale-110"
            style={{
              ...getPositionStyle(),
              width: `${size[0]}px`,
              height: `${size[0]}px`,
              backgroundColor: currentTheme.primary,
            }}
            onClick={() => setIsWidgetOpen(!isWidgetOpen)}
          >
            {isWidgetOpen ? (
              <MessageSquare className="w-6 h-6 text-white" />
            ) : (
              <Phone className="w-6 h-6 text-white" />
            )}
          </button>

          {/* Widget Panel (when open) */}
          {isWidgetOpen && (
            <div
              className="absolute rounded-lg p-3 shadow-xl"
              style={{
                ...getPositionStyle(),
                [position.includes("bottom") ? "bottom" : "top"]: `${size[0] + 24}px`,
                width: "160px",
                backgroundColor: currentTheme.bg,
                border: `1px solid ${currentTheme.primary}40`,
              }}
            >
              <div className="text-white text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4" style={{ color: currentTheme.primary }} />
                  <span>Assistant Vocal</span>
                </div>
                <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full animate-pulse"
                    style={{ width: "60%", backgroundColor: currentTheme.primary }}
                  />
                </div>
                <div className="text-white/60 text-[10px]">
                  Cliquez pour parler...
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
