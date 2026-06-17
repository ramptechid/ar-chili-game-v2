import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import { DeviceOrientationControls } from './DeviceOrientationControls';
import { HuntObject } from './HuntObject';
import * as THREE from 'three';
import { XR, useXR } from '@react-three/xr';
import { xrStore } from '../store/xr';

function RaycastController() {
  const { camera, scene } = useThree();
  const { foundObject } = useStore();

  useEffect(() => {
    const handleTryCatch = () => {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const intersect of intersects) {
        let obj: THREE.Object3D | null = intersect.object;
        while (obj) {
          if (obj.userData?.id) {
            foundObject(obj.userData.id);
            return;
          }
          obj = obj.parent;
        }
      }
      window.dispatchEvent(new CustomEvent('catch-miss'));
    };

    window.addEventListener('try-catch', handleTryCatch as EventListener);
    return () => window.removeEventListener('try-catch', handleTryCatch as EventListener);
  }, [camera, scene, foundObject]);

  return null;
}

function SceneContent() {
  const session = useXR(state => state.session);
  const isXR = session !== undefined;
  const objects = useStore(state => state.objects);
  const gameState = useStore(state => state.gameState);
  const isPlaying = gameState === 'playing';

  return (
    <>
      {!isXR && <DeviceOrientationControls />}
      <RaycastController />

      {/* Lights only — no Environment CDN dependency that can fail on iOS */}
      <ambientLight intensity={1.0} />
      <directionalLight position={[1.8, 3.2, 1.6]} intensity={2.5} castShadow={false} />
      <directionalLight position={[-2.2, 1.4, -1.4]} color="#cfe8ff" intensity={1.0} />
      <hemisphereLight args={['#87CEEB', '#228B22', 0.6]} />

      {/* Each object has its own Suspense — one model failing doesn't block others */}
      {isPlaying && objects.map(obj =>
        !obj.found && (
          <Suspense key={obj.id} fallback={null}>
            <HuntObject
              id={obj.id}
              position={[obj.x, obj.y, obj.z]}
              type={obj.type}
              isTarget={obj.isTarget}
            />
          </Suspense>
        )
      )}
    </>
  );
}

export function ARCanvas() {
  const gameState = useStore(state => state.gameState);
  const [isXRActive, setIsXRActive] = useState(false);

  useEffect(() => {
    return xrStore.subscribe((state: any) => {
      setIsXRActive(!!state.session);
    });
  }, []);

  // Mount canvas only when active — WebGL context created in visible element (iOS fix)
  const isActive = gameState === 'countdown' || gameState === 'playing';
  if (!isActive) return null;

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100dvh',
    zIndex: isXRActive ? 1 : 5,
    pointerEvents: isXRActive ? 'auto' : 'none',
    background: 'transparent',
  };

  return (
    <div style={containerStyle}>
      <Canvas
        camera={{ position: [0, 0, 0], fov: 75 }}
        dpr={[1, 2]}             // cap DPR — iPhone Pro DPR=3 overflows iOS WebGL memory
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        gl={{
          alpha: true,
          antialias: false,      // off — major perf/memory saving on iOS
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
        }}
      >
        <XR store={xrStore}>
          <SceneContent />
        </XR>
      </Canvas>
    </div>
  );
}
