/**
 * YouTube動画機能用の型定義
 */

export interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YouTubeThumbnails {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
}

/** アプリ内で共通して扱う正規化されたYouTube動画オブジェクト */
export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId?: string;
  publishedAt: string;
  thumbnails: YouTubeThumbnails;
}

/** YouTube検索レスポンス */
export interface YouTubeSearchResponse {
  items: YouTubeVideo[];
  nextPageToken?: string;
  totalResults?: number;
}

/**
 * 動画選択履歴アイテム
 * （将来的に YouTube IFrame Player API のイベントと連携し視聴完了率などを追加可能）
 */
export interface VideoSelectionHistoryItem {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  selectedAt: number; // Unix timestamp (ms)
  source?: "search" | "popular" | "url_input" | "history";
  // 将来の再生イベント連携用フィールド（拡張ポイント）
  watchDurationSeconds?: number;
  totalDurationSeconds?: number;
  completed?: boolean;
}

/** 検索履歴アイテム */
export interface SearchHistoryItem {
  query: string;
  searchedAt: number; // Unix timestamp (ms)
}

/** YouTube APIクライアントのインターフェース（Cloud Run等のプロキシ切替用） */
export interface IYouTubeService {
  fetchPopularVideos(maxResults?: number, regionCode?: string): Promise<YouTubeVideo[]>;
  searchVideos(query: string, maxResults?: number): Promise<YouTubeSearchResponse>;
}

/** YouTube OAuth連携のステータス型 */
export type YouTubeAuthStatus =
  | "unauthenticated" // Google未ログイン
  | "not_linked" // Googleログイン済み・YouTube未連携
  | "linking" // 連携中
  | "linked" // 連携済み
  | "error"; // 連携または通信エラー

/** 登録チャンネル情報 */
export interface YouTubeChannelItem {
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  uploadsPlaylistId?: string;
}
