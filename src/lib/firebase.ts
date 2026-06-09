import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export interface LeaderboardEntry {
  id?: string;
  playerName: string;
  email?: string;
  score: number;
  createdAt: number;
}

export async function submitScore(playerName: string, score: number, email = ''): Promise<string | undefined> {
  try {
    const docRef = await addDoc(collection(db, 'leaderboard'), {
      playerName,
      email,
      score,
      createdAt: Date.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Firestore submitScore error:', error);
    throw error;
  }
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
  } catch (error) {
    console.error('Firestore getLeaderboard error:', error);
    return [];
  }
}
