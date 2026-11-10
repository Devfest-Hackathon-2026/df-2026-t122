export type CameraAccessState = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
let pendingProbe: Promise<CameraAccessState> | null = null;

export function canRequestCamera(): boolean {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

export async function observeCameraPermission(
  onChange: (state: CameraAccessState) => void,
): Promise<() => void> {
  if (!canRequestCamera()) {
    onChange("unavailable");
    return () => {};
  }
  try {
    const permission = await navigator.permissions.query({ name: "camera" as PermissionName });
    const changed = () => onChange(permission.state);
    changed();
    permission.addEventListener("change", changed);
    return () => permission.removeEventListener("change", changed);
  } catch {
    // Safari may allow the camera but not implement this Permissions query.
    onChange("unknown");
    return () => {};
  }
}

export function requestCameraAccess(): Promise<CameraAccessState> {
  if (pendingProbe) return pendingProbe;
  pendingProbe = (async (): Promise<CameraAccessState> => {
    if (!canRequestCamera()) return "unavailable";
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      return stream.getVideoTracks().some((track) => track.readyState === "live")
        ? "granted" : "unavailable";
    } catch (error: unknown) {
      const name = error && typeof error === "object" && "name" in error ? error.name : "";
      return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable";
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  })().finally(() => { pendingProbe = null; });
  return pendingProbe;
}

// A skipped setup may leave the browser's prompt pending. Even a late stream
// must be stopped before MediaPipe may start its own camera stream.
export async function waitForCameraAccessProbe(): Promise<void> {
  await pendingProbe;
}
