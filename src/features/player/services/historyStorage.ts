import type {
  SearchHistoryItem,
  VideoSelectionHistoryItem,
  YouTubeVideo,
} from "../types";

const SEARCH_HISTORY_KEY = "posture_shift_search_history";
const SELECTION_HISTORY_KEY = "posture_shift_selection_history";

const MAX_SEARCH_HISTORY = 10;
const MAX_SELECTION_HISTORY = 20;

/** localStorageが安全に利用可能か確認するヘルパー */
function isStorageAvailable(): boolean {
  try {
    const testKey = "__storage_test__";
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// 🔍 検索履歴（Search History）
// ----------------------------------------------------

/** 検索履歴の一覧を取得する */
export function getSearchHistory(): SearchHistoryItem[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to load search history from localStorage:", err);
    return [];
  }
}

/** 検索キーワードを履歴に追加する（重複は先頭に移動し、上限件数を維持） */
export function addSearchHistory(query: string): SearchHistoryItem[] {
  const trimmed = query.trim();
  if (!trimmed || !isStorageAvailable()) return getSearchHistory();

  try {
    const current = getSearchHistory();
    // 既存の同名クエリを削除（大文字小文字無視で比較）
    const filtered = current.filter(
      (item) => item.query.toLowerCase() !== trimmed.toLowerCase()
    );
    const newItem: SearchHistoryItem = {
      query: trimmed,
      searchedAt: Date.now(),
    };
    const updated = [newItem, ...filtered].slice(0, MAX_SEARCH_HISTORY);
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to save search history:", err);
    return getSearchHistory();
  }
}

/** 特定の検索キーワードを履歴から削除する */
export function removeSearchHistory(query: string): SearchHistoryItem[] {
  if (!isStorageAvailable()) return [];
  try {
    const current = getSearchHistory();
    const updated = current.filter(
      (item) => item.query.toLowerCase() !== query.trim().toLowerCase()
    );
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to remove search history:", err);
    return getSearchHistory();
  }
}

/** 検索履歴をすべてクリアする */
export function clearSearchHistory(): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (err) {
    console.error("Failed to clear search history:", err);
  }
}

// ----------------------------------------------------
// 🎬 動画選択履歴（Video Selection History）
// 将来的に IFrame Player API の再生時間・完了ステータス等に拡張可能
// ----------------------------------------------------

/** 動画選択履歴の一覧を取得する */
export function getSelectionHistory(): VideoSelectionHistoryItem[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(SELECTION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to load selection history from localStorage:", err);
    return [];
  }
}

/**
 * 動画が選択された際に履歴に追加する
 * 重複する動画IDがある場合は最新の日時・情報で先頭に更新
 */
export function addSelectionHistory(
  video: YouTubeVideo,
  source: VideoSelectionHistoryItem["source"] = "search"
): VideoSelectionHistoryItem[] {
  if (!isStorageAvailable() || !video?.id) return getSelectionHistory();

  try {
    const current = getSelectionHistory();
    // 既存の履歴があれば再生時間などの進捗情報を引き継ぐ
    const existing = current.find((item) => item.id === video.id);
    const filtered = current.filter((item) => item.id !== video.id);

    const thumbnail =
      video.thumbnails.medium?.url ||
      video.thumbnails.high?.url ||
      video.thumbnails.default?.url ||
      `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

    const newItem: VideoSelectionHistoryItem = {
      id: video.id,
      title: video.title,
      channelTitle: video.channelTitle,
      thumbnailUrl: thumbnail,
      selectedAt: Date.now(),
      source,
      watchDurationSeconds: existing?.watchDurationSeconds ?? 0,
      totalDurationSeconds: existing?.totalDurationSeconds ?? 0,
      completed: existing?.completed ?? false,
    };

    const updated = [newItem, ...filtered].slice(0, MAX_SELECTION_HISTORY);
    window.localStorage.setItem(SELECTION_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to save selection history:", err);
    return getSelectionHistory();
  }
}

/**
 * 【将来拡張用】YouTube IFrame Player API連携時に視聴進捗を更新する
 */
export function updateWatchProgress(
  videoId: string,
  progress: {
    watchDurationSeconds?: number;
    totalDurationSeconds?: number;
    completed?: boolean;
  }
): VideoSelectionHistoryItem[] {
  if (!isStorageAvailable() || !videoId) return getSelectionHistory();

  try {
    const current = getSelectionHistory();
    const updated = current.map((item) => {
      if (item.id === videoId) {
        return {
          ...item,
          watchDurationSeconds:
            progress.watchDurationSeconds ?? item.watchDurationSeconds,
          totalDurationSeconds:
            progress.totalDurationSeconds ?? item.totalDurationSeconds,
          completed: progress.completed ?? item.completed,
        };
      }
      return item;
    });
    window.localStorage.setItem(SELECTION_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to update watch progress:", err);
    return getSelectionHistory();
  }
}

/** 特定の動画を履歴から削除する */
export function removeSelectionHistory(
  videoId: string
): VideoSelectionHistoryItem[] {
  if (!isStorageAvailable()) return [];
  try {
    const current = getSelectionHistory();
    const updated = current.filter((item) => item.id !== videoId);
    window.localStorage.setItem(SELECTION_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to remove selection history:", err);
    return getSelectionHistory();
  }
}

/** 動画選択履歴をすべてクリアする */
export function clearSelectionHistory(): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(SELECTION_HISTORY_KEY);
  } catch (err) {
    console.error("Failed to clear selection history:", err);
  }
}
