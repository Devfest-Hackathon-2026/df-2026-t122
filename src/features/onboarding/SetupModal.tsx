import { useEffect, useRef, useState } from "react";
import { auth } from "../firebase/firebaseConfig";
import { useAuthSession } from "../firebase/authSession";
import { signInWithGoogleAccount } from "../auth/googleSignIn";
import { canRequestCamera, observeCameraPermission, requestCameraAccess, type CameraAccessState } from "../pose/cameraAccess";
import { requestOrientationAccess, supportsOrientationSetup, isMobileDevice, type OrientationResult } from "../tilt/orientationAccess";
import type { SetupChoices } from "./setupStorage";
import "./WelcomeModal.css";
import "./SetupModal.css";

const CAMERA_LABELS: Record<CameraAccessState, string> = {
  unknown: "権限未確認", prompt: "未許可", granted: "権限許可済み",
  denied: "拒否・ブロック", unavailable: "利用不可",
};
const ORIENTATION_LABELS = {
  unknown: "未確認", checking: "センサー値を確認中", granted: "許可・データ取得済み",
  denied: "拒否・ブロック", unsupported: "非対応", "no-data": "センサー値を取得できません", cancelled: "未確認",
};

export function SetupModal({ onComplete }: { onComplete: (choices: SetupChoices) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const alive = useRef(false);
  const cameraBusy = useRef(false);
  const loginBusy = useRef(false);
  const orientationRequest = useRef<AbortController | null>(null);
  const session = useAuthSession();
  const [login, setLogin] = useState({ busy: false, error: "" });
  const [camera, setCamera] = useState({
    state: (canRequestCamera() ? "unknown" : "unavailable") as CameraAccessState,
    busy: false, verified: false, wanted: false,
  });
  const [mobileDevice] = useState(isMobileDevice);
  const [hasOrientation] = useState(supportsOrientationSetup);
  const [orientation, setOrientation] = useState<OrientationResult>({ state: "unknown" });
  const [tiltWanted, setTiltWanted] = useState(false);

  useEffect(() => {
    alive.current = true;
    let active = true;
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog?.showModal();
    let unsubscribe = () => {};
    void observeCameraPermission((state) => {
      if (active) setCamera((current) => ({
        ...current, state,
        wanted: state === "granted" && current.wanted,
        verified: state === "granted" && current.verified,
      }));
    }).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    });
    return () => {
      active = false;
      alive.current = false;
      unsubscribe();
      orientationRequest.current?.abort();
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const loginWithGoogle = async () => {
    if (loginBusy.current) return;
    loginBusy.current = true;
    setLogin({ busy: true, error: "" });
    try {
      await signInWithGoogleAccount();
      if (alive.current) setLogin({ busy: false, error: "" });
    } catch {
      if (alive.current) setLogin({ busy: false, error: "ログインできませんでした。再試行するか、スキップできます。" });
    } finally {
      loginBusy.current = false;
    }
  };

  const checkCamera = async () => {
    if (cameraBusy.current) return;
    cameraBusy.current = true;
    setCamera((current) => ({ ...current, busy: true }));
    const state = await requestCameraAccess();
    cameraBusy.current = false;
    if (alive.current) setCamera({ state, busy: false, verified: state === "granted", wanted: state === "granted" });
  };

  const checkOrientation = async () => {
    orientationRequest.current?.abort();
    const controller = new AbortController();
    orientationRequest.current = controller;
    // Call within the click handler: iOS requires transient user activation.
    const result = requestOrientationAccess(controller.signal);
    setOrientation({ state: "checking" });
    setTiltWanted(false);
    const confirmed = await result;
    if (alive.current && !controller.signal.aborted) {
      setOrientation(confirmed);
      setTiltWanted(confirmed.state === "granted");
    }
  };

  const skip = () => onComplete({ cameraEnabled: false, tiltEnabled: false });
  return (
    <dialog ref={dialogRef} className="welcome-modal setup-modal" aria-labelledby="setup-title" aria-describedby="setup-description"
      onCancel={(event) => { event.preventDefault(); skip(); }}>
      <div className="welcome-content">
        <div className="welcome-brand"><span className="setup-brand-dot" aria-hidden="true">✓</span>neck-app <span className="welcome-eyebrow">初回セットアップ</span></div>
        <div className="setup-intro">
          <p className="welcome-kicker">自分に合った使い方で、はじめよう。</p>
          <h1 id="setup-title">使いたい機能を選ぼう。</h1>
          <p id="setup-description">すべて任意です。あとから「設定」で変更できます。</p>
        </div>
        <div className="setup-cards">
          <section className="setup-card" aria-labelledby="setup-account-title">
            <div className="setup-card-heading"><h2 id="setup-account-title">👤 Googleアカウントでログイン（任意）</h2><span className="setup-state" data-ready={!!session.uid} role="status">{session.uid ? "連携済み" : login.busy ? "ログイン中" : "未連携"}</span></div>
            <p>姿勢・瞬きの記録を自分のアカウントに保存します。</p>
            <p className="setup-detail">アプリの記録用ログインです。YouTube OAuth連携とは別の操作です。</p>
            {session.uid ? <p className="setup-account">{auth.currentUser?.displayName || "Googleアカウント"}でログイン済み</p>
              : <button type="button" className="setup-check" onClick={() => { void loginWithGoogle(); }} disabled={login.busy}>Googleでログイン</button>}
            {login.error && <p className="setup-error" role="alert">{login.error}</p>}
          </section>
          <section className="setup-card" aria-labelledby="setup-youtube-title">
            <div className="setup-card-heading"><h2 id="setup-youtube-title">▶️ YouTubeアカウント連携（任意）</h2><span className="setup-state">テスト提供中</span></div>
            <p>現在テスト提供中。対応アカウントのみ連携可能</p>
            <p className="setup-detail">未連携でも動画検索・視聴・姿勢検知をご利用いただけます。</p>
            <p className="setup-detail">対応アカウントの方は、視聴画面の「登録チャンネル」から連携できます。初回セットアップでの連携は不要です。</p>
          </section>
          <section className="setup-card" aria-labelledby="setup-camera-title">
            <div className="setup-card-heading"><h2 id="setup-camera-title">📷 カメラの利用許可</h2><span className="setup-state" data-ready={camera.state === "granted"} role="status">{camera.busy ? "カメラを確認中" : CAMERA_LABELS[camera.state]}</span></div>
            <p>姿勢と瞬きを検知します。確認用カメラはすぐに停止します。</p>
            <button type="button" className="setup-check" onClick={() => { void checkCamera(); }} disabled={camera.busy || !canRequestCamera()}>
              {camera.busy ? "確認中…" : camera.state === "granted" ? "カメラの利用を確認する" : "カメラの利用を許可する"}
            </button>
            <label className="setup-toggle"><input type="checkbox" checked={camera.wanted} disabled={!camera.verified || camera.state !== "granted"} onChange={(event) => setCamera((current) => ({ ...current, wanted: event.target.checked }))} />開始後にカメラ検知をONにする</label>
            {camera.state === "denied" && <p className="setup-error">ブラウザ・端末の設定でカメラを許可すると再確認できます。</p>}
            {camera.state === "unavailable" && <p className="setup-error">カメラの接続・他のアプリでの使用状況・HTTPS接続を確認してください。</p>}
          </section>
          {hasOrientation ? <section className="setup-card" aria-labelledby="setup-tilt-title">
            <div className="setup-card-heading"><h2 id="setup-tilt-title">📱 スマートフォンの傾きセンサー</h2><span className="setup-state" data-ready={orientation.state === "granted"} role="status">{ORIENTATION_LABELS[orientation.state]}</span></div>
            <p>スマートフォンを少し傾けて、角度を取得できるか確認します。</p>
            <button type="button" className="setup-check" onClick={() => { void checkOrientation(); }} disabled={orientation.state === "checking"}>傾きセンサーを確認する</button>
            {orientation.state === "granted" && <p className="setup-detail">現在の角度：{Math.round(orientation.beta ?? 0)}°</p>}
            <label className="setup-toggle"><input type="checkbox" checked={tiltWanted} disabled={orientation.state !== "granted"} onChange={(event) => setTiltWanted(event.target.checked)} />開始後に傾き検知をONにする</label>
            {orientation.state === "denied" && <p className="setup-error">ブラウザ・端末のセンサー設定を確認してください。スキップして続けられます。</p>}
            {orientation.state === "no-data" && <p className="setup-error">有効な角度を受信できませんでした。端末を動かして再確認するか、スキップできます。</p>}
          </section> : mobileDevice && <p className="setup-unsupported">📱 傾きセンサー：この端末・ブラウザは非対応です。スキップして続けられます。</p>}
        </div>
        <div className="welcome-actions setup-actions">
          <p className="setup-detail">ブラウザの権限と、検知機能のON/OFFは別の設定です。</p>
          <button type="button" className="welcome-start" onClick={() => onComplete({ cameraEnabled: camera.wanted && camera.verified && camera.state === "granted", tiltEnabled: tiltWanted && orientation.state === "granted" })}>セットアップを完了して始める <span aria-hidden="true">→</span></button>
          <button type="button" className="setup-skip" onClick={skip}>今はスキップする</button>
          <p>スキップすると検知はOFFで開始します。ログイン状態と許可済みの権限は維持されます。</p>
        </div>
      </div>
    </dialog>
  );
}
