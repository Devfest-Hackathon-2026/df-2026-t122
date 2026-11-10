import type { WarningBannerProps } from "../../types/app";
import "./WarningBanner.css";

/**
 * ⚠️ 警告バナー（トースト・警告演出）機能コンポーネント
 * この機能の開発者は src/features/warning/ 内のファイルのみを編集することでコンフリクトを防げます。
 */
export function WarningBanner({
  isWarning,
  isPoseWarning,
  isTiltWarning,
  isDryEyeWarning,
}: WarningBannerProps & { isDryEyeWarning?: boolean }) {
  // どのセンサーが原因で警告が出ているかを分かりやすく表示
  let message = "⚠️ 姿勢が悪くなっています！首を上げましょう。";
  
  if (isDryEyeWarning) {
    message = "⚠️ 目が乾いています！まばたきをしましょう。";
  } else if (isPoseWarning && isTiltWarning) {
    message = "⚠️ 首が下がり、スマホも傾いています！姿勢を正しましょう。";
  } else if (isTiltWarning) {
    message = "⚠️ スマホの角度が低すぎます！目線の高さに上げましょう。";
  }

  return (
    <div className={`toast-banner ${isWarning ? "show" : ""}`}>
      {message}
    </div>
  );
}