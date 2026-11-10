export type OrientationState = "unknown" | "checking" | "granted" | "denied" | "unsupported" | "no-data" | "cancelled";
export interface OrientationResult { state: OrientationState; beta?: number }

/**
 * beta（前後傾き）と gamma（左右傾き）から、縦持ち・横持ちを問わず
 * 「スマホ画面が地面（水平）に対して起き上がっている角度（0°〜180°）」を算出する
 * - 0°: 画面が真上向き水平（机に平置き・真上から覗き込み）
 * - 90°: 画面が地面に対して垂直（縦持ち・横持ち問わず正面に構えた状態）
 * - 130°超: 画面が下向き（仰向けでの寝スマホ状態）
 */
export function calculateScreenTiltAngle(
  beta: number,
  gamma: number | null | undefined
): number {
  const betaRad = (beta * Math.PI) / 180;
  const gammaDeg =
    typeof gamma === "number" && Number.isFinite(gamma) ? gamma : 0;
  const gammaRad = (gammaDeg * Math.PI) / 180;

  // 画面法線ベクトルの鉛直成分 cos(θ) = cos(beta) * cos(gamma)
  const cosTheta = Math.max(
    -1,
    Math.min(1, Math.cos(betaRad) * Math.cos(gammaRad))
  );
  const angleDeg = (Math.acos(cosTheta) * 180) / Math.PI;
  return Math.round(angleDeg);
}

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

export function isMobileDevice(): boolean {
  const userAgent = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  // iPadOS can identify itself as desktop macOS; touch is used only together
  // with that platform identity, never as a standalone mobile-device test.
  if (/iPad/i.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) return true;
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof hints?.mobile === "boolean") return hints.mobile;
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(userAgent) || /iPhone|iPod/i.test(platform);
}

export function supportsOrientationSetup(): boolean {
  // Viewport width and a touchscreen alone cannot identify a smartphone.
  // After classifying the device, confirm API support, then require real beta
  // samples in requestOrientationAccess before enabling detection.
  return window.isSecureContext && isMobileDevice() && !!window.DeviceOrientationEvent;
}

export async function requestOrientationAccess(signal: AbortSignal): Promise<OrientationResult> {
  if (signal.aborted) return { state: "cancelled" };
  if (!supportsOrientationSetup()) return { state: "unsupported" };
  const orientation = window.DeviceOrientationEvent as OrientationConstructor;
  try {
    // Keep this call before any await, directly in the click's activation chain.
    if (orientation.requestPermission && await orientation.requestPermission() !== "granted") {
      return { state: "denied" };
    }
  } catch {
    return { state: signal.aborted ? "cancelled" : "denied" };
  }
  if (signal.aborted) return { state: "cancelled" };
  return new Promise((resolve) => {
    const finish = (result: OrientationResult) => {
      clearTimeout(timer);
      window.removeEventListener("deviceorientation", sample);
      signal.removeEventListener("abort", cancel);
      resolve(result);
    };
    const sample = (event: DeviceOrientationEvent) => {
      if (typeof event.beta === "number" && Number.isFinite(event.beta)) {
        finish({
          state: "granted",
          beta: calculateScreenTiltAngle(event.beta, event.gamma),
        });
      }
    };
    const cancel = () => finish({ state: "cancelled" });
    const timer = setTimeout(() => finish({ state: "no-data" }), 5000);
    window.addEventListener("deviceorientation", sample);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
