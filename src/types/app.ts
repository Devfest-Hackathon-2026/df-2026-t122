/**
 * 各機能（features/*）の間で受け渡す共通のProps型定義
 * App.tsx を頻繁に編集しなくて済むよう、インターフェースをここで定義します。
 */

/** 📷 features/pose (MediaPipe骨格推定) 用 */
export interface PoseDetectorProps {
  onWarningChange: (isWarning: boolean) => void;
  /** カメラ機能のON/OFF（falseのときはカメラとAI推論を完全停止してバッテリーを節約） */
  enabled?: boolean;
}

/** 📱 features/tilt (スマホ傾き検知) 用 */
export interface TiltDetectorProps {
  onWarningChange: (isWarning: boolean) => void;
  /** 傾きセンサー検知のON/OFF */
  enabled?: boolean;
}

/** ▶️ features/player (YouTube動画プレイヤー) 用 */
export interface VideoPlayerProps {
  videoId: string | null;
  onSelectVideoId?: (videoId: string) => void;
  searchQuery?: string;
  /** 全体の警告状態（姿勢・傾き・ドライアイのいずれか） */
  isWarning?: boolean;
  /** カメラによるスマホ首（姿勢悪化）警告 */
  isPoseWarning?: boolean;
  /** スマホの傾き警告 */
  isTiltWarning?: boolean;
  /** ドライアイ（まばたき不足）警告 */
  isDryEyeWarning?: boolean;
  /** 動画全画面モードの切り替え通知（全画面中は邪魔なポップアップバナーを隠すため） */
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

/** ⚠️ features/warning (警告バナー・演出) 用 */
export interface WarningBannerProps {
  isWarning: boolean;
  isPoseWarning: boolean;
  isTiltWarning: boolean;
  isManualWarning: boolean;
}

/** 🏆 features/reward (ゲーミフィケーション・リワード) 用 */
export interface RewardStatusProps {
  isWarning: boolean;
  /** いずれかの検知センサー（カメラまたは傾き）がONになっているか */
  isSensorEnabled?: boolean;
  rewardPoints: number;
  onPointsChange: (newPoints: number) => void;
}

/** 🧭 features/header (上部操作バー・検索バー・設定ボタン) 用 */
export interface HeaderControlsProps {
  onSearch: (query: string) => void;
  searchQuery?: string;
  onOpenSettings?: () => void;
  onOpenWelcome?: () => void;
  isManualWarning?: boolean;
  onToggleManualWarning?: () => void;
}

/** 🔥 features/firebase (認証・Firestoreデータ保存) 用 */
export interface FirebaseSyncProps {
  rewardPoints: number;
}
