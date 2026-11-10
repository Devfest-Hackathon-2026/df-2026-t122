import test from 'node:test';
import assert from 'node:assert/strict';
import { load, hooks, jsx, nodes, text, plain, tick } from './helpers.mjs';

function target(extra={}) {
  const listeners=new Map();
  return {...extra,
    addEventListener(type,fn) { if(!listeners.has(type)) listeners.set(type,new Set()); listeners.get(type).add(fn); },
    removeEventListener(type,fn) { listeners.get(type)?.delete(fn); },
    emit(type,event) { listeners.get(type)?.forEach(fn=>fn(event)); },
    count(type) { return listeners.get(type)?.size ?? 0; },
  };
}

test('camera probe is single-flight; late grants are stopped before the MediaPipe barrier completes', async()=>{
  let release, requests=0, stopped=0;
  const native=new Promise(resolve=>{release=resolve;});
  const camera=load('src/features/pose/cameraAccess.ts',{}, {
    window:{isSecureContext:true}, navigator:{mediaDevices:{getUserMedia(options){requests++; assert.equal(options.audio,false); return native;}}},
  });
  const first=camera.requestCameraAccess(), second=camera.requestCameraAccess();
  assert.equal(first,second); assert.equal(requests,1);
  let detectorMayStart=false;
  const barrier=camera.waitForCameraAccessProbe().then(()=>{ assert.equal(stopped,2); detectorMayStart=true; });
  await tick(); assert.equal(detectorMayStart,false);
  release({getVideoTracks:()=>[{readyState:'live'}],getTracks:()=>[{stop(){stopped++;}},{stop(){stopped++;}}]});
  assert.equal(await first,'granted'); await barrier;
  assert.equal(detectorMayStart,true);
});

test('camera distinguishes denial, missing hardware, unsupported permission queries and revoked permissions', async()=>{
  for(const [name,expected] of [['NotAllowedError','denied'],['SecurityError','denied'],['NotFoundError','unavailable'],['NotReadableError','unavailable']]) {
    const camera=load('src/features/pose/cameraAccess.ts',{}, {
      window:{isSecureContext:true}, navigator:{mediaDevices:{getUserMedia:async()=>{throw {name};}}},
    });
    assert.equal(await camera.requestCameraAccess(),expected);
  }
  const permission=target({state:'granted'}), states=[];
  const camera=load('src/features/pose/cameraAccess.ts',{}, {
    window:{isSecureContext:true}, navigator:{mediaDevices:{getUserMedia(){}}, permissions:{query:async()=>permission}},
  });
  const stop=await camera.observeCameraPermission(state=>states.push(state));
  permission.state='denied'; permission.emit('change'); stop();
  assert.deepEqual(states,['granted','denied']); assert.equal(permission.count('change'),0);
  const safari=load('src/features/pose/cameraAccess.ts',{}, {window:{isSecureContext:true}, navigator:{mediaDevices:{getUserMedia(){}}}});
  let state; await safari.observeCameraPermission(value=>{state=value;}); assert.equal(state,'unknown');
  const unsupported=load('src/features/pose/cameraAccess.ts',{}, {window:{isSecureContext:false},navigator:{}});
  assert.equal(await unsupported.requestCameraAccess(),'unavailable');
});

function orientationHarness(permission, touch=1) {
  let calls=0, timerId=0;
  const timers=new Map();
  const ctor=permission===undefined ? {} : {requestPermission(){calls++; return Promise.resolve(permission);}};
  const window=target({isSecureContext:true,DeviceOrientationEvent:ctor});
  const api=load('src/features/tilt/orientationAccess.ts',{}, {
    window,navigator:{maxTouchPoints:touch,userAgent:touch ? 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:touch ? 'Linux armv8l' : 'Win32'},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
  });
  return {api,window,timers,get calls(){return calls;}};
}

test('iOS permission is requested synchronously in the gesture; finite beta is required for success', async()=>{
  const app=orientationHarness('granted'), controller=new AbortController();
  const pending=app.api.requestOrientationAccess(controller.signal);
  assert.equal(app.calls,1,'must run before yielding user activation');
  await tick();
  app.window.emit('deviceorientation',{beta:null});
  app.window.emit('deviceorientation',{beta:NaN});
  assert.equal(app.window.count('deviceorientation'),1);
  app.window.emit('deviceorientation',{beta:0});
  assert.deepEqual(plain(await pending),{state:'granted',beta:0});
  assert.equal(app.window.count('deviceorientation'),0); assert.equal(app.timers.size,0);
});

