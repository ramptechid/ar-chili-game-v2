import { create } from 'zustand';

export type GameState = 'intro' | 'playing' | 'gameover';

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
  { type: 0,  points: 1, count: 6 },
  { type: 10, points: 2, count: 3 },
  { type: 11, points: 3, count: 1 },
];

function spawnPos() {
  const r     = 5 + Math.random() * 6;
  const theta = Math.random() * Math.PI * 2;
  const phi   = (Math.random() - 0.5) * Math.PI * 0.4;
  return {
    x: r * Math.cos(phi) * Math.cos(theta),
    y: Math.max(-2, Math.min(6, r * Math.sin(phi))),
    z: r * Math.cos(phi) * Math.sin(theta),
  };
}

function generatePositions(): ObjectPosition[] {
  const result: ObjectPosition[] = [];
  const now = Date.now();
  let targetIdx = 0;

  for (const def of TARGET_DEFS) {
    for (let i = 0; i < def.count; i++) {
      result.push({
        id: `target-${targetIdx++}`,
        ...spawnPos(),
        found: false,
        type: def.type,
        isTarget: true,
        points: def.points,
        spawnTime: now,
        duration: 4000 + Math.random() * 6000,
      });
    }
  }
  for (let i = 0; i < TOTAL_DECOYS; i++) {
    result.push({
      id: `decoy-${i}`,
      ...spawnPos(),
      found: false,
      type: Math.floor(Math.random() * 9) + 1,
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
  objects: [],
  playerName: '',

  setGameState: state => set({ gameState: state }),
  setPlayerName: name => set({ playerName: name }),

  startGame: () => set({
    gameState: 'playing',
    startTime: Date.now(),
    elapsedTime: 0,
    score: 0,
    objects: generatePositions(),
  }),

  endGame: () => set({ gameState: 'gameover' }),

  tickTimer: () => {
    const { startTime, gameState, objects } = get();
    if (gameState !== 'playing' || !startTime) return;

    const now     = Date.now();
    const elapsed = now - startTime;

    if (elapsed >= GAME_DURATION_MS) {
      set({ elapsedTime: GAME_DURATION_MS });
      get().endGame();
      return;
    }

    let changed = false;
    const newObjects = objects.map(obj => {
      if (!obj.found && now - obj.spawnTime > obj.duration) {
        changed = true;
        return { ...obj, ...spawnPos(), spawnTime: now, duration: 3000 + Math.random() * 5000 };
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

    if (hit.isTarget) {
      // Disappear immediately, respawn at new position after 1.5 s
      const newObjects = state.objects.map(o => o.id === id ? { ...o, found: true } : o);
      set({ score: state.score + hit.points, objects: newObjects });
      setTimeout(() => {
        if (get().gameState !== 'playing') return;
        set({
          objects: get().objects.map(o =>
            o.id === id
              ? { ...o, ...spawnPos(), found: false, spawnTime: Date.now(), duration: 4000 + Math.random() * 6000 }
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
    objects: [],
  }),
}));

export function formatHudTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
