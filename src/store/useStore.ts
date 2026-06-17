import { create } from 'zustand';

export type GameState = 'intro' | 'countdown' | 'playing' | 'gameover';

export interface ObjectPosition {
  id: string;
  x: number;
  y: number;
  z: number;
  found: boolean;
  type: number;
  isTarget: boolean;
  points: number;
  spawnTime: number;
  duration: number;
}

interface StoreState {
  gameState: GameState;
  startTime: number | null;
  elapsedTime: number;
  score: number;
  scoreCabe: number;
  scorePack: number;
  scoreJumbo: number;
  objects: ObjectPosition[];
  playerName: string;
  setGameState: (state: GameState) => void;
  startGame: () => void;
  endGame: () => void;
  tickTimer: () => void;
  foundObject: (id: string) => void;
  setPlayerName: (name: string) => void;
  resetGame: () => void;
}

export const GAME_DURATION_MS = 30_000;

const TOTAL_DECOYS = 10;

// type 0 = Cabe (1pt), type 10 = pack_cabeijo (2pt), type 11 = pack_cabeijo_jumbo (3pt)
const TARGET_DEFS = [
  { type: 0,  points: 1, count: 5 },
  { type: 10, points: 3, count: 3 },
  { type: 11, points: 5, count: 2 },
];

const IOS_TARGET_DEFS = [
  { type: 0,  points: 1, count: 3 },
  { type: 10, points: 3, count: 2 },
  { type: 11, points: 5, count: 1 },
];

const DEFAULT_DECOY_TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const IOS_DECOY_TYPES = [1, 2, 3, 4, 5, 6, 9];

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const iPadOS = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

function getSpawnProfile() {
  if (!isIOSDevice()) {
    return {
      targetDefs: TARGET_DEFS,
      decoyCount: TOTAL_DECOYS,
      decoyTypes: DEFAULT_DECOY_TYPES,
      radiusMin: 5,
      radiusRange: 6,
      phiRange: Math.PI * 0.4,
      yMin: -2,
      yMax: 6,
    };
  }

  return {
    targetDefs: IOS_TARGET_DEFS,
    decoyCount: 4,
    decoyTypes: IOS_DECOY_TYPES,
    radiusMin: 3.5,
    radiusRange: 3.5,
    phiRange: Math.PI * 0.28,
    yMin: -1.3,
    yMax: 4,
  };
}

function spawnPos(profile = getSpawnProfile()) {
  const r     = profile.radiusMin + Math.random() * profile.radiusRange;
  const theta = Math.random() * Math.PI * 2;
  const phi   = (Math.random() - 0.5) * profile.phiRange;
  return {
    x: r * Math.cos(phi) * Math.cos(theta),
    y: Math.max(profile.yMin, Math.min(profile.yMax, r * Math.sin(phi))),
    z: r * Math.cos(phi) * Math.sin(theta),
  };
}

function generatePositions(): ObjectPosition[] {
  const result: ObjectPosition[] = [];
  const profile = getSpawnProfile();
  const now = Date.now();
  let targetIdx = 0;

  for (const def of profile.targetDefs) {
    for (let i = 0; i < def.count; i++) {
      result.push({
        id: `target-${targetIdx++}`,
        ...spawnPos(profile),
        found: false,
        type: def.type,
        isTarget: true,
        points: def.points,
        spawnTime: now,
        duration: 4000 + Math.random() * 6000,
      });
    }
  }
  for (let i = 0; i < profile.decoyCount; i++) {
    const type = profile.decoyTypes[Math.floor(Math.random() * profile.decoyTypes.length)];
    result.push({
      id: `decoy-${i}`,
      ...spawnPos(profile),
      found: false,
      type,
      isTarget: false,
      points: 0,
      spawnTime: now,
      duration: 3000 + Math.random() * 5000,
    });
  }

  return result.sort(() => Math.random() - 0.5);
}

export const useStore = create<StoreState>((set, get) => ({
  gameState: 'intro',
  startTime: null,
  elapsedTime: 0,
  score: 0,
  scoreCabe: 0,
  scorePack: 0,
  scoreJumbo: 0,
  objects: [],
  playerName: '',

  setGameState: state => set({ gameState: state }),
  setPlayerName: name => set({ playerName: name }),

  startGame: () => set({
    gameState: 'playing',
    startTime: Date.now(),
    elapsedTime: 0,
    score: 0,
    scoreCabe: 0,
    scorePack: 0,
    scoreJumbo: 0,
    objects: generatePositions(),
  }),

  endGame: () => set({ gameState: 'gameover' }),

  tickTimer: () => {
    const { startTime, gameState, objects } = get();
    if (gameState !== 'playing' || !startTime) return;

    const now     = Date.now();
    const elapsed = now - startTime;
    const profile = getSpawnProfile();

    if (elapsed >= GAME_DURATION_MS) {
      set({ elapsedTime: GAME_DURATION_MS });
      get().endGame();
      return;
    }

    let changed = false;
    const newObjects = objects.map(obj => {
      if (!obj.found && now - obj.spawnTime > obj.duration) {
        changed = true;
        return { ...obj, ...spawnPos(profile), spawnTime: now, duration: 3000 + Math.random() * 5000 };
      }
      return obj;
    });

    set({ elapsedTime: elapsed, ...(changed ? { objects: newObjects } : {}) });
  },

  foundObject: (id: string) => {
    const state = get();
    if (state.gameState !== 'playing') return;

    const hit = state.objects.find(o => o.id === id);
    if (!hit || hit.found) return;
    const profile = getSpawnProfile();

    if (hit.isTarget) {
      // Disappear immediately, respawn at new position after 1.5 s
      const newObjects = state.objects.map(o => o.id === id ? { ...o, found: true } : o);
      const perType =
        hit.type === 0  ? { scoreCabe:  state.scoreCabe  + hit.points } :
        hit.type === 10 ? { scorePack:  state.scorePack  + hit.points } :
        hit.type === 11 ? { scoreJumbo: state.scoreJumbo + hit.points } : {};
      set({ score: state.score + hit.points, objects: newObjects, ...perType });
      setTimeout(() => {
        if (get().gameState !== 'playing') return;
        set({
          objects: get().objects.map(o =>
            o.id === id
              ? { ...o, ...spawnPos(profile), found: false, spawnTime: Date.now(), duration: 4000 + Math.random() * 6000 }
              : o
          ),
        });
      }, 1500);
    } else {
      // Decoy — silently mark found, respawns via timer (no score change, no miss effect)
      const newObjects = state.objects.map(o => o.id === id ? { ...o, found: true } : o);
      set({ objects: newObjects });
    }
  },

  resetGame: () => set({
    gameState: 'intro',
    startTime: null,
    elapsedTime: 0,
    score: 0,
    scoreCabe: 0,
    scorePack: 0,
    scoreJumbo: 0,
    objects: [],
  }),
}));

export function formatHudTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