test('Android needs no permission API; denied, no-data, unsupported and cancellation are distinct', async()=>{
  const android=orientationHarness(undefined), controller=new AbortController();
  const pending=android.api.requestOrientationAccess(controller.signal);
  android.window.emit('deviceorientation',{beta:75});
  assert.deepEqual(plain(await pending),{state:'granted',beta:75}); assert.equal(android.calls,0);
  const denied=orientationHarness('denied');
  assert.equal((await denied.api.requestOrientationAccess(controller.signal)).state,'denied');
  assert.equal(denied.window.count('deviceorientation'),0);
  const missing=orientationHarness(undefined);
  const noData=missing.api.requestOrientationAccess(controller.signal);
  [...missing.timers.values()].forEach(fn=>fn());
  assert.equal((await noData).state,'no-data'); assert.equal(missing.window.count('deviceorientation'),0);
  const desktop=orientationHarness(undefined,0);
  assert.equal(desktop.api.supportsOrientationSetup(),false);
  assert.equal((await desktop.api.requestOrientationAccess(controller.signal)).state,'unsupported');
  const cancel=orientationHarness(undefined), abort=new AbortController();
  const cancelled=cancel.api.requestOrientationAccess(abort.signal); abort.abort();
  assert.equal((await cancelled).state,'cancelled'); assert.equal(cancel.window.count('deviceorientation'),0);
});

test('setup storage persists only completion/feature choices, tolerates malformed and blocked storage',()=>{
  const data=new Map();
  const storage=load('src/features/onboarding/setupStorage.ts',{}, {window:{localStorage:{getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)}}});
  assert.equal(storage.readSetupChoices(),null);
  storage.saveSetupChoices({cameraEnabled:false,tiltEnabled:true});
  assert.deepEqual(plain(storage.readSetupChoices()),{cameraEnabled:false,tiltEnabled:true});
  assert.deepEqual(Object.keys(JSON.parse([...data.values()][0])).sort(),['cameraEnabled','completed','tiltEnabled']);
  data.set([...data.keys()][0],'bad json'); assert.equal(storage.readSetupChoices(),null);
  const blocked=load('src/features/onboarding/setupStorage.ts',{}, {window:{get localStorage(){throw new Error('blocked');}}});
  assert.doesNotThrow(()=>blocked.saveSetupChoices({cameraEnabled:false,tiltEnabled:false}));
  assert.equal(blocked.readSetupChoices(),null);
});

function appHarness({seen=false,choices=null}={}) {
  let react=hooks();
  const session={uid:null,generation:1};
  const dependencies={
    react:{useState:(...args)=>react.useState(...args)},'react/jsx-runtime':jsx,
    './features/firebase/authSession':{useAuthSession:()=>session,isCurrentAuthSession:candidate=>candidate===session},
    './features/firebase/postureRecordService':{saveCameraMeasurement:async()=>{}},
    './features/onboarding/welcomeStorage':{hasSeenWelcome:()=>seen,markWelcomeSeen(){seen=true;}},
    './features/onboarding/setupStorage':{readSetupChoices:()=>choices,saveSetupChoices(value){choices=value;}},
    './features/onboarding/WelcomeModal':{WelcomeModal:'WelcomeModal'},
    './features/onboarding/SetupModal':{SetupModal:'SetupModal'},
    './components/RecordDashboard':{RecordDashboard:'RecordDashboard'},
  };
  for(const [path,name] of [['header/HeaderControls','HeaderControls'],['warning/WarningBanner','WarningBanner'],['player/VideoPlayer','VideoPlayer'],['reward/RewardStatus','RewardStatus'],['pose/PoseDetector','PoseDetector'],['tilt/TiltDetector','TiltDetector'],['settings/SettingsModal','SettingsModal']]) dependencies[`./features/${path}`]={[name]:name};
  const App=load('src/App.tsx',dependencies).default;
  return {render(){react.begin();return nodes(App());},reload(){react=hooks();},get choices(){return choices;}};
}
const find=(tree,type)=>tree.find(node=>node.type===type);

