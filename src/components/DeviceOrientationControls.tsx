import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { DeviceOrientationControls as DeviceOrientationControlsImpl } from 'three-stdlib';

export function DeviceOrientationControls() {
  const { camera, invalidate } = useThree();
  const controlsRef = useRef<DeviceOrientationControlsImpl | null>(null);

  useEffect(() => {
    const controls = new DeviceOrientationControlsImpl(camera);
    controlsRef.current = controls;

    return () => {
      controls.dispose();
    };
  }, [camera]);

  useFrame(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.update();
        invalidate();
      } catch {
        // suppress — can throw on iOS before first deviceorientation event
      }
    }
  });

  return null;
}
