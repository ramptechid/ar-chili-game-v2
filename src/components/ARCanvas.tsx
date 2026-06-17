import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { useStore } from '../store/useStore';
import { DeviceOrientationControls } from './DeviceOrientationControls';
import { HuntObject } from './HuntObject';
import { ErrorBoundary } from './ErrorBoundary';
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
      <ambientLight intensity={0.65} />
      <directionalLight position={[1.8, 3.2, 1.6]} intensity={2.2} />
      <directionalLight position={[-2.2, 1.4, -1.4]} color="#cfe8ff" intensity={0.85} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      {isPlaying && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            {objects.map(obj =>
              !obj.found && (
                <HuntObject
                  key={obj.id}
                  id={obj.id}
                  position={[obj.x, obj.y, obj.z]}
                  type={obj.type}
                  isTarget={obj.isTarget}
                />
              )
            )}
          </Suspense>
        </ErrorBoundary>
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

  // Mount canvas only when active — avoids iOS WebGL context init inside display:none
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
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        gl={{
          alpha: true,
          antialias: false,           // off — iOS berat dengan antialias
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
