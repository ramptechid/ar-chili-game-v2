import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Center, Resize } from '@react-three/drei';
import * as THREE from 'three';
import { asset } from '../lib/asset';

interface HuntObjectProps {
  id: string;
  position: [number, number, number];
  type: number;
  isTarget: boolean;
}

const MODELS: Record<string, string> = {
  type0:   asset('assets/models/Cabe.glb'),
  type1:   asset('assets/models/Alarm_Clock.glb'),
  type2:   asset('assets/models/Ball.glb'),
  type3:   asset('assets/models/Barbel_3Kg.glb'),
  type4:   asset('assets/models/Bedside_Table_001.glb'),
  type5:   asset('assets/models/Horn.glb'),
  type6:   asset('assets/models/Plane.glb'),
  type7:   asset('assets/models/Sun_Glasses.glb'),
  type8:   asset('assets/models/Table.glb'),
  type9:   asset('assets/models/Tea_Pot.glb'),
  type10:  asset('assets/models/pack_cabeijo.glb'),
  type11:  asset('assets/models/pack_cabeijo_jumbo.glb'),
};

// Preload all models at startup
Object.values(MODELS).forEach(url => useGLTF.preload(url));

export function HuntObject({ id, position, type, isTarget }: HuntObjectProps) {
  const meshRef = useRef<THREE.Group>(null);

  const url = MODELS[`type${type}`] ?? MODELS.type0;
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
    >
      <Center>
        <Resize scale={type === 11 ? 2.4 : type === 10 ? 2.0 : isTarget ? 1.8 : 1.5}>
          <primitive object={scene.clone()} />
        </Resize>
      </Center>
    </group>
  );
}
