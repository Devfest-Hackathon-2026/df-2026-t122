import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain, hooks, jsx, tick } from './helpers.mjs';

const measurement = load('src/features/pose/cameraMeasurement.ts', {});
const seconds = batch => batch.slots.length / 10;

test('only consecutive successful detections count; missing/stalled results never backfill time', () => {
  const clock = new measurement.CameraMeasurement();
  clock.frame(0, false); clock.frame(5000, false);
  assert.equal(seconds(clock.take()), 0);
  for (let ms = 10000; ms <= 12300; ms += 100) clock.frame(ms, true);
  assert.equal(seconds(clock.take()), 2.3);
  clock.frame(60000, true); // Detection stopped between frames.
  assert.equal(seconds(clock.take()), 0);
  clock.frame(60100, true);
  assert.equal(seconds(clock.take()), 0.1);
  clock.pause(); clock.frame(90000, true);
  assert.equal(seconds(clock.take()), 0);
});

test('100ms precision credits complete intervals only; blinks and retry masks are deduplicated', () => {
  const clock = new measurement.CameraMeasurement();
  clock.frame(25, true); clock.blink(25); // Partial initial slot is excluded.
  clock.frame(100, true); clock.blink(100);
  clock.frame(200, true);
  const batch = clock.take();
  assert.equal(seconds(batch), 0.1);
  const first = measurement.mergeCameraSlots({}, batch);
  assert.equal(first.addedSeconds, 0.1);
  assert.equal(first.addedBlinks, 1);
  const retry = measurement.mergeCameraSlots(first.masks, batch);
  assert.equal(retry.addedSeconds, 0);
  assert.equal(retry.addedBlinks, 0);
});

function eventTarget(extra = {}) {
  const listeners = new Map();
  return { ...extra,
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type) { listeners.get(type)?.forEach(callback => callback()); },
  };
}
function poseHarness({ failStart = false, failSave = false, permissionProbe = Promise.resolve() } = {}) {
  const react = hooks();
  let refCount = 0, now = 0, id = 0, failFrame = false;
  const timers = new Map(), saved = [], cameras = [], faces = [];
  const track = eventTarget({ readyState:'live', enabled:true, muted:false, stop() {} });
  const stream = { getVideoTracks:()=>[track], getTracks:()=>[track] };
  const video = eventTarget({ paused:false, ended:false, readyState:4, srcObject:null });
  const document = eventTarget({ visibilityState:'visible',
    createElement:()=>({ remove() {} }),
    head: { appendChild:script=>queueMicrotask(()=>script.onload()) },
  });
  class FaceMesh {
    constructor() { faces.push(this); }
    setOptions() {} onResults(callback) { this.result=callback; }
    async send() {} async close() {}
  }
  class Pose { setOptions() {} onResults() {} async send() { if (failFrame) throw new Error("test stopped detector"); } async close() {} }
  class Camera {
    constructor(_video, options) { this.options=options; cameras.push(this); }
    async start() { if (failStart) throw new Error('test camera denied'); video.srcObject=stream; }
    async stop() {}
  }
  const PoseDetector = load('src/features/pose/PoseDetector.tsx', {
    react: { ...react, useRef(initial) { const ref=react.useRef(initial); if (refCount++===0) ref.current=video; return ref; } },
    'react/jsx-runtime':jsx, './cameraMeasurement':measurement,
    './cameraAccess': { waitForCameraAccessProbe: () => permissionProbe },
    '@mediapipe/pose/pose.js?url':{ default:'pose.js' },
    '@mediapipe/face_mesh/face_mesh.js?url':{ default:'face.js' },
    '@mediapipe/camera_utils/camera_utils.js?url':{ default:'camera.js' },
  }, {
    document, window:{ Pose, FaceMesh, Camera },
    Date:class extends Date { static now() { return now; } },
    console:{ ...console, error() {} },
    setInterval(callback, delay) { timers.set(++id,{callback,delay}); return id; },
    clearInterval(id) { timers.delete(id); },
  }).PoseDetector;
  return {
    document, video, track, saved, cameras,
    async render(enabled=true) {
      react.begin(); refCount=0;
      PoseDetector({ enabled, onWarningChange() {}, onMeasurementRecorded:async batch=>{
        if (failSave) { failSave=false; throw new Error('test disconnected'); }
        saved.push(plain(batch));
      } });
      react.flush(); await tick();
    },
    frame(ms, face=true, closed=false) {
      now=ms;
      const points=Array.from({length:160},()=>({x:0,y:0}));
      points[133]={x:1,y:0}; points[159]={x:0,y:closed ? 0.01 : 0.3};
      faces.at(-1)?.result({multiFaceLandmarks:face ? [points] : []});
    },
    async detectorError() { failFrame=true; await cameras.at(-1).options.onFrame(); failFrame=false; },
    async flush() { timers.forEach(timer=>{ if(timer.delay===60000) timer.callback(); }); await tick(); },
    async unmount() { react.unmount(); await tick(); },
  };
}

