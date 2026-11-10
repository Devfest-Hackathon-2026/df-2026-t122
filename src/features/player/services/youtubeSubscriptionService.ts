import type { YouTubeVideo } from "../types";
import { YouTubeApiError } from "./youtubeApi";

interface SubscriptionSnippet {
  resourceId?: { channelId?: string };
  title?: string;
  description?: string;
  thumbnails?: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
  };
}

interface SubscriptionItem {
  snippet?: SubscriptionSnippet;
}

interface ChannelItem {
  id: string;
  snippet?: {
    title?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
}

interface PlaylistItemSnippet {
  resourceId?: { videoId?: string };
  title?: string;
  description?: string;
  channelTitle?: string;
  channelId?: string;
  publishedAt?: string;
  thumbnails?: {
    default?: { url: string; width?: number; height?: number };
    medium?: { url: string; width?: number; height?: number };
    high?: { url: string; width?: number; height?: number };
  };
}

interface PlaylistItem {
  snippet?: PlaylistItemSnippet;
}

const API_BASE_URL = "https://www.googleapis.com/youtube/v3";

/**
 * 📺 YouTube登録チャンネル＆最新動画取得サービス
 * - subscriptions.list → channels.list → playlistItems.list の連携
 * - 401（トークン期限切れ）、403（クォータ等）のエラーハンドリング
 * - APIクォータ保護のための件数制限と短時間メモリキャッシュ
 */
class YouTubeSubscriptionService {
  private cachedVideos: YouTubeVideo[] | null = null;
  private cacheTimestamp = 0;
  private CACHE_DURATION_MS = 2 * 60 * 1000; // 2分間キャッシュ

  /** キャッシュを明示的にクリア（更新ボタン押下時など） */
  public clearCache(): void {
    this.cachedVideos = null;
    this.cacheTimestamp = 0;
  }

  /**
   * 認証済みユーザーの登録チャンネルから最新動画一覧を取得
   */
  public async fetchMySubscriptionVideos(
    accessToken: string,
    options: {
      maxChannels?: number;
      videosPerChannel?: number;
      forceRefresh?: boolean;
    } = {}
  ): Promise<YouTubeVideo[]> {
    const {
      maxChannels = 10,
      videosPerChannel = 2,
      forceRefresh = false,
    } = options;

    // キャッシュが有効な場合はそのまま返却
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedVideos !== null &&
      now - this.cacheTimestamp < this.CACHE_DURATION_MS
    ) {
      return this.cachedVideos;
    }

    if (!accessToken) {
      throw new YouTubeApiError(
        "アクセストークンが指定されていません。YouTubeと連携してください。",
        401,
        "UNAUTHENTICATED"
      );
    }

    // ----------------------------------------------------
    // Step 1: 登録チャンネル一覧の取得 (subscriptions.list)
    // ----------------------------------------------------
    const subParams = new URLSearchParams({
      part: "snippet",
      mine: "true",
      maxResults: String(maxChannels),
    });

    const subResponse = await this.callApi(
      `${API_BASE_URL}/subscriptions?${subParams.toString()}`,
      accessToken
    );
    const subData = await subResponse.json();
    const subItems: SubscriptionItem[] = subData.items || [];

    if (subItems.length === 0) {
      this.cachedVideos = [];
      this.cacheTimestamp = now;
      return [];
    }

    const channelIds: string[] = subItems
      .map((item) => item.snippet?.resourceId?.channelId)
      .filter((id): id is string => Boolean(id));

    if (channelIds.length === 0) {
      this.cachedVideos = [];
      this.cacheTimestamp = now;
      return [];
    }

    // ----------------------------------------------------
    // Step 2: アップロード動画用プレイリストIDを取得 (channels.list)
    // 最大50チャンネルまでカンマ区切りで一括取得（1クォータユニットで効率的）
    // ----------------------------------------------------
    const channelParams = new URLSearchParams({
      part: "contentDetails,snippet",
      id: channelIds.join(","),
      maxResults: "50",
    });

