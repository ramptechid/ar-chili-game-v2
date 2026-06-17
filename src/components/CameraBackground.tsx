import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

export function CameraBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const gameState = useStore(state => state.gameState);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Camera access denied or unavailable:', err);
      }
    }

    if (gameState === 'countdown' || gameState === 'playing' || gameState === 'gameover') {
      startCamera();
    }

    return () => {
      isMounted = false;
    };
  }, [gameState]);

  // Stop camera tracks when returning to intro
  useEffect(() => {
    if (gameState === 'intro' && streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }, [gameState]);

  return (
    <video
      ref={videoRef}
      id="cameraView"
      autoPlay
      playsInline
      muted
    />
  );
}
