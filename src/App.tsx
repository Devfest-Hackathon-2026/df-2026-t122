import { useState } from "react";
import "./App.css";
import { HeaderControls } from "./features/header/HeaderControls";
import { WarningBanner } from "./features/warning/WarningBanner";
import { VideoPlayer } from "./features/player/VideoPlayer";
import { RewardStatus } from "./features/reward/RewardStatus";
import { PoseDetector } from "./features/pose/PoseDetector";
import { TiltDetector } from "./features/tilt/TiltDetector";
import { useAuthSession, isCurrentAuthSession } from "./features/firebase/authSession";
import { saveCameraMeasurement } from "./features/firebase/postureRecordService";
import { RecordDashboard } from "./components/RecordDashboard";
import { SettingsModal } from "./features/settings/SettingsModal";
import { SetupModal } from "./features/onboarding/SetupModal";
import { readSetupChoices, saveSetupChoices, type SetupChoices } from "./features/onboarding/setupStorage";
import { WelcomeModal } from "./features/onboarding/WelcomeModal";
import { hasSeenWelcome, markWelcomeSeen } from "./features/onboarding/welcomeStorage";

/**
 * 各機能モジュール（src/features/*）を結合するルートコンポーネント。
 * 個別の機能開発やデザイン調整は src/features/ 以下の各フォルダ内で行ってください。
 */
