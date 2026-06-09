import { useEffect, useState } from 'react';
import { CameraBackground } from './components/CameraBackground';
import { ARCanvas } from './components/ARCanvas';
import { OverlayUI } from './components/OverlayUI';
import { useStore } from './store/useStore';
import { xrStore } from './store/xr';

export default function App() {
  const gameState = useStore(state => state.gameState);
  const [isXR, setIsXR] = useState(false);

  // Track WebXR session state to toggle xr-mode body class
  useEffect(() => {
    return xrStore.subscribe((state: any) => {
      const active = !!state.session;
      setIsXR(active);
      if (active) {
        document.body.classList.add('xr-mode');
        document.body.classList.remove('camera-3d-mode');
      } else {
        document.body.classList.remove('xr-mode');
      }
    });
  }, []);

  // Manage body mode class so CSS camera/overlay visibility rules apply
  useEffect(() => {
    document.body.classList.remove('intro-mode', 'game-mode', 'result-mode');
    if (gameState === 'intro') {
      document.body.classList.add('intro-mode');
      document.body.classList.remove('camera-3d-mode');
    } else if (gameState === 'playing') {
      document.body.classList.add('game-mode');
      if (!isXR) document.body.classList.add('camera-3d-mode');
    } else {
      document.body.classList.add('result-mode');
      document.body.classList.remove('camera-3d-mode');
    }
  }, [gameState, isXR]);

  return (
    <>
      <CameraBackground />
      <div className="camera-overlay" />
      <ARCanvas />
      <div id="gameArea" />
      <OverlayUI />
    </>
  );
}
