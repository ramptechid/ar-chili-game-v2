import { useEffect, useState } from 'react';
import { CameraBackground } from './components/CameraBackground';
import { ARCanvas } from './components/ARCanvas';
import { OverlayUI } from './components/OverlayUI';
import { useStore } from './store/useStore';
import { xrStore } from './store/xr';

function isMobileDevice() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return true;

  const ua = navigator.userAgent || '';
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const narrowViewport = Math.min(window.innerWidth, window.innerHeight) <= 820;

  return mobileUa || iPadOS || (hasTouch && narrowViewport);
}

function DesktopBlock() {
  return (
    <main className="desktop-block" aria-labelledby="desktopBlockTitle">
      <div className="desktop-block-panel">
        <img src="/assets/ui/logo_result_new.png" alt="Cabe Ijo Game" className="desktop-block-logo" />
        <h1 id="desktopBlockTitle">Buka di HP kamu</h1>
        <p>Game ini khusus dimainkan dari perangkat mobile.</p>
        <img
          src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https%3A%2F%2Fcabeijogame.com%2F"
          alt="QR code cabeijogame.com"
          className="desktop-block-qr"
        />
        <span>cabeijogame.com</span>
      </div>
    </main>
  );
}

export default function App() {
  const gameState = useStore(state => state.gameState);
  const [isXR, setIsXR] = useState(false);
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());

  useEffect(() => {
    const checkDevice = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);
    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, []);

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
    if (!isMobile) {
      document.body.classList.remove('intro-mode', 'game-mode', 'result-mode', 'camera-3d-mode', 'xr-mode');
      document.body.classList.add('desktop-block-mode');
      return;
    }

    document.body.classList.remove('desktop-block-mode');
    document.body.classList.remove('intro-mode', 'game-mode', 'result-mode');
    if (gameState === 'intro') {
      document.body.classList.add('intro-mode');
      document.body.classList.remove('camera-3d-mode');
    } else if (gameState === 'countdown' || gameState === 'playing') {
      document.body.classList.add('game-mode');
      if (!isXR) document.body.classList.add('camera-3d-mode');
    } else {
      document.body.classList.add('result-mode');
      document.body.classList.remove('camera-3d-mode');
    }
  }, [gameState, isMobile, isXR]);

  if (!isMobile) {
    return <DesktopBlock />;
  }

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
