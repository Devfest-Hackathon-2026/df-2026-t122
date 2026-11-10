const SETUP_KEY = "neck-app:initial-setup:v1";
export interface SetupChoices { cameraEnabled: boolean; tiltEnabled: boolean }

export function readSetupChoices(): SetupChoices | null {
  try {
    const data = JSON.parse(window.localStorage.getItem(SETUP_KEY) ?? "null");
    if (data?.completed === true && typeof data.cameraEnabled === "boolean" && typeof data.tiltEnabled === "boolean") {
      return { cameraEnabled: data.cameraEnabled, tiltEnabled: data.tiltEnabled };
    }
  } catch { /* Unavailable or malformed storage must not block the app. */ }
  return null;
}

export function saveSetupChoices(choices: SetupChoices): void {
  try {
    window.localStorage.setItem(SETUP_KEY, JSON.stringify({ completed: true, ...choices }));
  } catch { /* Current-tab state still allows completion when storage is blocked. */ }
}
