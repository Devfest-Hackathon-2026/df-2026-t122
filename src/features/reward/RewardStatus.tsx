import { useEffect, useRef, useState } from "react";
import type { RewardStatusProps } from "../../types/app";
import "./RewardStatus.css";

//[やいまる追加]
import { isCurrentAuthSession, type AuthSession } from "../firebase/authSession";
import { addGoodStreakSeconds } from "../firebase/postureRecordService";

const SECONDS_PER_REWARD = 10; // 10秒間良い姿勢を維持するごとに+10pt獲得

/**
 * 🏆 リワード（ゲーミフィケーション・ポイント）機能コンポーネント
 * 良い姿勢を維持している時間をカウントし、一定時間ごとにリワードを付与します。
 * この機能の開発者は src/features/reward/ 内のファイルのみを編集することでコンフリクトを防げます。
 */
export function RewardStatus({
  session,
  isWarning,
  isSensorEnabled = true,
  rewardPoints,
  onPointsChange,
}: RewardStatusProps & { session: AuthSession }) {
  const [streakSeconds, setStreakSeconds] = useState(0);
  const pointsRef = useRef(rewardPoints);
  const onPointsChangeRef = useRef(onPointsChange);
  // [やいまる追加] 前回の isWarning 状態を保持する Ref
  const prevIsWarningRef = useRef<boolean>(isWarning);

  useEffect(() => {
    pointsRef.current = rewardPoints;
  }, [rewardPoints]);

  useEffect(() => {
    onPointsChangeRef.current = onPointsChange;
  }, [onPointsChange]);

  // 💡 [やいまる追加] isWarning の変化（false -> true）を検知して Firestore に保存
  useEffect(() => {
    const wasWarning = prevIsWarningRef.current;

    // isWarning が false から true に変わった瞬間（＝正常な姿勢からスマホ首に崩れた瞬間）
    if (!wasWarning && isWarning && isSensorEnabled) {
      const uid = session.uid;
      // 3秒以上の区間を保存（1回目の記録から確実に保存する）
      if (uid && isCurrentAuthSession(session) && streakSeconds >= 3) {
        addGoodStreakSeconds(uid, streakSeconds).catch((err) => {
          console.error("Failed to save good streak seconds:", err);
        });
      }
    }

    // 前回の状態を更新
    prevIsWarningRef.current = isWarning;
  }, [isWarning, isSensorEnabled, streakSeconds, session]);

  useEffect(() => {
    if (!isSensorEnabled) {
      return;
    }

    const timer = window.setInterval(() => {
      if (!isCurrentAuthSession(session)) return;
      if (isWarning) {
        setStreakSeconds(0);
        return;
      }

      setStreakSeconds((prev) => {
        const next = prev + 1;
        if (next % SECONDS_PER_REWARD === 0) {
          onPointsChangeRef.current(pointsRef.current + 10);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isWarning, isSensorEnabled, session]);

  const progressPercent =
    ((streakSeconds % SECONDS_PER_REWARD) / SECONDS_PER_REWARD) * 100;

  return (
    <div className="reward-status-badge" data-warning={isWarning}>
      <div className="reward-status-top">
        <span className="reward-points">🏆 {rewardPoints} pt</span>
        <span className="reward-streak">
          {!isSensorEnabled
            ? "⏸ センサー停止中"
            : isWarning
              ? "姿勢リセット中..."
              : `継続 ${streakSeconds}秒`}
        </span>
      </div>
      <div className="reward-progress-track">
        <div
          className="reward-progress-fill"
          style={{
            width: `${!isSensorEnabled || isWarning ? 0 : progressPercent}%`,
          }}
        />
      </div>
    </div>
  );
}
