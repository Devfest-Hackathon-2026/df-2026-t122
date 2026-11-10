import { useEffect, useRef } from "react";
import "./WelcomeModal.css";

export function WelcomeModal({ onComplete, nextIsSetup = false }: { onComplete: () => void; nextIsSetup?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="welcome-modal"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
      onCancel={(event) => {
        event.preventDefault();
        onComplete();
      }}
    >
      <div className="welcome-content">
        <div className="welcome-brand">
          <span className="welcome-logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M12 8.5v15l12-7.5-12-7.5Z" fill="currentColor" />
              <path d="M7 8v16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          <span>neck-app</span>
          <span className="welcome-eyebrow">はじめまして</span>
        </div>
        <button type="button" className="welcome-close" aria-label="アプリの説明を閉じる" onClick={onComplete}>
          <span aria-hidden="true">×</span>
        </button>

        <div className="welcome-intro">
          <p className="welcome-kicker">いつもの動画に、小さな気づきを。</p>
          <h1 id="welcome-title">動画を楽しみながら、<br />首の姿勢を意識しよう。</h1>
          <p id="welcome-description">いつもの動画視聴に、さりげない姿勢サポートを。</p>
        </div>

        <ol className="welcome-features">
          <li>
            <span className="welcome-feature-icon" aria-hidden="true">📷</span>
            <div><h2>カメラで姿勢を検知</h2><p>設定からカメラをONにして、自分の姿勢をチェック。</p></div>
          </li>
          <li>
            <span className="welcome-feature-icon welcome-notice-icon" aria-hidden="true">◉</span>
            <div><h2>動画を邪魔せず、画面の色で姿勢を通知</h2><p>動画はそのまま再生。赤い通知バナーでお知らせします。</p></div>
          </li>
          <li>
            <span className="welcome-feature-icon" aria-hidden="true">📊</span>
            <div><h2>姿勢維持時間や瞬きの記録を可視化</h2><p>ログインすると、自分の記録を保存・確認できます。</p></div>
          </li>
        </ol>

        <div className="welcome-actions">
          <button type="button" className="welcome-start" onClick={onComplete}>
            動画を見始める <span aria-hidden="true">→</span>
          </button>
          <p>{nextIsSetup ? "次は初回セットアップへ。ログイン・各センサーの利用は任意です。" : "ログイン・カメラの利用は任意です。"}</p>
          <p className="welcome-reopen-note">この説明はヘッダーの「使い方」からいつでも確認できます。</p>
        </div>
      </div>
    </dialog>
  );
}
