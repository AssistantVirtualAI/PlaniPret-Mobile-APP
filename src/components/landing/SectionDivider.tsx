import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface SectionDividerProps {
  variant?: "wave" | "network" | "pulse";
  className?: string;
}

const NetworkDivider = () => {
  const nodes = [
    { x: 8, y: 50 }, { x: 18, y: 20 }, { x: 28, y: 70 },
    { x: 38, y: 30 }, { x: 48, y: 60 }, { x: 58, y: 25 },
    { x: 68, y: 65 }, { x: 78, y: 35 }, { x: 88, y: 55 }, { x: 95, y: 40 },
  ];
  const edges = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],
    [0,2],[1,3],[3,5],[5,7],[7,9],[2,4],[4,6],[6,8],
  ];

  return (
    <svg viewBox="0 0 100 90" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="netGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
          <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {edges.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke="url(#netGrad)"
          strokeWidth="0.4"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: i * 0.06, ease: "easeInOut" }}
        />
      ))}
      {nodes.map((node, i) => (
        <motion.circle
          key={i}
          cx={node.x} cy={node.y} r="1.8"
          fill="hsl(var(--primary))"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 0.8] }}
          transition={{ duration: 0.6, delay: i * 0.08 }}
        />
      ))}
      {nodes.map((node, i) => (
        <motion.circle
          key={`pulse-${i}`}
          cx={node.x} cy={node.y} r="1.8"
          fill="transparent"
          stroke="hsl(var(--primary))"
          strokeWidth="0.5"
          animate={{ scale: [1, 2.2, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2.5, delay: i * 0.3, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </svg>
  );
};

const WaveDivider = () => (
  <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-full">
    <defs>
      <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
        <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
      </linearGradient>
    </defs>
    <motion.path
      d="M0,40 C180,80 360,0 540,40 C720,80 900,0 1080,40 C1260,80 1440,20 1440,40"
      fill="none"
      stroke="url(#waveGrad)"
      strokeWidth="2"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 1.8, ease: "easeInOut" }}
    />
    <motion.path
      d="M0,50 C200,20 400,70 600,45 C800,20 1000,65 1200,45 C1350,30 1440,50 1440,50"
      fill="none"
      stroke="hsl(var(--primary))"
      strokeWidth="1"
      strokeOpacity="0.3"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 2, delay: 0.3, ease: "easeInOut" }}
    />
    {[180, 420, 660, 900, 1140, 1380].map((x, i) => (
      <motion.circle
        key={i}
        cx={x} cy={i % 2 === 0 ? 65 : 20} r="3"
        fill="hsl(var(--primary))"
        fillOpacity="0.6"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.8 + i * 0.1 }}
      />
    ))}
  </svg>
);

const PulseDivider = () => {
  const bars = Array.from({ length: 48 }, (_, i) => i);
  const heights = [
    30,55,40,70,25,60,80,45,35,65,50,75,30,55,40,70,
    25,60,80,45,35,65,50,75,30,55,40,70,25,60,80,45,
    35,65,50,75,30,55,40,70,25,60,80,45,35,65,50,75,
  ];

  return (
    <svg viewBox="0 0 960 80" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.1" />
          <stop offset="30%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
          <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {bars.map((_, i) => {
        const h = heights[i];
        const x = 10 + i * 19.6;
        const y = (80 - h) / 2;
        return (
          <motion.rect
            key={i}
            x={x} y={y}
            width="8" height={h}
            rx="4"
            fill="url(#pulseGrad)"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: i * 0.02, ease: "easeOut" }}
            style={{ transformOrigin: `${x + 4}px 40px` }}
          />
        );
      })}
    </svg>
  );
};

export const SectionDivider = ({ variant = "wave", className = "" }: SectionDividerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <div
      ref={ref}
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height: variant === "network" ? "100px" : "80px" }}
      aria-hidden="true"
    >
      <motion.div
        className="absolute inset-0 opacity-40"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 0.4 } : { opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        {variant === "wave" && <WaveDivider />}
        {variant === "network" && <NetworkDivider />}
        {variant === "pulse" && <PulseDivider />}
      </motion.div>
    </div>
  );
};
