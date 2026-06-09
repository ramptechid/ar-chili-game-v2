import { createXRStore } from '@react-three/xr';

export const xrStore = createXRStore({
  domOverlay: typeof document !== 'undefined' ? document.getElementById('root') || document.body : undefined
});
