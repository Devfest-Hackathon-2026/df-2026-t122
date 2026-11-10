import { useState, useEffect } from "react";
import {
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import { signInWithGoogleAccount } from "./googleSignIn";

export const Login = () => {
  // ログインしているユーザーの情報を保存する状態
  const [user, setUser] = useState<User | null>(null);

  // 画面が表示された時に、現在のログイン状態を確認する
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe(); // クリーンアップ
  }, []);

  // Googleログイン処理
  const loginWithGoogle = async () => {
    try {
      await signInWithGoogleAccount();
    } catch (error) {
      console.error("ログインエラー:", error);
      alert("ログインに失敗しました。");
    }
  };

  // ログアウト処理
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("ログアウトエラー:", error);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
      {user ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            width: "100%",
            backgroundColor: "rgba(22, 23, 29, 0.92)",
            border: "1px solid #2e303a",
            padding: "8px 12px",
            borderRadius: "8px",
            color: "white",
            fontSize: "12px",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <img
              src={user.photoURL || ""}
              alt="アイコン"
              style={{ width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0 }}
              referrerPolicy="no-referrer"
            />
            <span
              style={{
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.displayName}
            </span>
          </div>
          <button
            onClick={logout}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              borderRadius: "6px",
              border: "1px solid #3f4252",
              background: "transparent",
              color: "#d1d5db",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ログアウト
          </button>
        </div>
      ) : (
        <button
          onClick={loginWithGoogle}
          style={{
            width: "100%",
            padding: "10px 14px",
            backgroundColor: "#4285f4",
            color: "white",
            fontSize: "13px",
            fontWeight: "bold",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          Googleでログイン
        </button>
      )}
    </div>
  );
};
