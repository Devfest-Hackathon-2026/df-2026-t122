import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain, hooks, sessionHarness, jsx, nodes, text, tick } from './helpers.mjs';

const formatDateId = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const summary = load('src/components/recordSummary.ts', { '../features/firebase/postureRecordService': { formatDateId } });

test('empty/missing/zero fields never generate sample metrics; real data aggregates correctly', () => {
  const date = new Date(2026, 10, 10);
  const empty = summary.summarizeRecords({}, date);
  assert.deepEqual(Object.values(plain(empty.summary)), [0, 0, 0, 0, 0]);
  assert.equal(empty.weekly.length, 7);
  assert.ok(empty.weekly.every(day => day.avgTimeToTechNeckSec === 0 && day.avgBlinksPerMin === 0));
  for (const doc of [{}, { goodStreakCount: 0, blinkRecordedMinutes: 0 }]) {
    assert.deepEqual(plain(summary.summarizeRecords({ '2026-11-10': doc }, date).summary), plain(empty.summary));
  }
  const actual = summary.summarizeRecords({ '2026-11-10': {
    totalBlinks: 221, blinkRecordedMinutes: 10,
    goodStreakTotalSeconds: 90, goodStreakCount: 3, lastGoodStreakSeconds: 20,
  } }, date);
  assert.deepEqual(plain(actual.summary), {
    dailyAvgEnduranceSec: 30, lastGoodStreakSeconds: 20, totalBlinksToday: 221,
    blinksPerMinute: 22.1, cameraRecordedMinutes: 10,
  });
  assert.equal(actual.weekly[6].avgTimeToTechNeckSec, 30);
  const yesterdayOnly = summary.summarizeRecords({ '2026-11-09': {
    totalBlinks: 221, blinkRecordedMinutes: 10,
  } }, date);
  assert.equal(yesterdayOnly.summary.totalBlinksToday, 0);
  assert.equal(yesterdayOnly.weekly[5].avgBlinksPerMin, 22.1);
});

test('open dashboard clears on switch/logout, handles empty/error results, and rejects delayed old responses', async () => {
  const react = hooks();
  const session = sessionHarness(react);
  const requests = [];
  const Dashboard = load('src/components/RecordDashboard.tsx', {
    react, 'react-dom': { createPortal: tree => tree }, 'react/jsx-runtime': jsx,
    '../features/firebase/authSession': session.api,
    './recordSummary': summary,
    '../features/firebase/postureRecordService': {
      fetchWeeklyPostureRecords(uid) { return new Promise((resolve, reject) => requests.push({ uid, resolve, reject })); },
    },
  }, { document: { body: {} } }).RecordDashboard;
  const render = () => { react.begin(); const tree = Dashboard({ defaultOpen: true }); react.flush(); return tree; };
  const records = { [formatDateId(new Date())]: { totalBlinks: 221, blinkRecordedMinutes: 10 } };
  session.change('A'); render();
  requests[0].resolve(records); await tick();
  assert.match(text(render()), /221/);
  session.change('B');
  assert.doesNotMatch(text(render()), /221/);
  requests[1].resolve({}); await tick();
  assert.match(text(render()), /記録なし/);
  assert.doesNotMatch(text(render()), /221/);
  session.change('A'); render(); // Keep A request pending while switching to B.
  session.change('B'); render();
  requests[3].resolve({}); await tick();
  requests[2].resolve(records); await tick();
  assert.doesNotMatch(text(render()), /221/);
  session.change('A'); render();
  requests[4].resolve(records); await tick();
  assert.match(text(render()), /221/);
  session.change(null);
  assert.doesNotMatch(text(render()), /221/);
  assert.match(text(render()), /ログインして記録を確認/);
  assert.equal(requests.length, 5, 'Guests must not fetch shared records');
  session.change('C'); render();
  requests[5].reject(new Error('test read failure')); await tick();
  assert.match(text(render()), /記録を取得できませんでした/);
  assert.doesNotMatch(text(render()), /221/);
});

