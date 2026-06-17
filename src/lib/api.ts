const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export interface LeaderboardEntry {
  id?: number;
  playerName: string;
  instagram?: string;
  score: number;
  createdAt: number;
}

export async function submitScore(playerName: string, score: number, instagram = ''): Promise<number> {
  const res = await fetch(`${API_BASE}/api/submit_score.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, score, instagram }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Submit failed: ${res.status} ${text}`);
  }
  return (await res.json()).rank || 0;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard.php`);
    if (!res.ok) return [];
    return res.json() as Promise<LeaderboardEntry[]>;
  } catch {
    return [];
  }
}
