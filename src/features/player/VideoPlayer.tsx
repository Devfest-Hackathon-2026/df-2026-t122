import { useRef, useState, useEffect, useCallback } from "react";
import type { VideoPlayerProps } from "../../types/app";
import type { YouTubeVideo } from "./types";
import { VideoList } from "./components/VideoList";
import "./VideoPlayer.css";

/**
 * ▶️ YouTube動画プレイヤー＆ポータル機能コンポーネント
 * - 動画未選択時: プレイヤー領域全体（親コンテナ含む）を非表示にし、動画一覧を上詰めで表示
 * - 動画選択時: 16:9のYouTube動画iframeプレイヤーを表示し、上部へスムーズスクロール
 * - 全画面モード対応: ブラウザFullscreen API＋iOS向け擬似フルスクリーンに対応し、
 *   全画面視聴中も「映像の減光・彩度低下」と「右上隅の半透明小アイコン」で邪魔にならずに警告を通知します。
 */
export function VideoPlayer({
  videoId,
  onSelectVideoId,
  searchQuery,
  isWarning = false,
  isPoseWarning = false,
  isTiltWarning = false,
  isDryEyeWarning = false,
  onFullscreenChange,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const updateFullscreenState = useCallback(
    (nextState: boolean) => {
      setIsFullscreen(nextState);
      if (onFullscreenChange) {
        onFullscreenChange(nextState);
      }
    },
    [onFullscreenChange]
  );

  // ネイティブFullscreen APIの終了（Escキーやスワイプ戻る等）を検知して同期
  useEffect(() => {
    const handleFullscreenChange = () => {
      const docWithWebkit = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const fsElement =
        document.fullscreenElement || docWithWebkit.webkitFullscreenElement;
      if (!fsElement && isFullscreen) {
        // ネイティブ全画面から抜けた場合はステートも解除
        updateFullscreenState(false);
      } else if (fsElement) {
        updateFullscreenState(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
    };
  }, [isFullscreen, updateFullscreenState]);

  // 全画面モードの切り替え（Android/PCはFullscreen API、非対応のiPhone Safari等はCSS全画面に自動フォールバック）
  const toggleFullscreen = async () => {
    const frameEl = playerFrameRef.current as
      | (HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
        })
      | null;
    const docWithWebkit = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    if (!isFullscreen) {
      if (frameEl?.requestFullscreen) {
        try {
          await frameEl.requestFullscreen();
          updateFullscreenState(true);
          return;
        } catch {
          // フォールバックでCSSフルスクリーンへ
        }
      } else if (frameEl?.webkitRequestFullscreen) {
        try {
          await frameEl.webkitRequestFullscreen();
          updateFullscreenState(true);
          return;
        } catch {
          // フォールバックでCSSフルスクリーンへ
        }
      }
      // iOS Safari 等向け CSS フルスクリーン
      updateFullscreenState(true);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore
        }
      } else if (
        docWithWebkit.webkitFullscreenElement &&
        docWithWebkit.webkitExitFullscreen
      ) {
        try {
          await docWithWebkit.webkitExitFullscreen();
        } catch {
          // ignore
        }
      }
      updateFullscreenState(false);
    }
  };

  // 動画カードタップ時の処理
  const handleSelectVideo = (video: YouTubeVideo) => {
    if (onSelectVideoId) {
      onSelectVideoId(video.id);
    }
    // 動画選択時、スクロールコンテナ最上部（プレイヤー位置）へスムーズスクロール
    containerRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <main className="video-player-container" ref={containerRef}>
      {/* 
        🎬 16:9 YouTubeプレイヤー表示エリア
        動画未選択時は親コンテナごと非表示にし、黒い背景やプレースホルダー余白を残しません。
        動画選択時のみプレイヤーを表示します。
      */}
      {videoId && (
        <section
          className={`video-screen-section ${isFullscreen ? "is-fullscreen" : ""}`}
          aria-label="YouTube動画再生エリア"
        >
          <div
            ref={playerFrameRef}
            className={`video-screen-frame ${isFullscreen ? "is-fullscreen" : ""}`}
            data-warning={isWarning}
          >
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&fs=0&rel=0`}
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              className="video-iframe"
            />

            {/* 🔕 視聴を邪魔しない控えめな右上隅の半透明警告アイコン（スマホ首・傾き・ドライアイ） */}
            <div
              className={`video-subtle-warning-Corner ${isWarning ? "visible" : ""}`}
              aria-live="polite"
            >
              {(isPoseWarning || isTiltWarning) && (
                <span
                  className="subtle-warning-icon"
                  title="スマホ首・姿勢の崩れを検知中"
                >
                  🧘
                </span>
              )}
              {isTiltWarning && !isPoseWarning && (
                <span
                  className="subtle-warning-icon"
                  title="スマホの傾きすぎを検知中"
                >
                  📱
                </span>
              )}
              {isDryEyeWarning && (
                <span
                  className="subtle-warning-icon"
                  title="まばたき不足（ドライアイ注意）"
                >
                  👁️
                </span>
              )}
            </div>

            {/* ⛶ 全画面切り替えボタン（ラッパーごと全画面化して警告エフェクトを維持） */}
            <button
              type="button"
              className="video-fullscreen-toggle-btn"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "全画面を終了" : "全画面で表示"}
              title={isFullscreen ? "全画面を終了" : "全画面で表示"}
            >
              {isFullscreen ? "✕ 通常画面へ" : "⛶ 全画面"}
            </button>
          </div>
        </section>
      )}

      {/* 
        📋 動画ポータルセクション（未選択時はここが直ちに上部に詰めて表示されます）
        タブ（人気動画 / 検索結果 / 履歴）、動画グリッド一覧を配置。
      */}
      <section className="video-portal-section" aria-label="動画一覧・検索エリア">
        <VideoList
          onSelectVideo={handleSelectVideo}
          selectedVideoId={videoId}
          initialTab="popular"
          searchQuery={searchQuery}
        />
      </section>
    </main>
  );
}
