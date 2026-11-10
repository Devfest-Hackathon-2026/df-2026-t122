// Updated VideoList with My YouTube channel tab and auth handling
import { useState, useEffect, useCallback } from "react";
import type { YouTubeVideo } from "../types";
import { youtubeService, YouTubeApiError } from "../services/youtubeApi";
import {
  getSelectionHistory,
  addSelectionHistory,
  clearSelectionHistory,
} from "../services/historyStorage";
import { VideoCard } from "./VideoCard";
import "./VideoList.css";
import { youtubeAuthService } from "../services/youtubeAuthService";
import { youtubeSubscriptionService } from "../services/youtubeSubscriptionService";
import type { YouTubeAuthStatus } from "../types";

// Extend tab type to include My Channels
export type VideoTabType = "popular" | "search" | "history" | "myChannels";

export interface VideoListProps {
  /** 動画がタップ・選択されたときのコールバック */
  onSelectVideo: (video: YouTubeVideo) => void;
  /** 現在選択・再生中の動画ID（未選択時は null） */
  selectedVideoId?: string | null;
  /** 初期表示タブ（デフォルト: popular） */
  initialTab?: VideoTabType;
  /** ヘッダー等から渡される検索クエリ */
  searchQuery?: string;
}

function loadHistoryFromStorage(): YouTubeVideo[] {
  const rawHistory = getSelectionHistory();
  return rawHistory.map((item) => ({
    id: item.id,
    title: item.title,
    description: "",
    channelTitle: item.channelTitle,
    publishedAt: new Date(item.selectedAt).toISOString(),
    thumbnails: {
      medium: { url: item.thumbnailUrl },
      default: { url: item.thumbnailUrl },
    },
  }));
}

