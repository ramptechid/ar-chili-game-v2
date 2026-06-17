import { useRef, useMemo } from 'react';
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

export const MODELS: Record<string, string> = {
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

// Preload all models — all files now under 1.3MB, safe for iOS
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const iPadOS = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

const IOS_MODEL_KEYS = new Set(['type0', 'type1', 'type2', 'type3', 'type4', 'type5', 'type6', 'type9', 'type10', 'type11']);
const preloadEntries = isIOSDevice()
  ? Object.entries(MODELS).filter(([key]) => IOS_MODEL_KEYS.has(key))
  : Object.entries(MODELS);

preloadEntries.forEach(([, url]) => useGLTF.preload(url));

export function HuntObject({ id, position, type, isTarget }: HuntObjectProps) {
  const meshRef = useRef<THREE.Group>(null);

  const url = MODELS[`type${type}`] ?? MODELS.type0;
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(), [scene]);

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
          <primitive object={cloned} />
        </Resize>
      </Center>
    </group>
  );
}
