import { formatDateId, type FirestoreDailyRecord } from "../features/firebase/postureRecordService";

export function summarizeRecords(
  records: Record<string, FirestoreDailyRecord>,
  today = new Date(),
) {
  const todayDoc = records[formatDateId(today)];
  const count = todayDoc?.goodStreakCount ?? 0;
  const minutes = todayDoc?.blinkRecordedMinutes ?? 0;
  const totalBlinks = todayDoc?.totalBlinks ?? 0;
  const summary = {
    dailyAvgEnduranceSec: count > 0
      ? Math.round((todayDoc?.goodStreakTotalSeconds ?? 0) / count) : 0,
    lastGoodStreakSeconds: todayDoc?.lastGoodStreakSeconds ?? 0,
    totalBlinksToday: totalBlinks,
    blinksPerMinute: minutes > 0 ? Number((totalBlinks / minutes).toFixed(1)) : 0,
    cameraRecordedMinutes: minutes,
  };
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const weekly = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - idx));
    const doc = records[formatDateId(date)];
    const streaks = doc?.goodStreakCount ?? 0;
    const mins = doc?.blinkRecordedMinutes ?? 0;
    return {
      dateLabel: `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`,
      dayOfWeek: dayNames[date.getDay()],
      avgTimeToTechNeckSec: streaks > 0
        ? Math.round((doc?.goodStreakTotalSeconds ?? 0) / streaks) : 0,
      avgBlinksPerMin: mins > 0 ? Number(((doc?.totalBlinks ?? 0) / mins).toFixed(1)) : 0,
      hasPostureData: streaks > 0,
    };
  });
  return { summary, weekly };
}
