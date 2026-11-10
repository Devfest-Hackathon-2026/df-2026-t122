import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuthSession, isCurrentAuthSession, type AuthSession } from "../features/firebase/authSession";
import { summarizeRecords } from "./recordSummary";
import {
  fetchWeeklyPostureRecords,
  type FirestoreDailyRecord,
} from "../features/firebase/postureRecordService";
import "./RecordDashboard.css";

export interface RecordDashboardProps {
  defaultOpen?: boolean;
  onClose?: () => void;
}

/** 秒数を「○分○○秒」形式にフォーマットするヘルパー */
function formatDuration(seconds: number): {
  minutes: number;
  remSeconds: number;
  text: string;
} {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remSeconds = rounded % 60;
  return {
    minutes,
    remSeconds,
    text: `${minutes}分${String(remSeconds).padStart(2, "0")}秒`,
  };
}

/**
 * 📊 姿勢＆瞬き記録ダッシュボード（完全独立コンポーネント）
 * - 既存ファイルを一切変更せず単体で動作します。
 * - 外部グラフライブラリ不要（package.jsonのコンフリクトゼロ）でSVG＋CSSアニメーショングラフを描画します。
 */
export function RecordDashboard({
  defaultOpen = false,
  onClose,
}: RecordDashboardProps) {
  // ダッシュボード表示/非表示の開閉状態
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  // 「1日の平均」と「直近の姿勢維持時間」の表示切り替え
  const [summaryScope, setSummaryScope] = useState<"daily" | "recent">("daily");
  const session = useAuthSession();
  const [result, setResult] = useState<{
    session: AuthSession;
    records: Record<string, FirestoreDailyRecord>;
    error: boolean;
  } | null>(null);
  // Ownership is checked during render, so another account never sees cached data.
  const ownedResult = result?.session === session ? result : null;
  const { summary: activeSummary, weekly: activeWeekly } = summarizeRecords(
    ownedResult?.records ?? {},
  );
  const hasFirestoreData = Object.keys(ownedResult?.records ?? {}).length > 0;
  const [selectedDayIdx, setSelectedDayIdx] = useState(6);

  useEffect(() => {
    if (!isOpen || !session.uid) return;
    let cancelled = false;
    fetchWeeklyPostureRecords(session.uid)
      .then((records) => {
        if (!cancelled && isCurrentAuthSession(session)) {
          setResult({ session, records, error: false });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && isCurrentAuthSession(session)) {
          console.error("Firestoreダッシュボード取得エラー:", err);
          setResult({ session, records: {}, error: true });
        }
      });
    return () => { cancelled = true; };
  }, [isOpen, session]);

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
  };

  // 閉じているときは画面下部バー内の「📊 記録」ボタンのみを表示
  if (!isOpen) {
    return (
      <button
        type="button"
        className="rd-floating-open-btn"
        onClick={() => setIsOpen(true)}
      >
        📊 記録
      </button>
    );
  }

  // 表示する維持時間（秒）
  const activeEnduranceSec =
    summaryScope === "daily"
      ? activeSummary.dailyAvgEnduranceSec
      : activeSummary.lastGoodStreakSeconds;
  const formattedEndurance = formatDuration(activeEnduranceSec);

  // 前日比の計算
  const yesterdaySec =
    activeWeekly.length >= 2
      ? activeWeekly[activeWeekly.length - 2].avgTimeToTechNeckSec
      : activeEnduranceSec;
  const diffFromYesterdaySec = activeEnduranceSec - yesterdaySec;
  const diffPercent =
    yesterdaySec > 0
      ? Math.round((diffFromYesterdaySec / yesterdaySec) * 100)
      : 0;

  // 目標時間（5分＝300秒）に対する達成率
  const TARGET_ENDURANCE_SEC = 300;
  const enduranceGoalPercent = Math.min(
    100,
    Math.round((activeEnduranceSec / TARGET_ENDURANCE_SEC) * 100),
  );

  // 瞬き回数の健康状態判定（一般的に15回/分以上が理想、10回未満はドライアイ注意）
  const blinkStatus =
    activeSummary.cameraRecordedMinutes === 0
      ? { label: "記録なし", tone: "good" as const }
      : activeSummary.blinksPerMinute >= 15
      ? { label: "良好（潤いキープ）", tone: "good" as const }
      : activeSummary.blinksPerMinute >= 10
        ? { label: "やや少なめ（意識して瞬きを）", tone: "warn" as const }
        : { label: "要注意（画面に集中しすぎ）", tone: "bad" as const };

  // 週間グラフ用の最大値計算（1分単位で切り上げ、最小でも6分＝360秒を天井にする）
  const rawMaxSec = Math.max(
    360,
    ...activeWeekly.map((r) => r.avgTimeToTechNeckSec),
  );
  const maxAxisMinutes = Math.ceil(rawMaxSec / 60);
  const maxWeeklySec = maxAxisMinutes * 60;

  // 左側の縦軸（分）メモリ配列（例: [0, 1, 2, 3, 4, 5, 6]）
  const yAxisMinuteTicks = Array.from(
    { length: maxAxisMinutes + 1 },
    (_, i) => i,
  );

  const measuredDays = activeWeekly.filter((record) => record.hasPostureData);
  const weeklyAvgSec =
    measuredDays.length > 0
      ? Math.round(
          measuredDays.reduce((acc, r) => acc + r.avgTimeToTechNeckSec, 0) /
            measuredDays.length,
        )
      : 0;

  const selectedDayRecord =
    activeWeekly[selectedDayIdx] ?? activeWeekly[activeWeekly.length - 1];

  // SVG折れ線オーバーレイ用の座標計算（viewBox: 0 0 700 100, 上端0〜下端100がバートラックと完全一致）
  const svgPoints = activeWeekly.map((record, idx) => {
    const colCount = activeWeekly.length || 1;
    // 7カラムそれぞれの中心X座標 ((idx + 0.5) / 7 * 700)
    const x = ((idx + 0.5) / colCount) * 700;
    const ratio = Math.min(1, record.avgTimeToTechNeckSec / maxWeeklySec);
    const y = 100 - ratio * 100;
    return { x, y, record };
  });

  const polylinePointsStr = svgPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPointsStr =
    svgPoints.length > 0
      ? `${svgPoints[0].x},100 ${polylinePointsStr} ${
          svgPoints[svgPoints.length - 1].x
        },100`
      : "";

  return (
    <>
      <button
        type="button"
        className="rd-floating-open-btn"
        onClick={() => setIsOpen(true)}
      >
        📊 記録
      </button>
      {createPortal(
        <section className="rd-wrapper" aria-label="姿勢・瞬き記録ダッシュボード">
          <div className="rd-container">
        {/* ================= ヘッダー ================= */}
        <header className="rd-header">
          <div className="rd-header-left">
            <span className="rd-badge">
              {hasFirestoreData
                ? "🔥 FIRESTORE LIVE DATA"
                : !session.uid ? "ログインして記録を確認"
                : !ownedResult ? "記録を読み込み中"
                : ownedResult.error ? "記録を取得できませんでした"
                : "記録なし"}
            </span>
            <h2 className="rd-title">📊 姿勢・瞬きヘルスケア記録</h2>
            <p className="rd-subtitle">
              正常な姿勢をキープできた時間と、カメラ計測中の瞬き頻度のレポート
            </p>
          </div>

          <div className="rd-header-actions">
            {/* 今日の平均 / 直近の姿勢維持時間の切り替えセグメント */}
            <div className="rd-scope-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={summaryScope === "daily"}
                className={`rd-scope-tab ${
                  summaryScope === "daily" ? "active" : ""
                }`}
                onClick={() => setSummaryScope("daily")}
              >
                今日の平均
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={summaryScope === "recent"}
                className={`rd-scope-tab ${
                  summaryScope === "recent" ? "active" : ""
                }`}
                onClick={() => setSummaryScope("recent")}
              >
                直近の姿勢維持時間
              </button>
            </div>

            <button
              type="button"
              className="rd-close-btn"
              onClick={handleClose}
              aria-label="ダッシュボードを閉じる"
            >
              ✕ 閉じる
            </button>
          </div>
        </header>

        {/* ================= 1. 今日のサマリー表示 ================= */}
        <div className="rd-summary-grid">
          {/* カード①：スマホ首になるまでの平均時間 */}
          <article className="rd-card rd-card-primary">
            <div className="rd-card-top">
              <div className="rd-card-icon-wrap posture">🧘</div>
              <div className="rd-card-meta">
                <span className="rd-card-label">
                  {summaryScope === "daily"
                    ? "今日の平均維持時間（正常姿勢 → スマホ首まで）"
                    : "直近の姿勢維持時間"}
                </span>
                <span className="rd-trend-pill positive">
                  {summaryScope === "daily" && activeWeekly[6].hasPostureData && activeWeekly[5].hasPostureData
                    ? `${diffPercent >= 0 ? "▲ +" : "▼ "}${diffPercent}% 前日比`
                    : "比較データなし"}
                </span>
              </div>
            </div>

            <div className="rd-metric-main">
              <span className="rd-metric-number">
                {formattedEndurance.minutes}
              </span>
              <span className="rd-metric-unit">分</span>
              <span className="rd-metric-number">
                {String(formattedEndurance.remSeconds).padStart(2, "0")}
              </span>
              <span className="rd-metric-unit">秒</span>
            </div>

            <div className="rd-goal-progress">
              <div className="rd-goal-header">
                <span>目標維持ライン（5分00秒）への達成度</span>
                <strong>{enduranceGoalPercent}%</strong>
              </div>
              <div className="rd-progress-track">
                <div
                  className="rd-progress-fill posture"
                  style={{ width: `${enduranceGoalPercent}%` }}
                />
              </div>
            </div>

            <p className="rd-card-footnote">
              💡
              保存済みの姿勢維持区間から集計しています（カメラ計測時間:{" "}
              {Number(activeSummary.cameraRecordedMinutes.toFixed(2))}分）
            </p>
          </article>

          {/* カード②：カメラ計測中の瞬きの回数 */}
          <article className="rd-card rd-card-secondary">
            <div className="rd-card-top">
              <div className="rd-card-icon-wrap blink">👁️</div>
              <div className="rd-card-meta">
                <span className="rd-card-label">
                  カメラ計測中の瞬き回数（ドライアイ・凝視防止）
                </span>
                <span className={`rd-status-pill ${blinkStatus.tone}`}>
                  {blinkStatus.label}
                </span>
              </div>
            </div>

            <div className="rd-blink-metrics-row">
              <div className="rd-metric-block">
                <span className="rd-sub-label">1分あたり平均</span>
                <div>
                  <span className="rd-metric-number">
                    {activeSummary.blinksPerMinute.toFixed(1)}
                  </span>
                  <span className="rd-metric-unit">回 / 分</span>
                </div>
              </div>

              <div className="rd-metric-divider" />

              <div className="rd-metric-block">
                <span className="rd-sub-label">今日の合計瞬き数</span>
                <div>
                  <span className="rd-metric-number secondary">
                    {activeSummary.totalBlinksToday.toLocaleString()}
                  </span>
                  <span className="rd-metric-unit">回</span>
                </div>
              </div>
            </div>

            <div className="rd-goal-progress">
              <div className="rd-goal-header">
                <span>理想の瞬き頻度（15〜20回/分）</span>
                <strong>
                  {Math.min(
                    100,
                    Math.round((activeSummary.blinksPerMinute / 18) * 100),
                  )}
                  %
                </strong>
              </div>
              <div className="rd-progress-track">
                <div
                  className="rd-progress-fill blink"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((activeSummary.blinksPerMinute / 18) * 100),
                    )}%`,
                  }}
                />
              </div>
            </div>

            <p className="rd-card-footnote">
              💡
              スマホ画面を凝視すると瞬きが通常の1/3に減り、眼精疲労や首こりの原因になります
            </p>
          </article>
        </div>

        {/* ================= 2. 1週間の平均時間推移 ================= */}
        <article className="rd-card rd-weekly-card">
          <div className="rd-weekly-header">
            <div>
              <h3 className="rd-weekly-title">
                📈 過去7日間「スマホ首になるまでの時間」の推移
              </h3>
              <p className="rd-weekly-desc">
                バーが長い日ほど、良い姿勢を長くキープできています（7日間平均:{" "}
                <strong>{formatDuration(weeklyAvgSec).text}</strong>）
              </p>
            </div>

            {selectedDayRecord && (
              <div className="rd-selected-day-box">
                <span className="rd-selected-day-date">
                  {selectedDayRecord.dateLabel}（{selectedDayRecord.dayOfWeek}
                  ）の記録
                </span>
                <div className="rd-selected-day-stats">
                  <span>
                    🧘 平均維持:{" "}
                    <strong>
                      {
                        formatDuration(selectedDayRecord.avgTimeToTechNeckSec)
                          .text
                      }
                    </strong>
                  </span>
                  <span>
                    👁️ 瞬き:{" "}
                    <strong>{selectedDayRecord.avgBlinksPerMin}回/分</strong>
                  </span>
                  <span>
                    🎬 視聴:{" "}
                    <strong>未計測</strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 視覚的トレンド：左Y軸（分）＋SVG折れ線＋インタラクティブ棒グラフ */}
          <div className="rd-chart-area">
            {/* 左端：時間（分）を表す縦軸 */}
            <div className="rd-y-axis" aria-hidden="true">
              {yAxisMinuteTicks.map((min) => {
                const isTarget = min * 60 === TARGET_ENDURANCE_SEC;
                const bottomPercent = (min / maxAxisMinutes) * 100;
                return (
                  <span
                    key={min}
                    className={`rd-y-tick ${isTarget ? "target" : ""}`}
                    style={{ bottom: `${bottomPercent}%` }}
                  >
                    {isTarget ? `目標 ${min}分` : `${min}分`}
                  </span>
                );
              })}
            </div>

            {/* 右側：プロット領域（グリッド線・SVGトレンド・7日間バー） */}
            <div className="rd-plot-column">
              <div className="rd-plot-backdrop">
                {/* 横グリッド線＆5分目標ライン（バートラックの高さと完全一致） */}
                {yAxisMinuteTicks.map((min) => {
                  const isTarget = min * 60 === TARGET_ENDURANCE_SEC;
                  const bottomPercent = (min / maxAxisMinutes) * 100;
                  return (
                    <div
                      key={min}
                      className={`rd-grid-line ${isTarget ? "target" : ""}`}
                      style={{ bottom: `${bottomPercent}%` }}
                    />
                  );
                })}

                {/* SVGトレンドライン（バートラック領域に完全一致） */}
                <svg
                  className="rd-trend-svg"
                  viewBox="0 0 700 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="rdAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {areaPointsStr && (
                    <polygon points={areaPointsStr} fill="url(#rdAreaGrad)" />
                  )}
                  {polylinePointsStr && (
                    <polyline
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={polylinePointsStr}
                    />
                  )}
                </svg>
              </div>

              {/* 7日間の棒グラフ */}
              <div className="rd-bars-grid">
                {activeWeekly.map((record, index) => {
                  const heightPercent = Math.min(
                    100,
                    Math.round(
                      (record.avgTimeToTechNeckSec / maxWeeklySec) * 100,
                    ),
                  );
                  const isSelected = index === selectedDayIdx;
                  const isToday = index === activeWeekly.length - 1;
                  const formatted = formatDuration(record.avgTimeToTechNeckSec);

                  return (
                    <button
                      key={record.dateLabel}
                      type="button"
                      className={`rd-bar-column ${isSelected ? "selected" : ""} ${
                        isToday ? "today" : ""
                      }`}
                      onClick={() => setSelectedDayIdx(index)}
                    >
                      <span className="rd-bar-value">
                        {formatted.minutes}:
                        {String(formatted.remSeconds).padStart(2, "0")}
                      </span>

                      <div className="rd-bar-track">
                        <div
                          className="rd-bar-fill"
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>

                      <span className="rd-bar-day">
                        {record.dayOfWeek}
                        {isToday && <small className="rd-today-dot">今日</small>}
                      </span>
                      <span className="rd-bar-date">{record.dateLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 日別の詳細プログレスバー一覧（直感的な比較リスト） */}
          <div className="rd-horizontal-list">
            {activeWeekly.map((record, index) => {
              const widthPercent = Math.min(
                100,
                Math.round((record.avgTimeToTechNeckSec / maxWeeklySec) * 100),
              );
              const isSelected = index === selectedDayIdx;
              return (
                <div
                  key={record.dateLabel}
                  className={`rd-h-row ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedDayIdx(index)}
                >
                  <div className="rd-h-date">
                    <strong>
                      {record.dateLabel} ({record.dayOfWeek})
                    </strong>
                  </div>
                  <div className="rd-h-bar-wrap">
                    <div
                      className="rd-h-bar-fill"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                  <div className="rd-h-metrics">
                    <span className="rd-h-time">
                      {formatDuration(record.avgTimeToTechNeckSec).text}
                    </span>
                    <span className="rd-h-blink">
                      👁️ {record.avgBlinksPerMin}回/分
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>
    </section>,
    document.body,
  )}
    </>
  );
}

export default RecordDashboard;
