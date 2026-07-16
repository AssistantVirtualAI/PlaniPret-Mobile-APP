import React from "react";
import mascotImg from "@/assets/mascot-ava.png";

interface Props {
  talking?: boolean;
  listening?: boolean;
  compact?: boolean;
}

/**
 * AVA mascot — premium 3D rendered character displayed as an image,
 * with subtle CSS animations (idle bobbing, soft halo glow, talking pulse).
 */
export default function MascotRobot({ talking = false, listening = false, compact = false }: Props) {
  const size = compact ? 88 : 240;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      {/* Soft glowing halo */}
      <div
        style={{
          position: "absolute",
          inset: compact ? -8 : -20,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,180,255,0.35) 0%, rgba(0,80,255,0.12) 40%, transparent 70%)",
          filter: "blur(14px)",
          animation: `mascot-halo ${talking ? "1.2s" : "3.6s"} ease-in-out infinite`,
        }}
      />
      <img
        src={mascotImg}
        alt="AVA mascot"
        width={size}
        height={size}
        draggable={false}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: listening
            ? "drop-shadow(0 8px 24px rgba(0,120,255,0.45))"
            : "drop-shadow(0 6px 18px rgba(0,80,200,0.35))",
          animation: talking
            ? "mascot-talk 0.55s ease-in-out infinite"
            : "mascot-idle 4.2s ease-in-out infinite",
          transformOrigin: "50% 100%",
        }}
      />

      <style>{`
        @keyframes mascot-idle {
          0%, 100% { transform: translateY(0) rotate(-0.6deg); }
          50%      { transform: translateY(-6px) rotate(0.6deg); }
        }
        @keyframes mascot-talk {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-3px) scale(1.025); }
        }
        @keyframes mascot-halo {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 0.95; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
