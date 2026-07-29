// AVA animated orb — ChatGPT-style speaking/listening visualization.
// Pure CSS + reactive to mic level. Reused in chat empty state and voice mode.
import { useEffect, useRef, useState } from "react";

export type AvaOrbState = "idle" | "connecting" | "listening" | "speaking" | "processing" | "error";

interface Props {
  state: AvaOrbState;
  /** 0..1 audio intensity (mic or tts). Optional. */
  level?: number;
  size?: number;
}

const STATE_TINT: Record<AvaOrbState, { a: string; b: string; c: string }> = {
  idle:       { a: "#9B7FE8", b: "#2E9BDC", c: "#00D4AA" },
  connecting: { a: "#9B7FE8", b: "#4A7FA5", c: "#2E9BDC" },
  listening:  { a: "#2E9BDC", b: "#9B7FE8", c: "#7FD8FF" },
  speaking:   { a: "#F5A623", b: "#E85D9B", c: "#9B7FE8" },
  processing: { a: "#9B7FE8", b: "#2E9BDC", c: "#9B7FE8" },
  error:      { a: "#E84C4C", b: "#F5A623", c: "#E84C4C" },
};

export default function AvaOrb({ state, level = 0, size = 240 }: Props) {
  const { a, b, c } = STATE_TINT[state];
  const intensity = Math.max(0, Math.min(1, level));
  const scale = state === "listening" ? 1 + intensity * 0.08 : state === "speaking" ? 1.02 : 1;
  const speed = state === "speaking" ? "3s" : state === "processing" ? "1.6s" : "8s";
  const glow = state === "speaking" ? 0.7 : state === "listening" ? 0.4 + intensity * 0.5 : 0.35;

  return (
    <div
      className="relative select-none pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Outer soft halo */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${a}55 0%, ${b}22 40%, transparent 70%)`,
          filter: "blur(24px)",
          opacity: glow,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Speaking rings (emitted waves) */}
      {state === "speaking" && (
        <>
          <div className="ava-orb-ring" style={{ borderColor: `${a}80`, animationDelay: "0s" }} />
          <div className="ava-orb-ring" style={{ borderColor: `${b}70`, animationDelay: "0.7s" }} />
          <div className="ava-orb-ring" style={{ borderColor: `${c}60`, animationDelay: "1.4s" }} />
        </>
      )}

      {/* Rotating conic core */}
      <div
        className="absolute rounded-full ava-orb-core"
        style={{
          inset: "10%",
          background: `conic-gradient(from 0deg, ${a}, ${b}, ${c}, ${a})`,
          filter: "blur(2px) saturate(1.2)",
          animation: `ava-orb-spin ${speed} linear infinite`,
          transform: `scale(${scale})`,
          transition: "transform 0.15s ease-out",
        }}
      />

      {/* Counter-rotating inner ring */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "22%",
          background: `conic-gradient(from 180deg, ${c}cc, ${a}aa, ${b}cc, ${c}cc)`,
          mixBlendMode: "screen",
          filter: "blur(6px)",
          animation: `ava-orb-spin-rev ${state === "processing" ? "1.2s" : "6s"} linear infinite`,
          opacity: 0.85,
        }}
      />

      {/* Glossy center */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "34%",
          background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${b}dd 40%, ${a}aa 100%)`,
          boxShadow: `inset 0 0 20px ${a}66, 0 0 30px ${b}55`,
          animation: state === "idle" || state === "connecting" ? "ava-orb-breath 4s ease-in-out infinite" : undefined,
        }}
      />

      <style>{`
        @keyframes ava-orb-spin { to { transform: rotate(360deg) scale(${scale}); } }
        @keyframes ava-orb-spin-rev { to { transform: rotate(-360deg); } }
        @keyframes ava-orb-breath {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes ava-orb-emit {
          0% { transform: scale(0.7); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .ava-orb-ring {
          position: absolute;
          inset: 8%;
          border-radius: 9999px;
          border: 2px solid;
          animation: ava-orb-emit 2.1s ease-out infinite;
        }
      `}</style>
    </div>
  );
}

/** Hook: sample an AnalyserNode into a normalized 0..1 level, sampled at 20fps. */
export function useAnalyserLevel(analyser: AnalyserNode | null, active: boolean): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analyser || !active) { setLevel(0); return; }
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 50) {
        last = t;
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        setLevel(Math.min(1, (sum / buf.length) / 128));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyser, active]);

  return level;
}
