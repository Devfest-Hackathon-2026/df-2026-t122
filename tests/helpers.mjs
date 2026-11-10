import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the production TS modules with deterministic Auth/Firestore and hook adapters.
// These tests never sign into an account or contact production Firebase.
function load(file, dependencies, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, console,
    require(name) {
      if (name.endsWith('.css')) return {};
      assert.ok(name in dependencies, `Missing mock: ${name}`);
      return dependencies[name];
    }, ...globals,
  }, { filename: file });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
function hooks() {
  const slots = [];
  let index = 0;
  let pending = [];
  return {
    begin() { index = 0; },
    flush() { const tasks = pending; pending = []; tasks.forEach(run => run()); },
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = index++;
      return slots[slot] ??= { current: initial };
    },
    useEffect(effect, deps) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        pending.push(() => { previous?.cleanup?.(); slots[slot] = { deps, cleanup: effect() }; });
      }
    },
    useCallback(callback, deps) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) slots[slot] = { deps, callback };
      return slots[slot].callback;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
  };
}
function sessionHarness(react) {
  const auth = { currentUser: null };
  let listener;
  const api = load('src/features/firebase/authSession.ts', {
    react, 'firebase/auth': { onAuthStateChanged(_auth, callback) { listener = callback; } },
    './firebaseConfig': { auth },
  });
  return { auth, api, change(uid) { auth.currentUser = uid ? { uid } : null; listener(auth.currentUser); } };
}
const jsx = { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return text(tree.props?.children);
}
const tick = () => new Promise(resolve => setImmediate(resolve));

export { load, plain, hooks, sessionHarness, jsx, nodes, text, tick };