test('welcome → setup → app; skip persists OFF choices; returning users bypass both screens',()=>{
  const app=appHarness(); let tree=app.render();
  assert.ok(find(tree,'WelcomeModal')); assert.equal(find(tree,'PoseDetector').props.enabled,false);
  assert.equal(find(tree,'TiltDetector').props.enabled,false);
  find(tree,'WelcomeModal').props.onComplete(); tree=app.render();
  assert.ok(find(tree,'SetupModal')); assert.equal(find(tree,'PoseDetector').props.enabled,false);
  find(tree,'SetupModal').props.onComplete({cameraEnabled:false,tiltEnabled:false}); tree=app.render();
  assert.equal(find(tree,'SetupModal'),undefined); assert.equal(find(tree,'PoseDetector').props.enabled,false);
  app.reload(); tree=app.render();
  assert.equal(find(tree,'WelcomeModal'),undefined); assert.equal(find(tree,'SetupModal'),undefined);
  find(tree,'HeaderControls').props.onOpenWelcome(); tree=app.render();
  find(tree,'WelcomeModal').props.onComplete(); tree=app.render();
  assert.equal(find(tree,'SetupModal'),undefined,'help re-open must not force setup again');
});

test('only selected features start after setup; settings can change persisted choices without remounting the player',()=>{
  const app=appHarness({seen:true}); let tree=app.render();
  assert.ok(find(tree,'SetupModal'));
  const player=find(tree,'VideoPlayer');
  find(tree,'SetupModal').props.onComplete({cameraEnabled:true,tiltEnabled:false}); tree=app.render();
  assert.equal(find(tree,'PoseDetector').props.enabled,true); assert.equal(find(tree,'TiltDetector').props.enabled,false);
  assert.equal(find(tree,'VideoPlayer').key,player.key);
  assert.deepEqual(plain(find(tree,'VideoPlayer').props),plain(player.props));
  find(tree,'SettingsModal').props.onToggleCamera(); tree=app.render();
  assert.deepEqual(plain(app.choices),{cameraEnabled:false,tiltEnabled:false});
});

test('SetupModal does not request privileges on mount, shows linked identity, and skip works during camera prompt',async()=>{
  const react=hooks(); let nativeResolve, requests=0;
  const completions=[];
  const Setup=load('src/features/onboarding/SetupModal.tsx',{
    react,'react/jsx-runtime':jsx,
    '../firebase/firebaseConfig':{auth:{currentUser:{displayName:'Test user'}}},
    '../firebase/authSession':{useAuthSession:()=>({uid:'A',generation:1})},
    '../auth/googleSignIn':{signInWithGoogleAccount:async()=>{throw new Error('must not login automatically');}},
    '../pose/cameraAccess':{canRequestCamera:()=>true,observeCameraPermission:async fn=>{fn('prompt');return ()=>{};},requestCameraAccess(){requests++;return new Promise(resolve=>{nativeResolve=resolve;});}},
    '../tilt/orientationAccess':{isMobileDevice:()=>false,supportsOrientationSetup:()=>false,requestOrientationAccess(){throw new Error('must not ask automatically');}},
  },{document:{activeElement:null},HTMLElement:class{},AbortController}).SetupModal;
  const render=()=>{react.begin();const tree=Setup({onComplete:value=>completions.push(value)});react.flush();return tree;};
  let tree=render(); await tick(); tree=render();
  assert.equal(requests,0); assert.match(text(tree),/連携済み/); assert.doesNotMatch(text(tree),/スマートフォンの傾きセンサー/);
  assert.match(text(tree),/YouTubeアカウント連携（任意）/);
  assert.match(text(tree),/現在テスト提供中。対応アカウントのみ連携可能/);
  assert.match(text(tree),/未連携でも動画検索・視聴・姿勢検知/);
  assert.equal(nodes(tree).filter(node=>node.type==='button' && text(node).includes('YouTube')).length,0);
  assert.equal(nodes(tree).filter(node=>node.type==='section').length,3,'PC cards: Firebase, YouTube notice, camera only');
  const button=label=>nodes(tree).find(node=>node.type==='button' && text(node)===label);
  button('カメラの利用を許可する').props.onClick();
  assert.equal(requests,1); tree=render();
  button('今はスキップする').props.onClick();
  assert.deepEqual(plain(completions),[{cameraEnabled:false,tiltEnabled:false}]);
  react.unmount(); nativeResolve('granted'); await tick();
  assert.equal(completions.length,1);
});

