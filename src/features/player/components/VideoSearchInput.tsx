import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from "../services/historyStorage";
import type { SearchHistoryItem } from "../types";
import "./VideoSearchInput.css";

export interface VideoSearchInputProps {
  /** 検索実行時のコールバック */
  onSearch: (query: string) => void;
  /** 初期または現在の検索クエリ文字列 */
  currentQuery?: string;
  /** プレースホルダーテキスト */
  placeholder?: string;
  /** 入力無効化フラグ */
  disabled?: boolean;
}

/**
 * 🔍 YouTube動画キーワード検索バーコンポーネント
 * 検索履歴のサジェスト表示・個別削除・スマホのタッチ操作に対応
 */
export function VideoSearchInput({
  onSearch,
  currentQuery = "",
  placeholder = "YouTubeをキーワード検索...",
  disabled = false,
}: VideoSearchInputProps) {
  const [query, setQuery] = useState(currentQuery);
  const [prevCurrentQuery, setPrevCurrentQuery] = useState(currentQuery);
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // currentQuery が外部から変更された場合に同期（レンダー時同期パターン）
  if (currentQuery !== prevCurrentQuery) {
    setPrevCurrentQuery(currentQuery);
    setQuery(currentQuery);
  }

  // フォーカス時に最新の検索履歴を取得
  const reloadHistory = () => {
    setHistory(getSearchHistory());
  };

  // 外側クリック/タップ検知でサジェストを閉じる
  useEffect(() => {
    const handleOutsideClick = (e: globalThis.MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, []);

  const executeSearch = (targetQuery: string) => {
    const trimmed = targetQuery.trim();
    if (!trimmed) return;

    // 検索履歴を更新
    addSearchHistory(trimmed);
    reloadHistory();
    setIsFocused(false);
    onSearch(trimmed);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeSearch(query);
    } else if (e.key === "Escape") {
      setIsFocused(false);
    }
  };

  const handleSelectHistory = (itemQuery: string) => {
    setQuery(itemQuery);
    executeSearch(itemQuery);
  };

  const handleDeleteHistory = (e: MouseEvent, itemQuery: string) => {
    e.stopPropagation();
    const updated = removeSearchHistory(itemQuery);
    setHistory(updated);
  };

  const handleClearAllHistory = (e: MouseEvent) => {
    e.stopPropagation();
    clearSearchHistory();
    setHistory([]);
  };

  const handleClearInput = () => {
    setQuery("");
    setIsFocused(true);
  };

  const showSuggestions = isFocused && history.length > 0;

  return (
    <div className="video-search-container" ref={containerRef}>
      <form className="video-search-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="video-search-input"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            reloadHistory();
            setIsFocused(true);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {query && (
          <button
            type="button"
            className="video-search-clear-btn"
            onClick={handleClearInput}
            title="入力をクリア"
            aria-label="入力をクリア"
          >
            ×
          </button>
        )}

        <button
          type="submit"
          className="video-search-submit-btn"
          disabled={disabled || !query.trim()}
          aria-label="検索"
          title="検索"
        >
          🔎
        </button>
      </form>

      {/* 検索履歴サジェスト */}
      {showSuggestions && (
        <div className="search-history-dropdown">
          <div className="search-history-header">
            <span>検索履歴</span>
            <button
              type="button"
              className="search-history-clear-all"
              onClick={handleClearAllHistory}
            >
              すべて削除
            </button>
          </div>
          <ul className="search-history-list">
            {history.map((item) => (
              <li
                key={`${item.query}-${item.searchedAt}`}
                className="search-history-item"
                onClick={() => handleSelectHistory(item.query)}
              >
                <div className="search-history-item-left">
                  <span className="search-history-icon">🕒</span>
                  <span className="search-history-text">{item.query}</span>
                </div>
                <button
                  type="button"
                  className="search-history-delete-btn"
                  onClick={(e) => handleDeleteHistory(e, item.query)}
                  title="履歴から削除"
                  aria-label={`${item.query} を検索履歴から削除`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