export function VideoList({
  onSelectVideo,
  selectedVideoId,
  initialTab = "popular",
  searchQuery = "",
}: VideoListProps) {
  const [activeTab, setActiveTab] = useState<VideoTabType>(initialTab);
  const [popularVideos, setPopularVideos] = useState<YouTubeVideo[]>([]);
  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>([]);
  const [historyVideos, setHistoryVideos] = useState<YouTubeVideo[]>(loadHistoryFromStorage);

  const [lastSearchQuery, setLastSearchQuery] = useState(searchQuery);
  const [prevSearchQueryProp, setPrevSearchQueryProp] = useState(searchQuery);

  const [isLoading, setIsLoading] = useState(initialTab === "popular");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // My Channels related state
  const [authStatus, setAuthStatus] = useState<YouTubeAuthStatus>("unauthenticated");
  const [myChannelVideos, setMyChannelVideos] = useState<YouTubeVideo[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState<string | null>(null);

  // 外部から新しい検索クエリが渡された場合、レンダー時に検索タブ・状態を調整
  if (searchQuery && searchQuery !== prevSearchQueryProp) {
    setPrevSearchQueryProp(searchQuery);
    setLastSearchQuery(searchQuery);
    setActiveTab("search");
    setIsLoading(true);
    setErrorMessage(null);
  }

  // 履歴一覧を再読み込み
  const reloadHistory = useCallback(() => {
    setHistoryVideos(loadHistoryFromStorage());
  }, []);

  // 人気動画の読み込み
  const loadPopularVideos = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const videos = await youtubeService.fetchPopularVideos(20, "JP");
      setPopularVideos(videos);
    } catch (err) {
      if (err instanceof YouTubeApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(
          "人気動画の取得中にエラーが発生しました。ネットワーク環境をご確認ください。"
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初回マウント時に人気動画を取得（initialTabがpopularの場合）
  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const videos = await youtubeService.fetchPopularVideos(20, "JP");
        if (isMounted) {
          setPopularVideos(videos);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          if (err instanceof YouTubeApiError) {
            setErrorMessage(err.message);
          } else {
            setErrorMessage(
              "人気動画の取得中にエラーが発生しました。ネットワーク環境をご確認ください。"
            );
          }
          setIsLoading(false);
        }
      }
    }
    if (initialTab === "popular") {
      init();
    }
    return () => {
      isMounted = false;
    };
  }, [initialTab]);

  // 検索クエリに応じたAPI検索実行
  useEffect(() => {
    if (!lastSearchQuery) return;
    let isMounted = true;
    youtubeService
      .searchVideos(lastSearchQuery, 20)
      .then((response) => {
        if (isMounted) {
          setSearchResults(response.items);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          if (err instanceof YouTubeApiError) {
            setErrorMessage(err.message);
          } else {
            setErrorMessage(
              "検索の実行中にエラーが発生しました。時間をおいて再試行してください。"
            );
          }
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [lastSearchQuery]);

  // タブ切り替え時の処理
  const handleTabChange = (tab: VideoTabType) => {
    setActiveTab(tab);
    setErrorMessage(null);
    if (tab === "history") {
      reloadHistory();
    } else if (tab === "popular" && popularVideos.length === 0) {
      loadPopularVideos();
    } else if (tab === "myChannels") {
      if (authStatus === "linked") {
        fetchMyChannels();
      }
    }
  };

  // エラー時の再試行
  const handleRetry = () => {
    if (activeTab === "popular") {
      loadPopularVideos();
    } else if (activeTab === "search" && lastSearchQuery) {
      setIsLoading(true);
      setErrorMessage(null);
      youtubeService
        .searchVideos(lastSearchQuery, 20)
        .then((response) => {
          setSearchResults(response.items);
          setIsLoading(false);
        })
        .catch((err) => {
          setErrorMessage(
            err instanceof YouTubeApiError ? err.message : "検索の実行中にエラーが発生しました。"
          );
          setIsLoading(false);
        });
    }
  };

  // 動画選択時のハンドラー
  const handleSelect = (video: YouTubeVideo) => {
    // 選択履歴に追加
    const source =
      activeTab === "popular"
        ? "popular"
        : activeTab === "history"
        ? "history"
        : "search";
    addSelectionHistory(video, source);
    reloadHistory();
    onSelectVideo(video);
  };

  // 履歴全削除
  const handleClearHistory = () => {
    if (window.confirm("視聴・選択履歴をすべて消去しますか？")) {
      clearSelectionHistory();
      setHistoryVideos([]);
    }
  };

  // ---------- My Channels (OAuth) handling ----------
  const determineAuthStatus = (): YouTubeAuthStatus => {
    const user = youtubeAuthService.getCurrentUser();
    if (!user) return "unauthenticated";
    if (youtubeAuthService.isLinked()) return "linked";
    return "not_linked";
  };

  // Sync auth status with service changes
  useEffect(() => {
    const update = () => setAuthStatus(determineAuthStatus());
    const unsub = youtubeAuthService.subscribe(update);
    update();
    return unsub;
  }, []);

  const fetchMyChannels = async () => {
    const token = youtubeAuthService.getAccessToken();
    if (!token) {
      setMyError("YouTubeと連携してください");
      return;
    }
    setMyLoading(true);
    setMyError(null);
    try {
      const videos = await youtubeSubscriptionService.fetchMySubscriptionVideos(token);
      setMyChannelVideos(videos);
    } catch (err) {
      if (err instanceof Error) {
        setMyError(err.message);
      } else {
        setMyError("不明なエラーが発生しました");
      }
    } finally {
      setMyLoading(false);
    }
  };

  const handleLink = async () => {
    setAuthStatus("linking");
    try {
      await youtubeAuthService.requestPermission();
      // Listener will update authStatus and token
    } catch (e) {
      setMyError(e instanceof Error ? e.message : String(e));
      setAuthStatus("error");
    }
  };

  const handleUnlink = () => {
    youtubeAuthService.disconnectYouTube();
    setMyChannelVideos([]);
    setAuthStatus(determineAuthStatus());
  };

  // 表示する動画リストの決定
  let displayedVideos: YouTubeVideo[] = [];
  if (activeTab === "popular") {
    displayedVideos = popularVideos;
  } else if (activeTab === "search") {
    displayedVideos = searchResults;
  } else if (activeTab === "history") {
    displayedVideos = historyVideos;
  } else if (activeTab === "myChannels") {
    displayedVideos = myChannelVideos;
  }

  return (
    <div className="video-list-container">
      <div className="video-list-header">
        <div className="video-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "popular"}
            className={`video-tab-btn ${activeTab === "popular" ? "active" : ""}`}
            onClick={() => handleTabChange("popular")}
          >
            <span>人気動画</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "search"}
            className={`video-tab-btn ${activeTab === "search" ? "active" : ""}`}
            onClick={() => handleTabChange("search")}
          >
            <span>検索結果</span>
            {searchResults.length > 0 && (
              <span className="video-tab-count">{searchResults.length}</span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            className={`video-tab-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => handleTabChange("history")}
          >
            <span>履歴</span>
            {historyVideos.length > 0 && (
              <span className="video-tab-count">{historyVideos.length}</span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "myChannels"}
            className={`video-tab-btn ${activeTab === "myChannels" ? "active" : ""}`}
            onClick={() => handleTabChange("myChannels")}
          >
            <span>登録チャンネル</span>
            {myChannelVideos.length > 0 && (
              <span className="video-tab-count">{myChannelVideos.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="video-list-scroll-area">
        {/* Loading state */}
        {isLoading && activeTab !== "myChannels" && (
          <div className="video-list-state-box">
            <div className="video-list-spinner" />
            <p>{activeTab === "search" ? `「${lastSearchQuery}」を検索中...` : "人気動画を読み込んでいます..."}</p>
          </div>
        )}
        {/* My Channels specific UI */}
        {activeTab === "myChannels" && (
          <>
            {authStatus === "unauthenticated" && (
              <div className="video-list-state-box">
                <p>Googleでログインしてください。</p>
              </div>
            )}
            {authStatus === "not_linked" && (
              <div className="video-list-state-box">
                <p className="yt-info-text">登録チャンネルの最新動画を表示できます</p>
                <button type="button" onClick={handleLink} className="yt-btn yt-btn-primary">YouTubeと連携</button>
              </div>
            )}
            {authStatus === "linking" && (
              <div className="video-list-state-box">
                <div className="video-list-spinner" />
                <p>YouTube 連携中…</p>
              </div>
            )}
            {authStatus === "error" && (
              <div className="video-list-error-box">
                <p className="video-list-error-message">{myError}</p>
                <button type="button" onClick={handleLink}>再試行</button>
              </div>
            )}
            {authStatus === "linked" && (
              <>
                {myLoading && (
                  <div className="video-list-state-box">
                    <div className="video-list-spinner" />
                    <p>チャンネル動画を取得中…</p>
                  </div>
                )}
                {myError && (
                  <div className="video-list-error-box">
                    <p className="video-list-error-message">{myError}</p>
                    <button type="button" onClick={fetchMyChannels}>再取得</button>
                  </div>
                )}
                <button type="button" onClick={handleUnlink}>連携解除</button>
              </>
            )}
          </>
        )}

        {/* Error display for popular/search */}
        {!isLoading && errorMessage && activeTab !== "myChannels" && (
          <div className="video-list-error-box">
            <span className="video-list-error-icon">⚠️</span>
            <p className="video-list-error-message">{errorMessage}</p>
            <button type="button" className="video-list-retry-btn" onClick={handleRetry}>
              再試行する
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !errorMessage && displayedVideos.length === 0 && activeTab !== "myChannels" && (
          <div className="video-list-empty-box">
            {activeTab === "popular" && (
              <>
                <span className="video-list-empty-icon">📺</span>
                <p className="video-list-empty-title">表示できる人気動画がありません</p>
                <p className="video-list-empty-desc">ネットワークまたはAPI設定を確認してください。</p>
              </>
            )}
            {activeTab === "search" && (
              <>
                <span className="video-list-empty-icon">🔍</span>
                <p className="video-list-empty-title">
                  {lastSearchQuery
                    ? `「${lastSearchQuery}」に一致する動画は見つかりませんでした`
                    : "ヘッダーの検索バーからキーワードを入力してください"}
                </p>
                <p className="video-list-empty-desc">別のキーワードで再度お試しください。</p>
              </>
            )}
            {activeTab === "history" && (
              <>
                <span className="video-list-empty-icon">🕒</span>
                <p className="video-list-empty-title">動画の選択・視聴履歴はありません</p>
                <p className="video-list-empty-desc">動画をタップして再生すると、ここに履歴が表示されます。</p>
              </>
            )}
          </div>
        )}

        {/* Video grid */}
        {!isLoading && !errorMessage && displayedVideos.length > 0 && (
          <>
            {activeTab === "history" && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: "8px",
                }}
              >
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#9ca3af",
                    fontSize: "11px",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                  onClick={handleClearHistory}
                >
                  履歴をすべて消去
                </button>
              </div>
            )}
            <div className="video-grid">
              {displayedVideos.map((video) => (
                <VideoCard
                  key={`${activeTab}-${video.id}`}
                  video={video}
                  onSelect={handleSelect}
                  isSelected={video.id === selectedVideoId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
