import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import { useGLTF, Center, Resize } from '@react-three/drei';
import * as THREE from 'three';

interface HuntObjectProps {
  id: string;
  position: [number, number, number];
  type: number;
  isTarget: boolean;
}

// Local model paths — served from /assets/models/ via Vite publicDir
const MODELS: Record<string, string> = {
  target: '/assets/models/Cabe.glb',
  type1:  '/assets/models/Alarm_Clock.glb',
  type2:  '/assets/models/Ball.glb',
  type3:  '/assets/models/Barbel_3Kg.glb',
  type4:  '/assets/models/Bedside_Table_001.glb',
  type5:  '/assets/models/Horn.glb',
  type6:  '/assets/models/Plane.glb',
  type7:  '/assets/models/Sun_Glasses.glb',
  type8:  '/assets/models/Table.glb',
  type9:  '/assets/models/Tea_Pot.glb',
};

// Preload all models at startup
Object.values(MODELS).forEach(url => useGLTF.preload(url));

export function HuntObject({ id, position, type, isTarget }: HuntObjectProps) {
  const meshRef = useRef<THREE.Group>(null);
  const { foundObject } = useStore();

  const url = isTarget ? MODELS.target : (MODELS[`type${type}`] ?? MODELS.type1);
  const { scene } = useGLTF(url);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.8;
    }
  });

  return (
    <group
      ref={meshRef}
      position={position}
      userData={{ id }}
      onClick={e => {
        e.stopPropagation();
        foundObject(id);
      }}
    >
      <Center>
        <Resize scale={isTarget ? 0.28 : 0.32}>
          <primitive object={scene.clone()} />
        </Resize>
      </Center>
    </group>
  );
}
