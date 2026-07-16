import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mic, Volume2, Gauge, Sparkles, Play, RotateCcw } from "lucide-react";

const voices = [
  { id: "rachel", name: "Rachel", lang: "FR", type: "Féminine" },
  { id: "adam", name: "Adam", lang: "FR", type: "Masculine" },
  { id: "sarah", name: "Sarah", lang: "EN", type: "Féminine" },
  { id: "marcus", name: "Marcus", lang: "EN", type: "Masculine" },
];

export const VoiceConfigDemo = () => {
  const [selectedVoice, setSelectedVoice] = useState("rachel");
  const [stability, setStability] = useState([0.7]);
  const [similarity, setSimilarity] = useState([0.8]);
  const [speed, setSpeed] = useState([1.0]);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = async () => {
    setIsPlaying(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsPlaying(false);
  };

  const handleReset = () => {
    setStability([0.7]);
    setSimilarity([0.8]);
    setSpeed([1.0]);
    setSelectedVoice("rachel");
  };

  const currentVoice = voices.find((v) => v.id === selectedVoice);

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            Configuration Vocale
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 overflow-auto">
        {/* Voice Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Voix</Label>
          <div className="grid grid-cols-2 gap-2">
            {voices.map((voice) => (
              <Button
                key={voice.id}
                variant={selectedVoice === voice.id ? "default" : "outline"}
                className="justify-start gap-2 h-auto py-2"
                onClick={() => setSelectedVoice(voice.id)}
              >
                <div className="text-left">
                  <div className="font-medium">{voice.name}</div>
                  <div className="text-xs opacity-70">
                    {voice.lang} • {voice.type}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Stability Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              Stabilité
            </Label>
            <Badge variant="secondary">{Math.round(stability[0] * 100)}%</Badge>
          </div>
          <Slider
            value={stability}
            onValueChange={setStability}
            min={0}
            max={1}
            step={0.1}
          />
        </div>

        {/* Similarity Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Similarité
            </Label>
            <Badge variant="secondary">{Math.round(similarity[0] * 100)}%</Badge>
          </div>
          <Slider
            value={similarity}
            onValueChange={setSimilarity}
            min={0}
            max={1}
            step={0.1}
          />
        </div>

        {/* Speed Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Vitesse
            </Label>
            <Badge variant="secondary">{speed[0].toFixed(1)}x</Badge>
          </div>
          <Slider
            value={speed}
            onValueChange={setSpeed}
            min={0.5}
            max={2}
            step={0.1}
          />
        </div>

        {/* Play Button */}
        <Button
          className="w-full gap-2"
          onClick={handlePlay}
          disabled={isPlaying}
        >
          <Play className={`w-4 h-4 ${isPlaying ? "animate-pulse" : ""}`} />
          {isPlaying ? "Lecture en cours..." : `Tester ${currentVoice?.name}`}
        </Button>
      </CardContent>
    </Card>
  );
};
