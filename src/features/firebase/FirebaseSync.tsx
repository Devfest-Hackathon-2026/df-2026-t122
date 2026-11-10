import { useState } from "react";
import type { FirebaseSyncProps } from "../../types/app";
import { auth, isFirebaseConfigured } from "./firebaseConfig";
import { addBadPostureSeconds } from "./postureRecordService";
import "./FirebaseSync.css";

interface ExtendedFirebaseSyncProps extends FirebaseSyncProps {
  latestBlinkCount?: number;
}

/**
 * 🔥 Firebase（Firestore保存）機能コンポーネント
 * ※ ログイン/ログアウトボタンは設定画面（SettingsModal）へ移動しました。
 */
export function FirebaseSync({
  rewardPoints,
  latestBlinkCount = 0,
}: ExtendedFirebaseSyncProps) {
  const [lastSavedPoints, setLastSavedPoints] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleTestIncrement = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const targetUserId = auth.currentUser?.uid;
      if (!targetUserId) throw new Error("ログインしてください。");
      const { dateId } = await addBadPostureSeconds(targetUserId, 10);
      setStatusMessage(`✅ ${dateId} に +10秒 保存成功！`);
    } catch (error) {
      console.error("Firestore保存エラー:", error);
      setStatusMessage("❌ 保存失敗（コンソールを確認）");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveScore = async () => {
    setIsSaving(true);
    try {
      if (isFirebaseConfigured) {
        console.log("🔥 Firestoreにデータを保存しました:", {
          rewardPoints,
          latestBlinkCount,
        });
      }
      setLastSavedPoints(rewardPoints);
    } catch (error) {
      console.error("保存に失敗しました:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="firebase-sync-panel" data-points={rewardPoints}>
      <button
        type="button"
        className="firebase-save-btn"
        onClick={handleSaveScore}
        disabled={isSaving}
        title={
          isFirebaseConfigured
            ? "Firestoreに保存"
            : "ローカル保存（Firebase未設定）"
        }
      >
        {isSaving
          ? "保存中..."
          : lastSavedPoints === rewardPoints
            ? "✓ 保存済"
            : `記録保存 (${rewardPoints}pt)`}
      </button>

      <button
        type="button"
        className="firebase-save-btn"
        onClick={handleTestIncrement}
        disabled={isSaving}
      >
        {isSaving ? "送信中..." : "🔥 DB保存テスト (+10秒)"}
      </button>

      {statusMessage && (
        <span className="firebase-status-msg">{statusMessage}</span>
      )}
    </div>
  );
}
