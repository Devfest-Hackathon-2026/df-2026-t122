import { useSyncExternalStore } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig";

export interface AuthSession {
  uid: string | null;
  generation: number;
}

let session: AuthSession = { uid: null, generation: 0 };
const listeners = new Set<() => void>();

// A generation also distinguishes A → logout → A from the original A session.
onAuthStateChanged(auth, (user) => {
  const uid = user?.uid ?? null;
  if (session.generation > 0 && uid === session.uid) return;
  session = { uid, generation: session.generation + 1 };
  listeners.forEach((notify) => notify());
});

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

export function isCurrentAuthSession(candidate: AuthSession): boolean {
  return candidate === session && candidate.uid === (auth.currentUser?.uid ?? null);
}

export function useAuthSession(): AuthSession {
  return useSyncExternalStore(subscribe, () => session);
}
