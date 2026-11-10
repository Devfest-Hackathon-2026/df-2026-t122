import { useEffect, useRef, useState, useCallback } from "react";

import type * as mpPose from "@mediapipe/pose";
import type * as mpFaceMesh from "@mediapipe/face_mesh";
import type * as mpCamera from "@mediapipe/camera_utils";
import poseScriptUrl from "@mediapipe/pose/pose.js?url";
import faceMeshScriptUrl from "@mediapipe/face_mesh/face_mesh.js?url";
import cameraScriptUrl from "@mediapipe/camera_utils/camera_utils.js?url";

import type { PoseDetectorProps } from "../../types/app";
import "./PoseDetector.css";
import { waitForCameraAccessProbe } from "./cameraAccess";
import { CameraMeasurement, type CameraMeasurementBatch } from "./cameraMeasurement";

const mediaPipeScripts = new Map<string, Promise<void>>();

// These legacy packages expose browser globals, not ESM exports. Keep their
// scripts as assets so production tree-shaking cannot remove their execution.
function loadMediaPipeScript(url: string): Promise<void> {
  const pending = mediaPipeScripts.get(url);
  if (pending) return pending;

  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => {
      mediaPipeScripts.delete(url);
      script.remove();
      reject(new Error(`Failed to load MediaPipe script: ${url}`));
    };
    document.head.appendChild(script);
  });
  mediaPipeScripts.set(url, loading);
  return loading;
}

interface PostureMetrics {
  /** 肩幅に対する鼻〜肩の高さ比率（正面時のうつむき・首の前傾で減少） */
  neckRatio: number;
  /** 耳と肩の水平ズレから算出した首の前傾角度（度・横〜斜め向きで有効） */
  forwardAngleDeg: number;
  /** 耳に対する鼻の下がり具合（うつむき角度の補助指標） */
  headDropRatio: number;
}

const DEFAULT_NECK_RATIO_THRESHOLD = 0.42;
const DEFAULT_FORWARD_ANGLE_THRESHOLD = 28;
const DEFAULT_HEAD_DROP_THRESHOLD = 0.12;

interface ExtendedPoseDetectorProps extends PoseDetectorProps {
  onDryEyeWarningChange?: (isDryEyeBad: boolean) => void;
  onMeasurementRecorded?: (batch: CameraMeasurementBatch) => Promise<void>;
}

/**
 * 📷 メディアパイプ（カメラ骨格推定 ＆ 自動まばたき検知）機能コンポーネント
 */
