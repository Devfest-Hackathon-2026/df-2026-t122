import type { ReactNode } from "react";
import { Login } from "../auth/Login";
import "./SettingsModal.css";

export interface SettingsModalProps {
  /** 設定画面が開いているかどうか */
  isOpen: boolean;
  /** 設定画面を閉じるコールバック */
  onClose: () => void;
  /** カメラ（MediaPipe姿勢・まばたき）判定の有効/無効 */
  enableCamera: boolean;
  onToggleCamera: () => void;
  /** スマホの傾き（ジャイロ）判定の有効/無効 */
  enableTilt: boolean;
  onToggleTilt: () => void;
  /** 設定画面内に配置するカメラ・傾きステータスコンポーネント */
  children?: ReactNode;
}

/**
 * ⚙️ 設定画面モーダルコンポーネント
 * - アカウントのログインおよびログアウト
 * - スマホの傾きとカメラのどちらで判定するか選択（両方選択も可能）
 * - 傾きとカメラの現在の検知状況・キャリブレーション表示
 * ※ 閉じているときも裏でカメラ・センサー検知を継続させるため、DOM自体は維持して非表示化します。
 */
export function SettingsModal({
  isOpen,
  onClose,
  enableCamera,
  onToggleCamera,
  enableTilt,
  onToggleTilt,
  children,
}: SettingsModalProps) {
  return (
    <div
      className={`settings-modal-backdrop ${isOpen ? "open" : "closed"}`}
      aria-hidden={!isOpen}
      onClick={onClose}
    >
      <div
        className="settings-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="アプリ設定"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <header className="settings-modal-header">
          <div className="settings-header-title-wrap">
            <span className="settings-header-icon">⚙️</span>
            <div>
              <h2 className="settings-modal-title">設定</h2>
              <p className="settings-modal-subtitle">
                検知方式の切り替え・センサー状況の確認・アカウント管理
              </p>
            </div>
          </div>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
          >
            ✕ 閉じる
          </button>
        </header>

        <div className="settings-modal-body">
          {/* 1. アカウントのログインおよびログアウト */}
          <section className="settings-section">
            <h3 className="settings-section-title">👤 アカウント連携</h3>
            <p className="settings-section-desc">
              Googleアカウントでログインすると、姿勢維持時間やまばたき記録がアカウントに紐づいて保存されます。
            </p>
            <div className="settings-account-box">
              <Login />
            </div>
          </section>

          {/* 2. スマホの傾きとカメラのどっちで判定するか選べるボタン（両方選択可能） */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              🎯 判定センサーの選択（複数選択可）
            </h3>
            <p className="settings-section-desc">
              カメラとスマホの傾きのどちらでスマホ首を判定するか選べます（両方ONにすることも可能です）。
            </p>

            <div className="settings-toggle-grid">
              <button
                type="button"
                className={`settings-sensor-toggle ${
                  enableCamera ? "active" : ""
                }`}
                onClick={onToggleCamera}
                aria-pressed={enableCamera}
              >
                <div className="sensor-toggle-top">
                  <span className="sensor-toggle-icon">📷</span>
                  <span
                    className={`sensor-toggle-badge ${
                      enableCamera ? "on" : "off"
                    }`}
                  >
                    {enableCamera ? "ON (使用中)" : "OFF"}
                  </span>
                </div>
                <div className="sensor-toggle-name">
                  カメラで判定（骨格・まばたき）
                </div>
                <div className="sensor-toggle-note">
                  首の角度・うつむき度・ドライアイをAIで検知します
                </div>
              </button>

              <button
                type="button"
                className={`settings-sensor-toggle ${
                  enableTilt ? "active" : ""
                }`}
                onClick={onToggleTilt}
                aria-pressed={enableTilt}
              >
                <div className="sensor-toggle-top">
                  <span className="sensor-toggle-icon">📱</span>
                  <span
                    className={`sensor-toggle-badge ${
                      enableTilt ? "on" : "off"
                    }`}
                  >
                    {enableTilt ? "ON (使用中)" : "OFF"}
                  </span>
                </div>
                <div className="sensor-toggle-name">
                  スマホの傾きで判定（ジャイロ）
                </div>
                <div className="sensor-toggle-note">
                  端末の持ち方（覗き込み・寝スマホ角度）を検知します
                </div>
              </button>
            </div>

            {!enableCamera && !enableTilt && (
              <p className="settings-warning-note">
                ⚠️ 両方のセンサーがOFFになっています。スマホ首を検知するには少なくとも1つをONにしてください。
              </p>
            )}
          </section>

          {/* 3. 傾きとカメラの状況確認・キャリブレーション（旧ホーム画面下部のパネル） */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              📡 カメラ・傾きセンサーの現在の状況と調整
            </h3>
            <p className="settings-section-desc">
              現在の認識状況の確認や、「今の良い姿勢を基準にする」キャリブレーションが行えます。
            </p>
            <div className="settings-detectors-grid">{children}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
