import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";
import foxImg from "/mascot/lemtel-fox.png?url";

function FoxPlane({ talking, listening }: { talking: boolean; listening: boolean }) {
  const tex = useTexture(foxImg);
  const ref = useRef<THREE.Mesh>(null);
  const t0 = useRef(Math.random() * Math.PI * 2);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime + t0.current;
    // gentle breathing
    const breathe = 1 + Math.sin(t * 1.6) * 0.015;
    // tilt slightly when listening, bob when talking
    const tilt = listening ? Math.sin(t * 2) * 0.08 : 0;
    const bob = talking ? Math.sin(t * 9) * 0.04 : Math.sin(t * 1.2) * 0.015;
    ref.current.scale.setScalar(breathe);
    ref.current.rotation.z = tilt;
    ref.current.position.y = bob;
  });

  return (
    <mesh ref={ref}>
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}

export default function MascotFox({
  talking,
  listening,
  className = "",
}: { talking?: boolean; listening?: boolean; className?: string }) {
  return (
    <div className={"relative " + className}>
      <Canvas
        orthographic
        camera={{ zoom: 100, position: [0, 0, 5] }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={1} />
        <FoxPlane talking={!!talking} listening={!!listening} />
      </Canvas>
      {/* Lipsync overlay — mouth opens when assistant is "talking" (streaming tokens) */}
      {talking && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-black/80 animate-mascot-mouth"
          style={{ width: "10%", top: "62%", height: "6%" }}
        />
      )}
    </div>
  );
}
