const WELCOME_SEEN_KEY = "neck-app:welcome-seen:v1";

export function hasSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
  } catch {
    // Storage may be disabled; starting the app must still work.
  }
}
