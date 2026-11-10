import type {
  IYouTubeService,
  YouTubeSearchResponse,
  YouTubeVideo,
} from "../types";
import { MOCK_POPULAR_VIDEOS, MOCK_SEARCH_RESULTS } from "../mockData";

/** YouTube API専用のエラークラス */
export class YouTubeApiError extends Error {
  public statusCode?: number;
  public reason?: string;

  constructor(message: string, statusCode?: number, reason?: string) {
    super(message);
    this.name = "YouTubeApiError";
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

// ----------------------------------------------------
// 設定値（環境変数より取得）
// 将来的に Cloud Run 等のプロキシサーバーへ切り替える際は
// VITE_YOUTUBE_API_BASE_URL を指定するだけで対応可能です。
// ----------------------------------------------------
const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || "";
const API_BASE_URL =
  import.meta.env.VITE_YOUTUBE_API_BASE_URL ||
  "https://www.googleapis.com/youtube/v3";

/**
 * 明示的にモックモードが有効化されているかどうか
 * ※ APIエラー時に自動切り替えは行わず、この環境変数が 'true' の場合のみ有効化されます。
 */
export const isMockModeEnabled =
  import.meta.env.VITE_USE_MOCK_YOUTUBE === "true";

/** APIキーが設定されているか確認 */
export function hasValidApiKey(): boolean {
  return Boolean(API_KEY && API_KEY.trim().length > 0);
}

// ----------------------------------------------------
// レスポンスマッピング用ヘルパー
// ----------------------------------------------------

interface RawThumbnails {
  default?: { url: string; width?: number; height?: number };
  medium?: { url: string; width?: number; height?: number };
  high?: { url: string; width?: number; height?: number };
  standard?: { url: string; width?: number; height?: number };
  maxres?: { url: string; width?: number; height?: number };
}

interface RawVideoItem {
  id: string | { kind?: string; videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails?: RawThumbnails;
  };
}

/** YouTube APIのRawレスポンスを統一された YouTubeVideo 型に整形 */
function mapRawItemToVideo(item: RawVideoItem): YouTubeVideo | null {
  const videoId =
    typeof item.id === "string" ? item.id : item.id?.videoId;

  if (!videoId) return null;

  const snippet = item.snippet || {};

  return {
    id: videoId,
    title: snippet.title || "無題の動画",
    description: snippet.description || "",
    channelTitle: snippet.channelTitle || "不明なチャンネル",
    channelId: snippet.channelId,
    publishedAt: snippet.publishedAt || new Date().toISOString(),
    thumbnails: snippet.thumbnails || {},
  };
}

/** HTTPエラーレスポンスをユーザー向けエラーメッセージに変換 */
async function handleHttpError(response: Response): Promise<never> {
  let message = `YouTube API エラーが発生しました (${response.status})`;
  let reason = "";

  try {
    const errorData = await response.json();
    const errorObj = errorData?.error;
    if (errorObj) {
      const firstError = errorObj.errors?.[0];
      reason = firstError?.reason || "";
      if (response.status === 403) {
        if (reason === "quotaExceeded") {
          message =
            "YouTube APIの1日の利用上限（クォータ）を超過しました。明日以降に再試行してください。";
        } else {
          message =
            "YouTube APIへのアクセスが拒否されました。APIキーの権限・制限設定を確認してください。";
        }
      } else if (response.status === 400) {
        message =
          "無効なリクエストです。APIキーが正しいか確認してください。";
      } else if (errorObj.message) {
        message = errorObj.message;
      }
    }
  } catch {
    // JSONでないレスポンスの場合はデフォルトメッセージを使用
  }

  throw new YouTubeApiError(message, response.status, reason);
}

// ----------------------------------------------------
// YouTube API サービス本体
// ----------------------------------------------------
export class YouTubeService implements IYouTubeService {
  /**
   * ホーム画面・初期表示用の人気動画一覧を取得
   */
  async fetchPopularVideos(
    maxResults = 20,
    regionCode = "JP"
  ): Promise<YouTubeVideo[]> {
    // 開発時に明示的なモックモードが指定されている場合
    if (isMockModeEnabled) {
      return MOCK_POPULAR_VIDEOS.slice(0, maxResults);
    }

    if (!hasValidApiKey()) {
      throw new YouTubeApiError(
        "YouTube APIキーが設定されていません。.env.local に VITE_YOUTUBE_API_KEY を設定するか、VITE_USE_MOCK_YOUTUBE=true を設定してください。"
      );
    }

    const params = new URLSearchParams({
      part: "snippet",
      chart: "mostPopular",
      regionCode,
      maxResults: String(maxResults),
      key: API_KEY,
    });

    const url = `${API_BASE_URL}/videos?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new YouTubeApiError(
        "ネットワークに接続できないか、YouTube APIへのアクセスがブロックされました。"
      );
    }

    if (!response.ok) {
      await handleHttpError(response);
    }

    const data = await response.json();
    const items: RawVideoItem[] = data.items || [];
    return items
      .map(mapRawItemToVideo)
      .filter((v): v is YouTubeVideo => v !== null);
  }

  /**
   * キーワードによる動画検索
   */
  async searchVideos(
    query: string,
    maxResults = 20
  ): Promise<YouTubeSearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { items: [] };
    }

    // 開発時に明示的なモックモードが指定されている場合
    if (isMockModeEnabled) {
      const filtered = MOCK_SEARCH_RESULTS.filter(
        (v) =>
          v.title.toLowerCase().includes(trimmed.toLowerCase()) ||
          v.description.toLowerCase().includes(trimmed.toLowerCase())
      );
      return {
        items: filtered.length > 0 ? filtered : MOCK_SEARCH_RESULTS,
        totalResults: filtered.length,
      };
    }

    if (!hasValidApiKey()) {
      throw new YouTubeApiError(
        "YouTube APIキーが設定されていません。.env.local に VITE_YOUTUBE_API_KEY を設定するか、VITE_USE_MOCK_YOUTUBE=true を設定してください。"
      );
    }

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: trimmed,
      maxResults: String(maxResults),
      key: API_KEY,
    });

    const url = `${API_BASE_URL}/search?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new YouTubeApiError(
        "ネットワークに接続できないか、YouTube APIへのアクセスがブロックされました。"
      );
    }

    if (!response.ok) {
      await handleHttpError(response);
    }

    const data = await response.json();
    const rawItems: RawVideoItem[] = data.items || [];
    const items = rawItems
      .map(mapRawItemToVideo)
      .filter((v): v is YouTubeVideo => v !== null);

    return {
      items,
      nextPageToken: data.nextPageToken,
      totalResults: data.pageInfo?.totalResults,
    };
  }
}

/** シングルトンインスタンス */
export const youtubeService = new YouTubeService();