test('MediaPipe waits for setup permission probe cleanup before creating its camera', async () => {
  let finishProbe;
  const permissionProbe = new Promise(resolve => { finishProbe = resolve; });
  const app = poseHarness({ permissionProbe });
  await app.render();
  assert.equal(app.cameras.length, 0);
  finishProbe(); await tick();
  assert.equal(app.cameras.length, 1);
  await app.unmount();
});

test('camera OFF/start failure/no face never save time; valid face results save actual seconds', async () => {
  for (const mode of ['off','failure','noFace']) {
    const app=poseHarness({failStart:mode==='failure'});
    await app.render(mode!=='off');
    app.frame(0,false); app.frame(60000,false); await app.flush();
    assert.equal(app.saved.length,0,mode);
    await app.unmount();
  }
  const app=poseHarness(); await app.render();
  for(let ms=0;ms<=2500;ms+=100) app.frame(ms);
  await app.flush();
  assert.equal(seconds(app.saved[0]),2.5);
  await app.unmount();
});

test('hidden/paused/muted/stopped camera intervals are excluded; restart resumes without bridging', async () => {
  const app=poseHarness(); await app.render();
  app.frame(0); app.frame(100);
  app.document.visibilityState='hidden'; app.document.emit('visibilitychange');
  app.frame(200); app.frame(60000);
  await app.flush();
  assert.equal(app.saved.reduce((sum,batch)=>sum+seconds(batch),0),0.1);
  app.document.visibilityState='visible'; app.document.emit('visibilitychange');
  app.frame(61000); app.frame(61100);
  app.video.paused=true; app.video.emit('pause'); app.frame(61200);
  app.video.paused=false; app.frame(61300); app.frame(61400);
  app.track.muted=true; app.track.emit('mute'); app.frame(61500);
  app.track.muted=false; app.frame(61600); app.frame(61700);
  app.track.readyState='ended'; app.track.emit('ended'); app.frame(61800);
  await app.flush();
  assert.equal(app.saved.reduce((sum,batch)=>sum+seconds(batch),0),0.4);
  await app.render(false);
  app.track.readyState='live'; await app.render(true);
  app.frame(100000); app.frame(100100); await app.flush();
  assert.equal(seconds(app.saved.at(-1)),0.1);
  assert.equal(app.cameras.length,2);
  await app.unmount();
});

test('blink transitions still count, missing faces do not create blinks, and detector errors break timing', async () => {
  const app=poseHarness(); await app.render();
  app.frame(0); app.frame(100,true,true); app.frame(200); app.frame(300);
  app.frame(400,true,true); app.frame(500,false); app.frame(600);
  app.frame(700); await app.detectorError(); app.frame(800); app.frame(900);
  await app.flush();
  assert.equal(Object.values(app.saved[0].blinks).reduce((sum,count)=>sum+count,0),1);
  assert.equal(seconds(app.saved[0]),0.6);
  await app.unmount();
});

