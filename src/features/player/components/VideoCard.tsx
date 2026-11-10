import { useState, type KeyboardEvent } from "react";
import type { YouTubeVideo } from "../types";
import "./VideoCard.css";

export interface VideoCardProps {
  /** 表示するYouTube動画データ */
  video: YouTubeVideo;
  /** カードタップ時のコールバック */
  onSelect: (video: YouTubeVideo) => void;
  /** 現在プレイヤーで再生中かどうか */
  isSelected?: boolean;
}

/**
 * 🎬 YouTube動画カードコンポーネント
 * 16:9サムネイル表示、遅延読み込み、画像読み込みエラー対策、
 * 2行タイトル省略表示、カード全体のタップ・キーボード操作に対応
 */
export function VideoCard({
  video,
  onSelect,
  isSelected = false,
}: VideoCardProps) {
  const [hasImageError, setHasImageError] = useState(false);

  // 利用可能な最適サムネイルURLを取得
  const thumbnailUrl =
    video.thumbnails.medium?.url ||
    video.thumbnails.high?.url ||
    video.thumbnails.default?.url ||
    `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;

  const handleClick = () => {
    onSelect(video);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(video);
    }
  };

  return (
    <div
      className={`video-card ${isSelected ? "selected" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${video.title} - ${video.channelTitle}`}
    >
      {/* 16:9 サムネイル */}
      <div className="video-card-thumbnail-wrapper">
        {hasImageError ? (
          <div className="video-card-thumbnail-fallback">
            <span className="video-card-fallback-icon">🎬</span>
            <span>No Image</span>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="video-card-thumbnail"
            loading="lazy"
            onError={() => setHasImageError(true)}
          />
        )}

        {isSelected && (
          <span className="video-card-playing-badge">再生中</span>
        )}
      </div>

      {/* 動画情報 */}
      <div className="video-card-info">
        <h4 className="video-card-title" title={video.title}>
          {video.title}
        </h4>
        <p className="video-card-channel" title={video.channelTitle}>
          {video.channelTitle}
        </p>
      </div>
    </div>
  );
}