test('setup distinguishes existing permission from feature selection and completes with independently selected features',async()=>{
  const react=hooks(), completions=[];
  let cameraRequests=0, sensorRequests=0;
  const Setup=load('src/features/onboarding/SetupModal.tsx',{
    react,'react/jsx-runtime':jsx,
    '../firebase/firebaseConfig':{auth:{currentUser:null}},
    '../firebase/authSession':{useAuthSession:()=>({uid:null,generation:1})},
    '../auth/googleSignIn':{signInWithGoogleAccount:async()=>{}},
    '../pose/cameraAccess':{canRequestCamera:()=>true,observeCameraPermission:async fn=>{fn('granted');return ()=>{};},requestCameraAccess:async()=>{cameraRequests++;return 'granted';}},
    '../tilt/orientationAccess':{isMobileDevice:()=>true,supportsOrientationSetup:()=>true,requestOrientationAccess:async()=>{sensorRequests++;return {state:'granted',beta:80};}},
  },{document:{activeElement:null},HTMLElement:class{},AbortController}).SetupModal;
  const render=()=>{react.begin();const tree=Setup({onComplete:value=>completions.push(value)});react.flush();return tree;};
  let tree=render(); await tick(); tree=render();
  assert.equal(cameraRequests,0); assert.equal(sensorRequests,0);
  assert.match(text(tree),/権限許可済み/);
  assert.equal(nodes(tree).find(node=>node.type==='input').props.disabled,true);
  nodes(tree).find(node=>node.type==='button'&&text(node)==='カメラの利用を確認する').props.onClick();
  await tick(); tree=render();
  nodes(tree).find(node=>node.type==='button'&&text(node)==='傾きセンサーを確認する').props.onClick();
  await tick(); tree=render();
  assert.match(text(tree),/許可・データ取得済み/);
  const inputs=nodes(tree).filter(node=>node.type==='input');
  assert.equal(inputs[0].props.checked,true); assert.equal(inputs[1].props.checked,true);
  inputs[0].props.onChange({target:{checked:false}}); tree=render();
  nodes(tree).find(node=>node.type==='button'&&text(node).includes('セットアップを完了して始める')).props.onClick();
  assert.deepEqual(plain(completions),[{cameraEnabled:false,tiltEnabled:true}]);
  react.unmount();
});

test('shared Google sign-in uses Firebase popup without YouTube scopes or automatic requests',async()=>{
  const auth={}, providers=[]; let calls=0;
  const account=load('src/features/auth/googleSignIn.ts',{
    '../firebase/firebaseConfig':{auth},
    'firebase/auth':{
      GoogleAuthProvider:class { constructor(){providers.push(this);} },
      signInWithPopup(target,provider){calls++;assert.equal(target,auth);assert.equal(provider,providers[0]);return Promise.resolve({user:{uid:'A'}});},
    },
  });
  assert.equal(calls,0);
  assert.equal((await account.signInWithGoogleAccount()).user.uid,'A');
  assert.equal(calls,1); assert.equal(providers.length,1);
});


test('device type plus sensor API controls visibility, independently of viewport and PC touch support',()=>{
  const android='Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36';
  const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1';
  const mac='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17 Safari/605.1.15';
  const windows='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36';
  const cases=[
    {label:'narrow touch PC exposing iOS-like permission API',ua:windows,platform:'Win32',touch:10,width:320,hints:{mobile:false},permission:true,expected:false},
    {label:'narrow PC without UA hints',ua:windows,platform:'Win32',touch:10,width:320,permission:true,expected:false},
    {label:'desktop Safari exposing orientation permission API',ua:mac,platform:'MacIntel',touch:0,width:1280,permission:true,expected:false},
    {label:'wide Android phone',ua:android,platform:'Linux armv8l',touch:5,width:1200,hints:{mobile:true},expected:true},
    {label:'iPhone Safari fallback',ua:iphone,platform:'iPhone',touch:5,width:390,permission:true,expected:true},
    {label:'iPad desktop identity',ua:mac,platform:'MacIntel',touch:5,width:1024,permission:true,expected:true},
    {label:'phone with no sensor API',ua:android,touch:5,width:390,api:false,expected:false},
    {label:'phone insecure context',ua:android,touch:5,width:390,secure:false,expected:false},
  ];
  for(const item of cases) {
    const orientation=item.api===false ? undefined : item.permission ? {requestPermission:async()=> 'granted'} : {};
    const api=load('src/features/tilt/orientationAccess.ts',{}, {
      window:{isSecureContext:item.secure!==false,DeviceOrientationEvent:orientation,innerWidth:item.width},
      navigator:{userAgent:item.ua,platform:item.platform,maxTouchPoints:item.touch,userAgentData:item.hints},
    });
    assert.equal(api.supportsOrientationSetup(),item.expected,item.label);
  }
});