test('App remounts measurement owners at UID boundaries, rejects old blink callbacks, preserves player', () => {
  const react = hooks();
  const session = sessionHarness(react);
  const saved = [];
  const dependencies = {
    react, 'react/jsx-runtime': jsx,
    './features/onboarding/SetupModal': { SetupModal: 'SetupModal' },
    './features/onboarding/setupStorage': { readSetupChoices: () => ({cameraEnabled:true,tiltEnabled:true}), saveSetupChoices() {} },
    './features/onboarding/WelcomeModal': { WelcomeModal: 'WelcomeModal' },
    './features/onboarding/welcomeStorage': { hasSeenWelcome: () => true, markWelcomeSeen() {} },
    './features/firebase/authSession': session.api,
    './features/firebase/postureRecordService': { saveCameraMeasurement(session, batch) { saved.push({ uid:session.uid, count:batch.blinks[0] }); return Promise.resolve(); } },
  };
  for (const [path, name] of [
    ['header/HeaderControls','HeaderControls'], ['warning/WarningBanner','WarningBanner'],
    ['player/VideoPlayer','VideoPlayer'], ['reward/RewardStatus','RewardStatus'],
    ['pose/PoseDetector','PoseDetector'], ['tilt/TiltDetector','TiltDetector'], ['settings/SettingsModal','SettingsModal'],
  ]) dependencies[`./features/${path}`] = { [name]: name };
  dependencies['./components/RecordDashboard'] = { RecordDashboard: 'RecordDashboard' };
  const App = load('src/App.tsx', dependencies).default;
  const render = () => { react.begin(); return nodes(App()); };
  const find = (tree, type) => tree.find(node => node.type === type);
  session.change('A'); const first = render();
  const oldPose = find(first, 'PoseDetector');
  oldPose.props.onMeasurementRecorded({ slots: [0], blinks: { 0:12 } });
  session.change('B'); const second = render();
  assert.notEqual(find(second, 'PoseDetector').key, oldPose.key);
  assert.notEqual(find(second, 'RewardStatus').key, find(first, 'RewardStatus').key);
  assert.deepEqual(plain(find(second, 'VideoPlayer').props), plain(find(first, 'VideoPlayer').props));
  assert.equal(find(second, 'VideoPlayer').key, find(first, 'VideoPlayer').key);
  oldPose.props.onMeasurementRecorded({ slots: [0], blinks: { 0:100 } });
  find(second, 'PoseDetector').props.onMeasurementRecorded({ slots: [0], blinks: { 0:3 } });
  session.change(null); const guest = render();
  find(guest, 'PoseDetector').props.onMeasurementRecorded({ slots: [0], blinks: { 0:100 } });
  session.change('A'); render();
  oldPose.props.onMeasurementRecorded({ slots: [0], blinks: { 0:100 } }); // A → B → logout → A is a new session.
  assert.deepEqual(saved, [{ uid:'A', count:12 }, { uid:'B', count:3 }]);
});

test('Firestore service refuses guests and mismatched UIDs, and only reads/writes UID-scoped documents', async () => {
  const auth = { currentUser: null };
  const reads = [], writes = [];
  const service = load('src/features/firebase/postureRecordService.ts', {
    './firebaseConfig': { auth, db: {} },
    './authSession': { isCurrentAuthSession: session => session.uid === auth.currentUser?.uid },
    '../pose/cameraMeasurement': load('src/features/pose/cameraMeasurement.ts', {}),
    'firebase/firestore': {
      doc: (_db, ...path) => path,
      setDoc: async (path, data) => { writes.push({ path, data }); },
      getDoc: async path => { reads.push(path); return { exists: () => false }; },
      increment: value => value, serverTimestamp: () => 'timestamp',
    },
  });
  for (const call of [() => service.addBadPostureSeconds('user_001'), () => service.fetchWeeklyPostureRecords('A')]) {
    await assert.rejects(call);
  }
  auth.currentUser = { uid: 'A' };
  await assert.rejects(() => service.addGoodStreakSeconds('B', 90));
  await service.addBadPostureSeconds('A', 10);
  await service.addGoodStreakSeconds('A', 30);
  await service.fetchWeeklyPostureRecords('A');
  assert.equal(writes.length, 2);
  assert.equal(reads.length, 7);
  for (const path of [...reads, ...writes.map(write => write.path)]) {
    assert.deepEqual(plain(path.slice(0,3)), ['users','A','daily_records']);
  }
});

test('partially measured posture streak cannot be saved or earn points after its session ends', () => {
  let react = hooks();
  const session = sessionHarness(react);
  const saves = [], points = [], timers = new Map();
  let timerId = 0;
  const Reward = load('src/features/reward/RewardStatus.tsx', {
    react: {
      useState: (...args) => react.useState(...args),
      useEffect: (...args) => react.useEffect(...args),
      useRef: (...args) => react.useRef(...args),
    },
    'react/jsx-runtime': jsx,
    '../firebase/authSession': session.api,
    '../firebase/postureRecordService': {
      addGoodStreakSeconds(uid, seconds) { saves.push({ uid, seconds }); return Promise.resolve(); },
    },
  }, { window: {
    setInterval(callback) { timers.set(++timerId, callback); return timerId; },
    clearInterval(id) { timers.delete(id); },
  } }).RewardStatus;
  session.change('A');
  const ownerA = session.api.useAuthSession();
  const render = (owner, warning = false) => {
    react.begin();
    const tree = Reward({ session: owner, isWarning: warning, rewardPoints: 0, onPointsChange: value => points.push(value) });
    react.flush();
    return tree;
  };
  render(ownerA);
  for (let i = 0; i < 5; i++) { timers.forEach(tick => tick()); render(ownerA); }
  session.change('B');
  timers.forEach(tick => tick());
  render(ownerA, true);
  assert.deepEqual(saves, []);
  assert.deepEqual(points, []);
  // React's changed key creates fresh hook state for the new owner.
  timers.clear(); react = hooks();
  const ownerB = session.api.useAuthSession();
  assert.match(text(render(ownerB)), /継続 0秒/);
  for (let i = 0; i < 3; i++) { timers.forEach(tick => tick()); render(ownerB); }
  render(ownerB, true);
  assert.deepEqual(saves, [{ uid: 'B', seconds: 3 }]);
  session.change('C'); timers.clear(); react = hooks();
  const ownerC = session.api.useAuthSession();
  render(ownerC);
  for (let i = 0; i < 10; i++) { timers.forEach(tick => tick()); render(ownerC); }
  assert.deepEqual(points, [10], 'Point rewards still work in the current session');
  session.change('D'); timers.forEach(tick => tick());
  assert.deepEqual(points, [10]);
});
