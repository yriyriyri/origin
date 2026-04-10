"use client";

import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Environment, MeshTransmissionMaterial } from "@react-three/drei";
import { useMemo, useState } from "react";
import { useControls, Leva } from "leva";
import * as THREE from "three";

import Boids from "./Boids";
import type { BoidFieldRenderer } from "../lib/rendering/boidFieldRenderer";
import { useBoidNormalBridge } from "../lib/rendering/useBoidNormalBridge";

function SceneBackground() {
  const texture = useLoader(THREE.TextureLoader, "/bg.jpg");
  const { scene } = useThree();

  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    return () => {
      if (scene.background === texture) scene.background = null;
    };
  }, [scene, texture]);

  return null;
}

function TransmissionPlane({
  normalTexture,
}: {
  normalTexture: THREE.Texture | null;
}) {
  const { viewport } = useThree();

  const planeSize = useMemo(() => {
    const height = 1.0;
    const width = height * (viewport.width / viewport.height);
    return [width, height] as const;
  }, [viewport.width, viewport.height]);

  const materialProps = useControls({
    thickness: { value: 1.65, min: 0, max: 3, step: 0.05 },
    roughness: { value: 0, min: 0, max: 1, step: 0.01 },
    transmission: { value: 1, min: 0, max: 1, step: 0.01 },
    ior: { value: 1.2, min: 0, max: 3, step: 0.01 },
    chromaticAberration: { value: 0.0, min: 0, max: 1, step: 0.001 },
    backside: { value: false },
    normalScale: { value: 3.00, min: 0, max: 5, step: 0.01 },
  });

  return (
    <mesh rotation={[0, 0, 0]}>
      <planeGeometry args={[planeSize[0], planeSize[1], 1, 1]} />
      <MeshTransmissionMaterial
        thickness={materialProps.thickness}
        roughness={materialProps.roughness}
        transmission={materialProps.transmission}
        ior={materialProps.ior}
        chromaticAberration={materialProps.chromaticAberration}
        backside={materialProps.backside}
        normalMap={normalTexture ?? undefined}
        normalScale={new THREE.Vector2(materialProps.normalScale, materialProps.normalScale)}
      />
    </mesh>
  );
}

export default function BoidsR3FPreview() {
  const [fieldRenderer, setFieldRenderer] = useState<BoidFieldRenderer | null>(null);

  const { normalTexture } = useBoidNormalBridge({
    renderer: fieldRenderer,
    enabled: true,
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Leva collapsed={false} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          pointerEvents: "none",
          zIndex: 20,
        }}
      >
        <Boids onFieldRenderer={setFieldRenderer} />
      </div>

      <Canvas
        camera={{ position: [0, 0, 1.5,], fov: 35 }}
        gl={{ alpha: false, antialias: true }}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
        }}
      >
        <SceneBackground />
        <TransmissionPlane normalTexture={normalTexture} />
        <directionalLight intensity={2} position={[0, 2, 3]} />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}