export function PoseDetector({ 
  onWarningChange, 
  onDryEyeWarningChange,
  onMeasurementRecorded,
  enabled = true,
}: ExtendedPoseDetectorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shutdownRef = useRef<Promise<void>>(Promise.resolve());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [metrics, setMetrics] = useState<PostureMetrics | null>(null);
  
  // 自動まばたき＆ドライアイ検知用のステート
  const [isDryEyeWarning, setIsDryEyeWarning] = useState(false);
  const [blinkCount, setBlinkCount] = useState<number>(0);

  const measurementRef = useRef<CameraMeasurement | null>(null);

  const [baselineRatio, setBaselineRatio] = useState<number>(
    DEFAULT_NECK_RATIO_THRESHOLD
  );
  const [baselineHeadDrop, setBaselineHeadDrop] = useState<number>(
    DEFAULT_HEAD_DROP_THRESHOLD
  );
  const [sensitivity, setSensitivity] = useState<number>(1.0);
  const [isCalibrated, setIsCalibrated] = useState(false);

  const baselineRatioRef = useRef(baselineRatio);
  const baselineHeadDropRef = useRef(baselineHeadDrop);
  const sensitivityRef = useRef(sensitivity);
  const latestMetricsRef = useRef<PostureMetrics | null>(null);
  const badFrameCountRef = useRef(0);
  const goodFrameCountRef = useRef(0);
  
  const currentWarningRef = useRef(false);
  const isPostureBadRef = useRef(false);
  const isDryEyeBadRef = useRef(false);
  const onWarningChangeRef = useRef(onWarningChange);
  const onDryEyeWarningChangeRef = useRef(onDryEyeWarningChange);
  const onMeasurementRecordedRef = useRef(onMeasurementRecorded);

  // 自動まばたき判定用のRef
  const lastBlinkTimeRef = useRef<number>(0);
  const lastFaceSeenTimeRef = useRef<number>(0);
  const isEyeClosedRef = useRef<boolean>(false);

  useEffect(() => {
    lastBlinkTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    baselineRatioRef.current = baselineRatio;
  }, [baselineRatio]);

  useEffect(() => {
    baselineHeadDropRef.current = baselineHeadDrop;
  }, [baselineHeadDrop]);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    onWarningChangeRef.current = onWarningChange;
  }, [onWarningChange]);

  useEffect(() => {
    onDryEyeWarningChangeRef.current = onDryEyeWarningChange;
  }, [onDryEyeWarningChange]);

  useEffect(() => {
    onMeasurementRecordedRef.current = onMeasurementRecorded;
  }, [onMeasurementRecorded]);

  // Time is accumulated by face results, not this timer. Batch writes once per
  // minute, and flush completed slots on hide/OFF. Retry failed batches unchanged.
  useEffect(() => {
    if (!enabled) return;
    const measurement = new CameraMeasurement();
    measurementRef.current = measurement;
    const pending: CameraMeasurementBatch[] = [];
    let saving = false;
    const flush = async () => {
      const batch = measurement.take();
      if (batch.slots.length) pending.push(batch);
      if (saving) return;
      saving = true;
      try {
        while (pending.length) {
          await onMeasurementRecordedRef.current?.(pending[0]);
          pending.shift();
        }
      } catch (err: unknown) {
        console.error("Camera measurement save failed:", err);
      } finally {
        saving = false;
      }
    };
    const onVisibilityChange = () => {
      measurement.pause();
      isEyeClosedRef.current = false;
      if (document.visibilityState !== "visible") void flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = setInterval(() => { void flush(); }, 60000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      measurement.pause();
      if (measurementRef.current === measurement) measurementRef.current = null;
      void flush();
    };
  }, [enabled]);

  // 姿勢警告とドライアイ警告をそれぞれ独立して親に伝えるヘルパー
  const updateOverallWarning = useCallback((postureBad: boolean, dryEyeBad: boolean) => {
    if (postureBad !== currentWarningRef.current) {
      currentWarningRef.current = postureBad;
      onWarningChangeRef.current(postureBad);
    }
    if (onDryEyeWarningChangeRef.current) {
      onDryEyeWarningChangeRef.current(dryEyeBad);
    }
  }, []);

  const calibratePosture = useCallback(() => {
    const current = latestMetricsRef.current;
    if (!current) return;
    setBaselineRatio(Number((current.neckRatio * 0.82).toFixed(2)));
    setBaselineHeadDrop(Number((current.headDropRatio + 0.08).toFixed(2)));
    setIsCalibrated(true);
    badFrameCountRef.current = 0;
    
    isPostureBadRef.current = false;
    updateOverallWarning(false, isDryEyeBadRef.current);
  }, [updateOverallWarning]);

  // 10秒間まばたきがない場合にドライアイ警告をONにするタイマー（カメラONかつ顔認識中のみ稼働）
  useEffect(() => {
    if (!enabled) return;
    lastBlinkTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      // 直近3秒以内に顔が検出されている場合のみドライアイ秒数をカウント（未検出時の誤警告を防止）
      const isFaceRecentlySeen =
        lastFaceSeenTimeRef.current > 0 &&
        now - lastFaceSeenTimeRef.current < 3000;

      if (!isFaceRecentlySeen) {
        lastBlinkTimeRef.current = now;
        if (isDryEyeBadRef.current) {
          setIsDryEyeWarning(false);
          isDryEyeBadRef.current = false;
          updateOverallWarning(isPostureBadRef.current, false);
        }
        return;
      }

      const dryEyeNeeded = now - lastBlinkTimeRef.current > 10000;
      setIsDryEyeWarning(dryEyeNeeded);
      isDryEyeBadRef.current = dryEyeNeeded;
      updateOverallWarning(isPostureBadRef.current, dryEyeNeeded);
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, updateOverallWarning]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // カメラ機能がOFFのときは、カメラ・ストリーム・警告状態をすべて停止・リセットして省電力化
    if (!enabled) {
      const stream = videoElement.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        videoElement.srcObject = null;
      }
      const canvas = canvasRef.current;
      const ctx = canvas ? canvas.getContext("2d") : null;
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      isPostureBadRef.current = false;
      isDryEyeBadRef.current = false;
      badFrameCountRef.current = 0;
      goodFrameCountRef.current = 0;
      updateOverallWarning(false, false);
      return;
    }

    let isMounted = true;
    let cameraReady = false;
    const pauseMeasurement = () => {
      measurementRef.current?.pause();
      isEyeClosedRef.current = false;
    };
    const videoStopEvents = ["pause", "ended", "waiting", "emptied"];
    videoStopEvents.forEach((event) => videoElement.addEventListener(event, pauseMeasurement));
    let cameraTracks: MediaStreamTrack[] = [];
    lastBlinkTimeRef.current = Date.now();

    let pose: mpPose.Pose | undefined;
    let faceMesh: mpFaceMesh.FaceMesh | undefined;
    let camera: mpCamera.Camera | undefined;
    let frameTask: Promise<void> = Promise.resolve();
    const previousShutdown = shutdownRef.current;

    const initialize = async () => {
      await previousShutdown;
      await waitForCameraAccessProbe();
      if (!isMounted) return;
      await Promise.all([
        loadMediaPipeScript(poseScriptUrl),
        loadMediaPipeScript(faceMeshScriptUrl),
        loadMediaPipeScript(cameraScriptUrl),
      ]);
      if (!isMounted) return;

      const {
        Pose: PoseConstructor,
        FaceMesh: FaceMeshConstructor,
        Camera: CameraConstructor,
      } = window as unknown as {
        Pose: typeof mpPose.Pose;
        FaceMesh: typeof mpFaceMesh.FaceMesh;
        Camera: typeof mpCamera.Camera;
      };
      if ([PoseConstructor, FaceMeshConstructor, CameraConstructor].some(
        (constructor) => typeof constructor !== "function"
      )) {
        throw new Error("MediaPipe constructors are unavailable");
      }

      const activePose = pose = new PoseConstructor({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      activePose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      const activeFaceMesh = faceMesh = new FaceMeshConstructor({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      activeFaceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      activeFaceMesh.onResults((results: mpFaceMesh.Results) => {
        if (!isMounted) return;
        const now = Date.now();
        const stream = videoElement.srcObject as MediaStream | null;
        const valid = cameraReady && document.visibilityState === "visible" &&
          !videoElement.paused && !videoElement.ended && videoElement.readyState >= 2 &&
          !!stream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled && !track.muted) &&
          !!results.multiFaceLandmarks?.length;
        const continuous = measurementRef.current?.frame(now, valid) ?? false;
        if (!continuous) isEyeClosedRef.current = false;
        if (!valid || !results.multiFaceLandmarks?.length) return;

        const landmarks = results.multiFaceLandmarks[0];
        lastFaceSeenTimeRef.current = Date.now();
        const upperEyelid = landmarks[159];
        const lowerEyelid = landmarks[145];
        const eyeLeft = landmarks[33];
        const eyeRight = landmarks[133];

        if (upperEyelid && lowerEyelid && eyeLeft && eyeRight) {
          const eyeHeight = Math.hypot(upperEyelid.x - lowerEyelid.x, upperEyelid.y - lowerEyelid.y);
          const eyeWidth = Math.hypot(eyeLeft.x - eyeRight.x, eyeLeft.y - eyeRight.y);
          const ear = eyeHeight / eyeWidth;

          const BLINK_THRESHOLD = 0.18;

          if (ear < BLINK_THRESHOLD) {
            if (!isEyeClosedRef.current) {
              isEyeClosedRef.current = true;
            }
          } else {
            if (isEyeClosedRef.current) {
              isEyeClosedRef.current = false;
              lastBlinkTimeRef.current = Date.now();
              setBlinkCount((prev) => prev + 1);
            
              measurementRef.current?.blink(now);

              setIsDryEyeWarning(false);
              isDryEyeBadRef.current = false;
              updateOverallWarning(isPostureBadRef.current, false);
            }
          }
        }
      });

      activePose.onResults((results: mpPose.Results) => {
        if (!isMounted) return;

        const canvas = canvasRef.current;
        const ctx = canvas ? canvas.getContext("2d") : null;
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (!results.poseLandmarks) return;

        const landmarks = results.poseLandmarks;
        const nose = landmarks[0];
        const leftEar = landmarks[7];
        const rightEar = landmarks[8];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];

        if (!nose || !leftEar || !rightEar || !leftShoulder || !rightShoulder) {
          return;
        }

        const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
        const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
        const earMidX = (leftEar.x + rightEar.x) / 2;
        const earMidY = (leftEar.y + rightEar.y) / 2;

        const shoulderWidth = Math.max(
          Math.hypot(
            leftShoulder.x - rightShoulder.x,
            leftShoulder.y - rightShoulder.y
          ),
          0.12
        );

        const neckRatio = (shoulderMidY - nose.y) / shoulderWidth;
        const headDropRatio = (nose.y - earMidY) / shoulderWidth;

        const dy = Math.max(shoulderMidY - earMidY, 0.01);
        const dx = Math.abs(earMidX - shoulderMidX);
        const forwardAngleDeg = Math.atan2(dx, dy) * (180 / Math.PI);

        const currentMetrics: PostureMetrics = {
          neckRatio: Number(neckRatio.toFixed(2)),
          forwardAngleDeg: Math.round(forwardAngleDeg),
          headDropRatio: Number(headDropRatio.toFixed(2)),
        };

        latestMetricsRef.current = currentMetrics;
        setMetrics(currentMetrics);

        const sens = sensitivityRef.current;
        const effectiveNeckThreshold = baselineRatioRef.current * sens;
        const effectiveHeadDropThreshold = baselineHeadDropRef.current / sens;

        const isNeckCompressed = neckRatio < effectiveNeckThreshold;
        const isHeadDropped = headDropRatio > effectiveHeadDropThreshold;
        const isForwardTilted =
          forwardAngleDeg > DEFAULT_FORWARD_ANGLE_THRESHOLD / sens &&
          shoulderWidth < 0.25;

        const isBadPosture =
          isNeckCompressed || isHeadDropped || isForwardTilted;

        if (canvas && ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const mainColor = isBadPosture ? "#ff4d4f" : "#10b981";

          ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(leftShoulder.x * w, leftShoulder.y * h);
          ctx.lineTo(rightShoulder.x * w, rightShoulder.y * h);
          ctx.stroke();

          ctx.strokeStyle = mainColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(shoulderMidX * w, shoulderMidY * h);
          ctx.lineTo(nose.x * w, nose.y * h);
          ctx.stroke();

          const points = [leftShoulder, rightShoulder, leftEar, rightEar, nose];
          ctx.fillStyle = mainColor;
          for (const pt of points) {
            ctx.beginPath();
            ctx.arc(pt.x * w, pt.y * h, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        const TRIGGER_FRAMES = 12;
        const RECOVER_FRAMES = 6;

        if (isBadPosture) {
          badFrameCountRef.current += 1;
          goodFrameCountRef.current = 0;
          if (badFrameCountRef.current >= TRIGGER_FRAMES) {
            isPostureBadRef.current = true;
            updateOverallWarning(true, isDryEyeBadRef.current);
          }
        } else {
          goodFrameCountRef.current += 1;
          badFrameCountRef.current = Math.max(0, badFrameCountRef.current - 1);
          if (goodFrameCountRef.current >= RECOVER_FRAMES) {
            isPostureBadRef.current = false;
            updateOverallWarning(false, isDryEyeBadRef.current);
          }
        }
      });

      camera = new CameraConstructor(videoElement, {
        onFrame: () => {
          frameTask = (async () => {
            if (!isMounted) return;
            if (document.visibilityState !== "visible") {
              measurementRef.current?.pause();
              return;
            }
            await activePose.send({ image: videoElement });
            if (isMounted) await activeFaceMesh.send({ image: videoElement });
          })().catch((err: unknown) => {
            if (isMounted) {
              measurementRef.current?.pause();
              isEyeClosedRef.current = false;
              console.error("MediaPipe frame failed:", err);
              setCameraError("姿勢・まばたき検知を開始できませんでした。");
            }
          });
          return frameTask;
        },
        width: 320,
        height: 240,
        facingMode: "user",
      });

      await camera.start();
      if (isMounted) {
        cameraReady = true;
        cameraTracks = (videoElement.srcObject as MediaStream | null)?.getVideoTracks() ?? [];
        cameraTracks.forEach((track) => {
          track.addEventListener("mute", pauseMeasurement);
          track.addEventListener("ended", pauseMeasurement);
        });
        setIsCameraActive(true);
        setCameraError(null);
      }
    };

    const startup = initialize().catch((err: unknown) => {
      if (isMounted) {
        measurementRef.current?.pause();
        console.error("Camera / MediaPipe initialization failed:", err);
        setCameraError(
          "カメラ・姿勢検知を開始できません。カメラの許可とネットワーク接続を確認してください。"
        );
      }
    });

    return () => {
      isMounted = false;
      cameraReady = false;
      videoStopEvents.forEach((event) => videoElement.removeEventListener(event, pauseMeasurement));
      cameraTracks.forEach((track) => {
        track.removeEventListener("mute", pauseMeasurement);
        track.removeEventListener("ended", pauseMeasurement);
      });
      setIsCameraActive(false);
      // Wait for a pending camera permission request and frame before disposing.
      // The next effect waits for this shutdown, including in StrictMode.
      shutdownRef.current = startup.then(async () => {
        await camera?.stop();
        const stream = videoElement.srcObject as MediaStream | null;
        stream?.getTracks().forEach((track) => track.stop());
        videoElement.srcObject = null;
        videoElement.onloadedmetadata = null;
        await frameTask;
        await pose?.close();
        await faceMesh?.close();
      }).catch((err: unknown) => {
        console.error("MediaPipe cleanup failed:", err);
      });
    };
  }, [enabled, updateOverallWarning]);

  const effectiveRatioDisplay = (baselineRatio * sensitivity).toFixed(2);
  const effectiveDropDisplay = (baselineHeadDrop / sensitivity).toFixed(2);
  const activeMetrics = enabled ? metrics : null;
  const activeDryEyeWarning = enabled && isDryEyeWarning;

  return (
    <div className="pose-detector-panel">
      <div className="pose-detector-header">
        <span
          className="status-dot"
          data-active={enabled && isCameraActive}
        />
        <span className="pose-detector-title">
          {!enabled
            ? "📷 カメラ停止中 (省電力・OFF)"
            : cameraError
              ? "📷 カメラ未接続"
              : isCameraActive
                ? "📷 姿勢・自動まばたき検知中"
                : "📷 カメラ起動中..."}
        </span>
        <button
          type="button"
          className="preview-toggle-btn"
          onClick={() => setShowPreview((prev) => !prev)}
        >
          {showPreview ? "最小化" : "詳細"}
        </button>
      </div>

      <div className={`camera-stage ${showPreview ? "visible" : "hidden"}`}>
        <video
          ref={videoRef}
          className="camera-preview"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          width={320}
          height={240}
          className="camera-overlay"
        />
      </div>

      {showPreview && (
        <div className="pose-detector-body">
          {cameraError && enabled ? (
            <p className="camera-error-text">{cameraError}</p>
          ) : (
            <>
              <div className="metrics-row">
                <span>首の高さ比:</span>
                <strong>
                  {activeMetrics ? activeMetrics.neckRatio : "--"}{" "}
                  <small>(基準: {effectiveRatioDisplay})</small>
                </strong>
              </div>
              <div className="metrics-row">
                <span>うつむき度:</span>
                <strong>
                  {activeMetrics ? activeMetrics.headDropRatio : "--"}{" "}
                  <small>(上限: {effectiveDropDisplay})</small>
                </strong>
              </div>

              <div 
                className="metrics-row" 
                style={{
                  color: !enabled
                    ? "#94a3b8"
                    : activeDryEyeWarning
                      ? "#ff4d4f"
                      : "#10b981",
                }}
              >
                <span>まばたき状態:</span>
                <strong>
                  {!enabled
                    ? `⏸ 停止中 (累計${blinkCount}回)`
                    : activeDryEyeWarning 
                      ? "⚠️ 目が乾いています！" 
                      : `✨ 潤いキープ中 (累計${blinkCount}回)`}
                </strong>
              </div>

              <label className="sensitivity-row">
                <span>検知感度:</span>
                <input
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                />
              </label>

              <button
                type="button"
                className="calibrate-btn"
                onClick={calibratePosture}
                disabled={!activeMetrics}
              >
                {isCalibrated
                  ? "✓ 今の姿勢で再基準化"
                  : "今の良い姿勢を基準にする"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
