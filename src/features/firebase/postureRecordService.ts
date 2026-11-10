import {
  doc,
  setDoc,
  getDoc,
  increment,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { isCurrentAuthSession, type AuthSession } from "./authSession";
import { CAMERA_SLOT_MS, mergeCameraSlots, type CameraMeasurementBatch } from "../pose/cameraMeasurement";

// Reject guest/shared IDs and stale callers before starting a Firestore operation.
function assertCurrentUser(userId: string): void {
  if (!userId || auth.currentUser?.uid !== userId) {
    throw new Error("記録の読み書きには現在のログインユーザーのUIDが必要です。");
  }
}

/** 指定したDateオブジェクトを YYYY-MM-DD 形式で取得 */
export function formatDateId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** ローカルタイムゾーンで今日の日付を YYYY-MM-DD 形式で取得 */
export function getTodayDateString(): string {
  return formatDateId(new Date());
}

/**
 * Firestoreの users/{userId}/daily_records/{今日の日付} に対して
 * badPostureSeconds を指定秒数（デフォルト10秒）加算（increment）する
 */
export async function addBadPostureSeconds(
  userId: string,
  seconds = 10
): Promise<{ dateId: string }> {
  assertCurrentUser(userId);
  const dateId = getTodayDateString();
  const recordRef = doc(db, "users", userId, "daily_records", dateId);

  await setDoc(
    recordRef,
    {
      badPostureSeconds: increment(seconds),
      date: dateId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { dateId };
}

/** [やいまる追加] 良い姿勢の連続保持時間を Firestore に加算保存する */
export async function addGoodStreakSeconds(
  userId: string,
  seconds: number
): Promise<{ dateId: string }> {
  assertCurrentUser(userId);
  const dateId = getTodayDateString();
  const recordRef = doc(db, "users", userId, "daily_records", dateId);

  await setDoc(
    recordRef,
    {
      goodStreakTotalSeconds: increment(seconds),
      goodStreakCount: increment(1),
      lastGoodStreakSeconds: seconds,
      date: dateId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { dateId };
}

/** Save actual face-detection time; UTC occupancy masks deduplicate all devices. */
export async function saveCameraMeasurement(
  session: AuthSession,
  batch: CameraMeasurementBatch,
): Promise<void> {
  if (!session.uid || !isCurrentAuthSession(session)) return;
  assertCurrentUser(session.uid);
  // Split at both local and UTC midnight. The UTC ledger remains shared even
  // when two devices use different local timezones for their daily summaries.
  const groups = new Map<string, { utcDate: string; dateId: string; batch: CameraMeasurementBatch }>();
  for (const slot of batch.slots) {
    if (!Number.isSafeInteger(slot) || slot < 0) throw new Error("Invalid camera time slot");
    const date = new Date(slot * CAMERA_SLOT_MS);
    const utcDate = date.toISOString().slice(0, 10);
    const dateId = formatDateId(date);
    const key = `${utcDate}/${dateId}`;
    let group = groups.get(key);
    if (!group) {
      group = { utcDate, dateId, batch: { slots: [], blinks: {} } };
      groups.set(key, group);
    }
    group.batch.slots.push(slot);
    group.batch.blinks[slot] = batch.blinks[slot] ?? 0;
  }
  for (const group of groups.values()) {
    if (!isCurrentAuthSession(session)) return;
    const ledgerRef = doc(db, "users", session.uid, "camera_measurements", group.utcDate);
    const recordRef = doc(db, "users", session.uid, "daily_records", group.dateId);
    await runTransaction(db, async (transaction) => {
      if (!isCurrentAuthSession(session)) throw new Error("Camera measurement session ended");
      const ledger = await transaction.get(ledgerRef);
      const { masks, addedSeconds, addedBlinks } = mergeCameraSlots(
        (ledger.data()?.slots ?? {}) as Record<string, string>, group.batch,
      );
      if (addedSeconds === 0) return;
      const record = await transaction.get(recordRef);
      if (!isCurrentAuthSession(session)) throw new Error("Camera measurement session ended");
      transaction.set(ledgerRef, { slots: masks, updatedAt: serverTimestamp() });
      transaction.set(recordRef, {
        // Keep historical minutes intact; retries and overlapping devices add only new slots.
        blinkRecordedMinutes: (record.data()?.blinkRecordedMinutes ?? 0) + addedSeconds / 60,
        totalBlinks: (record.data()?.totalBlinks ?? 0) + addedBlinks,
        lastMinuteBlinks: addedBlinks,
        date: group.dateId,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
  }
}

/** Firestoreの daily_records ドキュメント構造 */
export interface FirestoreDailyRecord {
  date: string;
  goodStreakTotalSeconds?: number;
  goodStreakCount?: number;
  lastGoodStreakSeconds?: number;
  badPostureSeconds?: number;
  totalBlinks?: number;
  blinkRecordedMinutes?: number;
  lastMinuteBlinks?: number;
}

/** 過去7日間分の daily_records を Firestore から取得する */
export async function fetchWeeklyPostureRecords(
  userId: string
): Promise<Record<string, FirestoreDailyRecord>> {
  assertCurrentUser(userId);
  const result: Record<string, FirestoreDailyRecord> = {};
  const today = new Date();

  const promises = Array.from({ length: 7 }, async (_, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - idx));
    const dateId = formatDateId(d);
    const ref = doc(db, "users", userId, "daily_records", dateId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      result[dateId] = snap.data() as FirestoreDailyRecord;
    }
  });

  await Promise.all(promises);
  return result;
}
