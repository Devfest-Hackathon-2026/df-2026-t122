import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import type { HeaderControlsProps } from "../../types/app";
import { VideoSearchInput } from "../player/components/VideoSearchInput";
import "./HeaderControls.css";

/**
 * 🧭 ヘッダー・操作バー機能コンポーネント
 * - 左側: ログインしたGoogleアカウントのアイコン（未ログイン時はゲストアイコン、タップで設定・アカウント画面へ）
 * - 右側: YouTubeキーワード検索バー（サジェスト・履歴機能付き）
 */
export function HeaderControls({
  onSearch,
  searchQuery,
  onOpenSettings,
  onOpenWelcome,
}: HeaderControlsProps) {
  const [user, setUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="top-bar">
      <button
        type="button"
        className={`header-account-avatar-btn ${user ? "logged-in" : "guest"}`}
        onClick={onOpenSettings}
        title={
          user
            ? `${user.displayName || "Googleアカウント"}（タップして設定を開く）`
            : "未ログイン（タップして設定画面からGoogleログイン）"
        }
        aria-label={
          user
            ? `${user.displayName || "Googleアカウント"}の設定を開く`
            : "アカウント設定を開く"
        }
      >
        {user && user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || "Googleアイコン"}
            className="header-account-avatar-img"
            referrerPolicy="no-referrer"
          />
        ) : user ? (
          <span className="header-account-initial">
            {(user.displayName || user.email || "G").charAt(0).toUpperCase()}
          </span>
        ) : (
          <span className="header-account-guest-icon" aria-hidden="true">
            👤
          </span>
        )}
      </button>

      <button
        type="button"
        className="header-help-btn"
        onClick={onOpenWelcome}
        aria-label="アプリの使い方を表示"
        title="neck-appの使い方"
      >
        <span aria-hidden="true">?</span> 使い方
      </button>

      <div className="header-search-wrapper">
        <VideoSearchInput
          onSearch={onSearch}
          currentQuery={searchQuery}
          placeholder="YouTubeを検索..."
        />
      </div>
    </header>
  );
}