test('save failure retries unchanged slots; unmount flushes completed partial-minute data', async () => {
  const app=poseHarness({failSave:true}); await app.render();
  app.frame(0); app.frame(100); await app.flush();
  assert.equal(app.saved.length,0);
  await app.flush();
  assert.equal(seconds(app.saved[0]),0.1);
  app.frame(200); await app.unmount();
  assert.equal(seconds(app.saved[1]),0.1);
});

function firestoreHarness() {
  const docs=new Map(), writes=[], reads=[];
  let version=0;
  let session={uid:'A',generation:1};
  const auth={currentUser:{uid:'A'}};
  const service=load('src/features/firebase/postureRecordService.ts',{
    './firebaseConfig':{auth,db:{}},
    './authSession':{isCurrentAuthSession:candidate=>candidate===session && candidate.uid===auth.currentUser?.uid},
    '../pose/cameraMeasurement':measurement,
    'firebase/firestore':{
      doc:(_db,...path)=>path.join('/'), serverTimestamp:()=>0,
      increment:value=>value, setDoc:async()=>{}, getDoc:async()=>{},
      async runTransaction(_db,callback) {
        for(let attempt=0;attempt<20;attempt++) {
          const revision=version, pending=[];
          const result=await callback({
            async get(path) { assert.equal(pending.length,0); reads.push(path); const data=structuredClone(docs.get(path)); return { data:()=>data }; },
            set(path,data,options) { pending.push({path,data,options}); },
          });
          if(revision!==version) continue; // Simulate Firestore optimistic retries.
          for(const {path,data,options} of pending) {
            docs.set(path,options?.merge ? {...docs.get(path),...data} : data); writes.push(path);
          }
          if(pending.length) version++;
          return result;
        }
        throw new Error('transaction contention');
      },
    },
  });
  return {service,docs,writes,reads,get session(){return session;},switchUser(uid){session={uid,generation:session.generation+1};auth.currentUser=uid ? {uid} : null;}};
}
function makeBatch(start,count,blinks={}) { return {slots:Array.from({length:count},(_,idx)=>start+idx),blinks}; }

test('concurrent tabs/devices and replay add union of time slots and never double blinks or historical 192 minutes', async () => {
  const app=firestoreHarness();
  const date=new Date(2026,10,10,12), start=date.getTime()/100;
  const record=`users/A/daily_records/${app.service.formatDateId(date)}`;
  app.docs.set(record,{blinkRecordedMinutes:192,totalBlinks:221});
  const a=makeBatch(start,600,{[start+10]:1}),b=makeBatch(start+300,600,{[start+400]:1});
  await Promise.all([app.service.saveCameraMeasurement(app.session,a),app.service.saveCameraMeasurement(app.session,b)]);
  assert.equal(app.docs.get(record).blinkRecordedMinutes,193.5);
  assert.equal(app.docs.get(record).totalBlinks,222); // B's blink is in an already-credited slot.
  const writes=app.writes.length;
  await app.service.saveCameraMeasurement(app.session,a);
  assert.equal(app.writes.length,writes);
  assert.equal(app.docs.get(record).blinkRecordedMinutes,193.5);
});

test('UID switch rejects queued old measurements including A→B→A; UTC ledger splits midnight correctly', async () => {
  const app=firestoreHarness(), old=app.session;
  const now=new Date('2026-11-10T23:59:59.900Z').getTime()/100;
  app.switchUser('B'); await app.service.saveCameraMeasurement(old,makeBatch(now,2));
  app.switchUser('A'); await app.service.saveCameraMeasurement(old,makeBatch(now,2));
  app.switchUser(null); await app.service.saveCameraMeasurement(app.session,makeBatch(now,2));
  assert.equal(app.writes.length,0);
  app.switchUser('A'); await app.service.saveCameraMeasurement(app.session,makeBatch(now,2));
  assert.ok(app.docs.has('users/A/camera_measurements/2026-11-10'));
  assert.ok(app.docs.has('users/A/camera_measurements/2026-11-11'));
  assert.ok([...app.docs.keys()].every(path=>path.startsWith('users/A/')));
});