function App() {
  const session = useAuthSession();
  const [welcome, setWelcome] = useState(() => {
    const choices = readSetupChoices();
    return { screen: choices ? "app" : hasSeenWelcome() ? "setup" : "welcome", hasEntered: !!choices, choices };
  });
  const completeWelcome = () => {
    markWelcomeSeen();
    setWelcome((previous) => ({ ...previous, screen: previous.hasEntered ? "app" : "setup" }));
  };
  const completeSetup = (choices: SetupChoices) => {
    markWelcomeSeen();
    saveSetupChoices(choices);
    setEnableCamera(choices.cameraEnabled);
    setEnableTilt(choices.tiltEnabled);
    setWelcome({ screen: "app", hasEntered: true, choices });
  };
  const toggleCamera = () => {
    const next = !enableCamera;
    setEnableCamera(next);
    saveSetupChoices({ cameraEnabled: next, tiltEnabled: enableTilt });
  };
  const toggleTilt = () => {
    const next = !enableTilt;
    setEnableTilt(next);
    saveSetupChoices({ cameraEnabled: enableCamera, tiltEnabled: next });
  };
  // 初期状態では動画は未選択（起動直後は再生しない）
  const [videoId, setVideoId] = useState<string | null>(null);
  // ヘッダー検索バーと動画リストで共有する検索クエリ
  const [searchQuery, setSearchQuery] = useState("");

  // 設定画面の開閉状態と、どのセンサーで判定するか（両方選択可能）
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Stored feature choices are not a claim about current browser permissions.
  const [enableCamera, setEnableCamera] = useState(welcome.choices?.cameraEnabled ?? false);
  const [enableTilt, setEnableTilt] = useState(welcome.choices?.tiltEnabled ?? false);
  // 動画の全画面モード状態（全画面中や動画再生中は邪魔なポップアップバナーを抑止）
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);

  const [poseStatus, setPoseStatus] = useState({ session, posture: false, dryEye: false });
  const isPoseWarning = poseStatus.session === session && poseStatus.posture;
  const isDryEyeWarning = poseStatus.session === session && poseStatus.dryEye;
  const [isTiltWarning, setIsTiltWarning] = useState(false);
  const [points, setPoints] = useState({ session, value: 0 });
  const rewardPoints = points.session === session ? points.value : 0;

  // 設定画面でONになっているセンサーの警告のみを有効化する
  const activePoseWarning = enableCamera && isPoseWarning;
  const activeDryEyeWarning = enableCamera && isDryEyeWarning;
  const activeTiltWarning = enableTilt && isTiltWarning;

  // 姿勢・スマホ首の警告（継続時間リセットやDB保存のトリガー）
  const isPostureOrTiltWarning = activePoseWarning || activeTiltWarning;
  // トーストバナー表示用の全体警告（姿勢＋傾き＋ドライアイ）
  const isBannerWarning = isPostureOrTiltWarning || activeDryEyeWarning;
  // いずれかのセンサーが有効か
  const isSensorEnabled = welcome.hasEntered && (enableCamera || enableTilt);

  return (
    <div className="app-container">
      {/* ⚠️ 警告バナー（全画面視聴中は邪魔にならないよう非表示にし、映像の減光＋右上小アイコンで通知） */}
      <WarningBanner
        isWarning={!isVideoFullscreen && isBannerWarning}
        isPoseWarning={activePoseWarning}
        isTiltWarning={activeTiltWarning}
        isManualWarning={false}
        isDryEyeWarning={activeDryEyeWarning}
      />

      {/* 🧭 上部操作バー・左側にGoogleアイコン、右側にYouTube検索バー（features/header） */}
      {!isVideoFullscreen && (
        <HeaderControls
          onSearch={setSearchQuery}
          searchQuery={searchQuery}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenWelcome={() => setWelcome((previous) => ({ ...previous, screen: "welcome" }))}
        />
      )}

      {/* ▶️ YouTube動画プレイヤー＆ポータル（features/player） */}
      <VideoPlayer
        videoId={videoId}
        onSelectVideoId={setVideoId}
        searchQuery={searchQuery}
        isWarning={isBannerWarning}
        isPoseWarning={activePoseWarning}
        isTiltWarning={activeTiltWarning}
        isDryEyeWarning={activeDryEyeWarning}
        onFullscreenChange={setIsVideoFullscreen}
      />

      {/* 📱 画面下部バー（設定・リワード・記録） */}
      {!isVideoFullscreen && (
        <footer className="bottom-app-bar" aria-label="下部メニューとステータス">
          <button
            type="button"
            className="bottom-bar-settings-btn"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="設定画面を開く"
          >
            <span className="bottom-bar-icon" aria-hidden="true">
              ⚙️
            </span>
            <span>設定</span>
          </button>

          {/* 🏆 リワード・継続時間ステータス（features/reward） */}
          <RewardStatus
            key={session.generation}
            session={session}
            isWarning={isPostureOrTiltWarning}
            isSensorEnabled={isSensorEnabled}
            rewardPoints={rewardPoints}
            onPointsChange={(value) => {
              if (isCurrentAuthSession(session)) setPoints({ session, value });
            }}
          />

          {/* 📊 記録を見るボタン＆ダッシュボード画面（components/RecordDashboard） */}
          <RecordDashboard />
        </footer>
      )}

      {/* ⚙️ 設定画面（ログイン/ログアウト・判定センサー選択・カメラ＆傾きの状況表示） */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        enableCamera={enableCamera}
        onToggleCamera={toggleCamera}
        enableTilt={enableTilt}
        onToggleTilt={toggleTilt}
      >
        {/* 📷 MediaPipe Pose 骨格検知 ＆ ドライアイ検知（設定ON時のみカメラとAIを起動してバッテリー節約） */}
        <PoseDetector
          // Reset blink counters, eye state and timers at every account boundary.
          key={session.generation}
          enabled={welcome.hasEntered && enableCamera}
          onWarningChange={(posture) => {
            if (!isCurrentAuthSession(session)) return;
            setPoseStatus((previous) => ({
              session, posture,
              dryEye: previous.session === session && previous.dryEye,
            }));
          }}
          onDryEyeWarningChange={(dryEye) => {
            if (!isCurrentAuthSession(session)) return;
            setPoseStatus((previous) => ({
              session, dryEye,
              posture: previous.session === session && previous.posture,
            }));
          }}
          onMeasurementRecorded={async (batch) => {
            if (!session.uid || !isCurrentAuthSession(session)) return;
            await saveCameraMeasurement(session, batch);
          }}
        />

        {/* 📱 スマホ傾き検知（設定ON時のみセンサー監視） */}
        <TiltDetector
          enabled={welcome.hasEntered && enableTilt}
          onWarningChange={setIsTiltWarning}
        />
      </SettingsModal>
      {welcome.screen === "welcome" && <WelcomeModal onComplete={completeWelcome} nextIsSetup={!welcome.hasEntered} />}
      {welcome.screen === "setup" && <SetupModal onComplete={completeSetup} />}
    </div>
  );
}

export default App;