    const channelResponse = await this.callApi(
      `${API_BASE_URL}/channels?${channelParams.toString()}`,
      accessToken
    );
    const channelData = await channelResponse.json();
    const channelItems: ChannelItem[] = channelData.items || [];

    const uploadsPlaylistIds: { channelTitle: string; playlistId: string }[] =
      [];
    for (const item of channelItems) {
      const playlistId = item.contentDetails?.relatedPlaylists?.uploads;
      if (playlistId) {
        uploadsPlaylistIds.push({
          channelTitle: item.snippet?.title || "登録チャンネル",
          playlistId,
        });
      }
    }

    if (uploadsPlaylistIds.length === 0) {
      this.cachedVideos = [];
      this.cacheTimestamp = now;
      return [];
    }

    // ----------------------------------------------------
    // Step 3: 各アップロードプレイリストから最新動画を取得 (playlistItems.list)
    // ----------------------------------------------------
    const videoFetchPromises = uploadsPlaylistIds.map(async (ch) => {
      try {
        const playlistParams = new URLSearchParams({
          part: "snippet",
          playlistId: ch.playlistId,
          maxResults: String(videosPerChannel),
        });

        const res = await this.callApi(
          `${API_BASE_URL}/playlistItems?${playlistParams.toString()}`,
          accessToken
        );
        const data = await res.json();
        const items: PlaylistItem[] = data.items || [];

        return items
          .map((item): YouTubeVideo | null => {
            const snippet = item.snippet;
            const videoId = snippet?.resourceId?.videoId;
            if (!videoId) return null;

            return {
              id: videoId,
              title: snippet.title || "無題の動画",
              description: snippet.description || "",
              channelTitle: snippet.channelTitle || ch.channelTitle,
              channelId: snippet.channelId,
              publishedAt: snippet.publishedAt || new Date().toISOString(),
              thumbnails: snippet.thumbnails || {},
            };
          })
          .filter((v): v is YouTubeVideo => v !== null);
      } catch (err) {
        console.warn(`Failed to fetch videos for playlist ${ch.playlistId}:`, err);
        return [];
      }
    });

    // 並列取得（一部チャンネルの失敗が全体をブロックしないよう処理）
    const results = await Promise.all(videoFetchPromises);
    const flattenedVideos = results.flat();

    // ----------------------------------------------------
    // Step 4: 公開日時（publishedAt）の新しい順にソート
    // ----------------------------------------------------
    flattenedVideos.sort((a, b) => {
      const timeA = new Date(a.publishedAt).getTime();
      const timeB = new Date(b.publishedAt).getTime();
      return timeB - timeA;
    });

    this.cachedVideos = flattenedVideos;
    this.cacheTimestamp = now;

    return flattenedVideos;
  }

  /** Bearer認証付き共通Fetchヘルパー */
  private async callApi(url: string, accessToken: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
    } catch {
      throw new YouTubeApiError(
        "ネットワークに接続できないか、通信が遮断されました。",
        0,
        "NETWORK_ERROR"
      );
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new YouTubeApiError(
          "YouTubeの認証期限が切れました。もう一度「YouTubeと連携」を押してください。",
          401,
          "UNAUTHORIZED"
        );
      } else if (response.status === 403) {
        throw new YouTubeApiError(
          "YouTube APIの利用上限（クォータ）を超過したか、権限が不足しています。",
          403,
          "FORBIDDEN"
        );
      } else if (response.status === 404) {
        throw new YouTubeApiError(
          "指定されたYouTubeリソースが見つかりませんでした。",
          404,
          "NOT_FOUND"
        );
      } else {
        throw new YouTubeApiError(
          `YouTube APIエラーが発生しました (${response.status})`,
          response.status,
          "API_ERROR"
        );
      }
    }

    return response;
  }
}

export const youtubeSubscriptionService = new YouTubeSubscriptionService();
