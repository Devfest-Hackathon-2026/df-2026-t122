import { useEffect, useRef, useState } from "react";
import type { TiltDetectorProps } from "../../types/app";
import "./TiltDetector.css";
import {
  calculateScreenTiltAngle,
  requestOrientationAccess,
  supportsOrientationSetup,
  type OrientationState,
} from "./orientationAccess";

// スマホの前後傾き（beta角度：90度が垂直、0度が水平上向き）
// この角度未満（画面が水平に近すぎる＝下を向いて覗き込んでいる状態）で警告
const DEFAULT_MIN_TILT_ANGLE = 40;

/**
 * 📱 スマホの傾き検知（ジャイロ・加速度センサー）機能コンポーネント
 * この機能の開発者は src/features/tilt/ 内のファイルのみを編集することでコンフリクトを防げます。
 */
export function TiltDetector({
  onWarningChange,
  enabled = true,
}: TiltDetectorProps) {
  const permissionRequest = useRef<AbortController | null>(null);
  const [permissionState, setPermissionState] = useState<OrientationState>("unknown");
  useEffect(() => () => permissionRequest.current?.abort(), []);
  const [betaAngle, setBetaAngle] = useState<number>(75); // 初期値75度（正常な持ち方）
  const [hasSensorData, setHasSensorData] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (!enabled) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.beta === "number" && Number.isFinite(event.beta)) {
        setHasSensorData(true);
        const tiltAngle = calculateScreenTiltAngle(event.beta, event.gamma);
        setBetaAngle(tiltAngle);
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [enabled]);

  // 角度がしきい値より浅い（下向き覗き込み）または130度超（寝スマホ）の場合に警告
  useEffect(() => {
    if (!enabled) {
      onWarningChange(false);
      return;
    }
    const isBadTilt = betaAngle < DEFAULT_MIN_TILT_ANGLE || betaAngle > 130;
    onWarningChange(isBadTilt);
  }, [betaAngle, enabled, onWarningChange]);

  // The same user-gesture permission + real-data check is used by setup.
  const requestSensorPermission = async () => {
    permissionRequest.current?.abort();
    const controller = new AbortController();
    permissionRequest.current = controller;
    const pending = requestOrientationAccess(controller.signal);
    setPermissionState("checking");
    const result = await pending;
    if (controller.signal.aborted) return;
    setPermissionState(result.state);
    if (result.state === "granted" && result.beta !== undefined) {
      setBetaAngle(Math.round(result.beta));
      setHasSensorData(true);
    }
  };

  const isBadTilt = betaAngle < DEFAULT_MIN_TILT_ANGLE || betaAngle > 130;

  return (
    <div className="tilt-detector-panel">
      <div className="tilt-detector-header">
        <span
          className="tilt-status-dot"
          data-warning={isBadTilt}
        />
        <span className="tilt-detector-title">
          {!enabled
            ? "📱 傾き検知停止中 (OFF)"
            : `📱 端末角度: ${betaAngle}°`}
        </span>
        <button
          type="button"
          className="tilt-toggle-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? "閉じる" : "調整"}
        </button>
      </div>

      {isExpanded && (
        <div className="tilt-detector-body">
          <p className="tilt-hint">
            {hasSensorData
              ? "ジャイロセンサー連動中"
              : "PC開発用：スライダーでスマホ角度をシミュレートできます"}
          </p>

          <label className="tilt-slider-row">
            <span>角度({betaAngle}°):</span>
            <input
              type="range"
              min={0}
              max={150}
              value={betaAngle}
              onChange={(e) => setBetaAngle(Number(e.target.value))}
            />
          </label>

          <small className="tilt-threshold-note">
            ※ {DEFAULT_MIN_TILT_ANGLE}°未満（覗き込み）または130°超（寝スマホ）で警告
          </small>

          {supportsOrientationSetup() && <>
            <button type="button" className="tilt-permission-btn" onClick={() => { void requestSensorPermission(); }} disabled={permissionState === "checking"}>
              {permissionState === "checking" ? "センサー値を確認中…" : "傾きセンサーの許可・動作を確認"}
            </button>
            {permissionState !== "unknown" && <p className="tilt-hint" role="status">
              {permissionState === "granted" ? "許可・データ取得済み（検知のON/OFFは上の設定で切り替え）"
                : permissionState === "denied" ? "センサーの利用が拒否・ブロックされています。"
                : permissionState === "no-data" ? "有効なセンサー値を取得できませんでした。端末を動かして再確認してください。"
                : permissionState === "unsupported" ? "この端末はセンサー確認に非対応です。"
                : permissionState === "checking" ? "スマートフォンを少し傾けてください。" : "未確認"}
            </p>}
          </>}
        </div>
      )}
    </div>
  );
}
