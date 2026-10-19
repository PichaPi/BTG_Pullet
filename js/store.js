/*
 * store.js — โหลด/บันทึกข้อมูล
 *   - ไม่มีการตั้งค่า GitHub: อ่าน data/flocks.json แล้วเก็บการแก้ไขไว้ใน localStorage ของเครื่องนั้น
 *   - ตั้งค่า GitHub แล้ว: อ่าน/เขียน data/flocks.json ใน repo ผ่าน GitHub API (commit ทุกครั้งที่บันทึก)
 */
(function (root) {
  'use strict';

  var LS_DATA = 'pullet.data.v1';
  var LS_GH = 'pullet.github.v1';

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* เดา owner/repo จาก URL ของ GitHub Pages: https://<owner>.github.io/<repo>/ */
  function guessRepo() {
    var m = /^([^.]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return {};
    var repo = location.pathname.split('/').filter(Boolean)[0] || (m[1] + '.github.io');
    return { owner: m[1], repo: repo };
  }

  var gh = lsGet(LS_GH);
  var sha = null;          // sha ของไฟล์บน GitHub (ใช้ตอน commit)

  function ghConfig() {
    var g = guessRepo();
    return Object.assign({ owner: g.owner || '', repo: g.repo || '', branch: 'main', path: 'data/flocks.json', token: '' }, gh || {});
  }
  function ghEnabled() { return !!(gh && gh.token && gh.owner && gh.repo); }
  function ghUrl(c) {
    return 'https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) +
      '/contents/' + c.path.split('/').map(encodeURIComponent).join('/');
  }
  function ghHeaders(c) {
    return { 'Authorization': 'Bearer ' + c.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  async function ghRead(c) {
    var res = await fetch(ghUrl(c) + '?ref=' + encodeURIComponent(c.branch) + '&t=' + Date.now(), { headers: ghHeaders(c), cache: 'no-store' });
    if (res.status === 404) { sha = null; return null; }
    if (!res.ok) throw new Error('GitHub ' + res.status + ': ' + (await res.text()).slice(0, 200));
    var j = await res.json();
    sha = j.sha;
    return JSON.parse(b64decode(j.content));
  }

  async function ghWrite(c, data, message) {
    var body = { message: message, content: b64encode(JSON.stringify(data, null, 2) + '\n'), branch: c.branch };
    if (sha) body.sha = sha;
    var res = await fetch(ghUrl(c), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(c)), body: JSON.stringify(body) });
    if (res.status === 409 || res.status === 422) {
      var e = new Error('conflict'); e.conflict = true; throw e;
    }
    if (!res.ok) throw new Error('GitHub ' + res.status + ': ' + (await res.text()).slice(0, 200));
    var j = await res.json();
    sha = j.content && j.content.sha;
  }

  async function fetchSeed() {
    var res = await fetch('data/flocks.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('โหลด data/flocks.json ไม่ได้ (' + res.status + ')');
    return res.json();
  }

  /* สถานะการเก็บตัวอย่าง: { "17": true, "10": true, "3": true } */
  function normDone(x) {
    var o = {};
    [17, 10, 3].forEach(function (n) { if (x && x[n]) o[n] = true; });
    return o;
  }

  function normalize(d) {
    if (Array.isArray(d)) d = { flocks: d };
    d = d || {};
    d.version = 1;
    d.flocks = (d.flocks || []).map(function (f, i) {
      return {
        id: f.id || ('f' + Date.now().toString(36) + i),
        group: String(f.group || '').trim(), farm: String(f.farm || '').trim(),
        vendor: String(f.vendor == null ? '' : f.vendor).trim(), house: String(f.house || '').trim(),
        batch: String(f.batch == null ? '' : f.batch).trim(),
        count: f.count === '' || f.count == null ? null : Number(f.count),
        start: f.start || '', move: f.move || '',
        done: normDone(f.done)
      };
    });
    return d;
  }

  /* ---------- Claude Artifact db (ใช้เมื่อเปิดแอปเป็น Artifact บน claude.ai) ---------- */
  var FIELDS = ['group', 'farm', 'vendor', 'house', 'batch', 'count', 'start', 'move', 'done'];
  var dbPromise = null, db = null, dbUnsub = null, dbLast = {}, remoteCb = null;

  function getDb() {
    if (!dbPromise) {
      dbPromise = (root.claude && typeof root.claude.use === 'function')
        ? root.claude.use('db').catch(function () { return null; })
        : Promise.resolve(null);
    }
    return dbPromise;
  }
  function pick(f) { var o = {}; FIELDS.forEach(function (k) { o[k] = f[k] == null ? null : f[k]; }); o.done = normDone(f.done); return o; }
  function same(a, b) { return JSON.stringify(pick(a)) === JSON.stringify(pick(b)); }

  function dbLoad() {
    return new Promise(function (resolve, reject) {
      var first = true;
      if (dbUnsub) dbUnsub();
      dbUnsub = db.collection('flocks').onSnapshot(function (snap) {
        var list = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        dbLast = {};
        list.forEach(function (f) { dbLast[f.id] = f; });
        var data = normalize({ flocks: list });
        if (first) { first = false; resolve({ data: data, source: 'db' }); }
        else if (remoteCb) remoteCb(data);
      }, function (e) {
        if (first) { first = false; reject(new Error(e.message || e.code)); }
      });
    });
  }

  async function dbSave(data) {
    var seen = {};
    for (var i = 0; i < data.flocks.length; i++) {
      var f = data.flocks[i];
      seen[f.id] = true;
      if (!dbLast[f.id] || !same(f, dbLast[f.id])) {
        await db.collection('flocks').doc(f.id).set(Object.assign(pick(f), { updatedAt: new Date().toISOString() }));
        dbLast[f.id] = f;
      }
    }
    var gone = Object.keys(dbLast).filter(function (id) { return !seen[id]; });
    for (var j = 0; j < gone.length; j++) {
      await db.collection('flocks').doc(gone[j]).delete();
      delete dbLast[gone[j]];
    }
  }

  /*
   * load(): คืนค่า { data, source, pendingLocal }
   *   source = 'db' | 'github' | 'local' | 'seed'
   */
  async function load() {
    db = await getDb();
    if (db) return dbLoad();
    if (ghEnabled()) {
      var remote = await ghRead(gh);
      if (remote) { var d = normalize(remote); lsSet(LS_DATA, { data: d, base: d.updated, dirty: false }); return { data: d, source: 'github' }; }
    }
    var local = lsGet(LS_DATA);
    var seed = null;
    try { seed = normalize(await fetchSeed()); } catch (e) { if (!local) throw e; }
    if (local && local.data) {
      // ถ้าในเครื่องไม่มีการแก้ค้าง และไฟล์บนเว็บใหม่กว่า → ใช้ไฟล์บนเว็บ
      if (!local.dirty && seed && seed.updated !== local.base) {
        lsSet(LS_DATA, { data: seed, base: seed.updated, dirty: false });
        return { data: seed, source: 'seed' };
      }
      return { data: normalize(local.data), source: 'local', pendingLocal: !!local.dirty };
    }
    lsSet(LS_DATA, { data: seed, base: seed.updated, dirty: false });
    return { data: seed, source: 'seed' };
  }

  /* save(): บันทึกลงเครื่องเสมอ แล้ว commit ขึ้น GitHub ถ้าตั้งค่าไว้ */
  async function save(data, message) {
    data.updated = new Date().toISOString();
    if (db) { await dbSave(data); return { synced: true, online: true }; }
    var prev = lsGet(LS_DATA) || {};
    lsSet(LS_DATA, { data: data, base: prev.base, dirty: true });
    if (!ghEnabled()) return { synced: false };
    try {
      await ghWrite(gh, data, message);
    } catch (e) {
      if (!e.conflict) throw e;
      // มีคนอื่นบันทึกก่อน: อ่าน sha ล่าสุดแล้วลองอีกครั้ง (ข้อมูลชุดที่เห็นอยู่จะเขียนทับ)
      var err = new Error('conflict'); err.conflict = true; throw err;
    }
    lsSet(LS_DATA, { data: data, base: data.updated, dirty: false });
    return { synced: true };
  }

  async function refreshSha() { if (ghEnabled()) return ghRead(gh); return null; }

  async function setGitHub(cfg) {
    var c = Object.assign(ghConfig(), cfg);
    // ทดสอบสิทธิ์ก่อนบันทึกค่า
    var remote = await ghRead(c);
    gh = c; lsSet(LS_GH, c);
    return remote;
  }
  function clearGitHub() { gh = null; sha = null; lsDel(LS_GH); }

  root.PulletStore = {
    load: load, save: save, normalize: normalize, refreshSha: refreshSha,
    onRemote: function (cb) { remoteCb = cb; },
    isOnlineDb: function () { return !!db; },
    ghConfig: ghConfig, ghEnabled: ghEnabled, setGitHub: setGitHub, clearGitHub: clearGitHub,
    ghPushInitial: function (data) { return ghWrite(gh, data, 'Initial data from Pullet Age Tracker'); }
  };
})(this);
