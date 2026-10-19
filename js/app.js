/* app.js — หน้าจอ, ตาราง, ฟอร์มเพิ่ม/แก้ไข */
(function () {
  'use strict';

  var C = window.PulletCalc, S = window.PulletStore, X = window.PulletExport;
  var $ = function (s) { return document.querySelector(s); };
  var TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var LS_UI = 'pullet.ui.v1';

  var state = {
    data: { flocks: [] },
    ref: C.todayISO(),
    group: 'ทั้งหมด',
    q: '',
    showMoved: true,
    onlyIssue: false,
    editing: null
  };
  try { Object.assign(state, JSON.parse(localStorage.getItem(LS_UI)) || {}); } catch (e) { /* ignore */ }
  state.ref = C.todayISO(); // วันที่อ้างอิงเริ่มที่วันนี้เสมอ (เหมือน =TODAY())

  function saveUI() {
    try { localStorage.setItem(LS_UI, JSON.stringify({ group: state.group, showMoved: state.showMoved, onlyIssue: state.onlyIssue })); } catch (e) { /* ignore */ }
  }

  /* ---------- formatting ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDay(n) {
    if (n === null || n === undefined) return '';
    var d = new Date(n * 86400000);
    return d.getUTCDate() + ' ' + TH_MON[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2);
  }
  function fmtISO(s) { return fmtDay(C.toDay(s)); }
  function fmtNum(v) { return v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('en-US'); }
  function nz(v) { return v === null || v === undefined ? '' : v; }
  function weekday(n) { return ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][new Date(n * 86400000).getUTCDay()]; }

  var STATUS_CLS = { 'ย้ายแล้ว': 'moved', 'ใกล้ย้าย': 'soon', 'ปกติ': 'ok', 'รอกำหนดวันย้าย': 'wait' };

  /* ---------- data helpers ---------- */
  function groups() {
    var seen = [];
    state.data.flocks.forEach(function (f) { if (f.group && seen.indexOf(f.group) < 0) seen.push(f.group); });
    return seen;
  }
  function rows() {
    var all = state.data.flocks;
    return C.sortFlocks(all, state.ref).map(function (f) {
      return { f: f, c: C.compute(f, state.ref, all) };
    });
  }
  function filtered(list) {
    var q = state.q.trim().toLowerCase();
    return list.filter(function (r) {
      if (state.group !== 'ทั้งหมด' && r.f.group !== state.group) return false;
      if (!state.showMoved && r.c.status === 'ย้ายแล้ว') return false;
      if (state.onlyIssue && !r.c.issue) return false;
      if (q && [r.f.farm, r.f.house, r.f.vendor, r.f.group, r.f.batch].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ---------- render ---------- */
  function render() {
    var all = rows();
    var list = filtered(all);
    var scope = all.filter(function (r) { return state.group === 'ทั้งหมด' || r.f.group === state.group; });
    renderRef();
    renderKpis(scope);
    renderDue(scope);
    renderSeg();
    renderTable(list);
    renderCards(list);
    $('#empty').hidden = list.length > 0;
    $('#empty').textContent = state.data.flocks.length ? 'ไม่พบฝูงตามเงื่อนไขที่เลือก' : 'ยังไม่มีข้อมูล — กด “+ เพิ่มฝูง” เพื่อเริ่ม';
  }

  function renderRef() {
    $('#refDate').value = state.ref;
    $('#refToday').hidden = state.ref === C.todayISO();
  }

  function renderKpis(scope) {
    var active = scope.filter(function (r) { return r.c.status !== 'ย้ายแล้ว'; });
    var birds = active.reduce(function (a, r) { return a + (Number(r.f.count) || 0); }, 0);
    var soon = scope.filter(function (r) { return r.c.status === 'ใกล้ย้าย'; }).length;
    var due = 0, overdue = 0;
    scope.forEach(function (r) {
      if (r.c.status === 'ย้ายแล้ว') return;
      r.c.samples.forEach(function (s) { if (s.state === 'due') due++; if (s.state === 'overdue') overdue++; });
    });
    var issues = scope.filter(function (r) { return r.c.issue; }).length;
    var next = active.filter(function (r) { return r.c.left !== null; })[0];
    var k = [
      { label: 'ฝูงที่ยังไม่ย้าย', value: active.length, note: 'จากทั้งหมด ' + scope.length + ' โรงเรือน' },
      { label: 'ไก่รวม (ตัว)', value: fmtNum(birds), note: 'เฉพาะฝูงที่ยังไม่ย้าย' },
      { label: 'ย้ายครั้งถัดไป', value: next ? fmtISO(next.f.move) : '—', note: next ? esc(next.f.farm + ' ' + next.f.house) + ' · อีก ' + next.c.left + ' วัน' : 'ยังไม่มีวันย้าย', tone: next && next.c.left <= 7 ? 'soon' : '' },
      { label: 'ใกล้ย้าย (≤ 7 วัน)', value: soon, tone: soon ? 'soon' : '' },
      { label: 'ต้องเก็บตัวอย่าง 7 วันนี้', value: due, note: overdue ? '<span class="k-red">ค้างเก็บ (เลยวัน) ' + overdue + ' ครั้ง</span>' : 'ครั้ง ที่ยังไม่ได้เก็บ', tone: due ? 'due' : '' },
      { label: 'ข้อมูลผิดปกติ', value: issues, tone: issues ? 'issue' : '', act: issues ? 'issue' : '' }
    ];
    $('#kpis').innerHTML = k.map(function (x) {
      var tag = x.act ? 'button type="button" data-kpi="' + x.act + '"' : 'div';
      return '<' + tag + ' class="kpi ' + (x.tone || '') + '"><span class="k-label">' + x.label + '</span>' +
        '<span class="k-value">' + x.value + '</span>' + (x.note ? '<span class="k-note">' + x.note + '</span>' : '') +
        '</' + (x.act ? 'button' : 'div') + '>';
    }).join('');
  }

  function renderDue(scope) {
    var ref = C.toDay(state.ref), items = [];
    scope.forEach(function (r) {
      if (r.c.status === 'ย้ายแล้ว') return;
      r.c.samples.forEach(function (s) { if (s.state === 'due' || s.state === 'overdue') items.push({ r: r, s: s }); });
    });
    items.sort(function (a, b) { return a.s.date - b.s.date || b.s.days - a.s.days; });
    $('#dueRange').textContent = fmtDay(ref) + ' – ' + fmtDay(ref + C.SAMPLE_WINDOW);
    $('#dueList').innerHTML = items.length ? items.map(function (it) {
      var d = it.s.date - ref;
      var when = d === 0 ? 'วันนี้' : d === 1 ? 'พรุ่งนี้' : d < 0 ? 'เลยมา ' + (-d) + ' วัน' : 'อีก ' + d + ' วัน';
      return '<li data-id="' + esc(it.r.f.id) + '" class="' + it.s.state + '" tabindex="0">' +
        sampleBox(it.r.f, it.s) +
        '<span class="due-date"><b>' + fmtDay(it.s.date) + '</b><small>' + weekday(it.s.date) + ' · ' + when + '</small></span>' +
        '<span class="due-what"><b>' + esc(it.r.f.farm) + ' · ' + esc(it.r.f.house) + '</b><small>ก่อนจับ ' + it.s.days + ' วัน · อายุ ' + nz(it.s.age) + ' วัน · ' + esc(it.r.f.group) + '</small></span>' +
        '<span class="pill test">' + it.s.test + '</span>' +
        '</li>';
    }).join('') : '<li class="none">ไม่มีตัวอย่างที่ต้องเก็บใน 7 วันข้างหน้า และไม่มีค้างเก็บ</li>';
  }

  function renderSeg() {
    var gs = ['ทั้งหมด'].concat(groups());
    if (gs.indexOf(state.group) < 0) state.group = 'ทั้งหมด';
    $('#groupSeg').innerHTML = gs.map(function (g) {
      var n = g === 'ทั้งหมด' ? state.data.flocks.length : state.data.flocks.filter(function (f) { return f.group === g; }).length;
      return '<button type="button" role="tab" aria-selected="' + (g === state.group) + '" data-group="' + esc(g) + '">' + esc(g) + ' <span>' + n + '</span></button>';
    }).join('');
  }

  /* checkbox เก็บตัวอย่างแล้ว */
  function sampleBox(f, s) {
    if (s.date === null) return '';
    return '<label class="sck" title="ติ๊กเมื่อเก็บตัวอย่างแล้ว"><input type="checkbox" data-sample="' + esc(f.id) + '|' + s.days + '"' +
      (s.done ? ' checked' : '') + ' aria-label="เก็บตัวอย่างก่อนจับ ' + s.days + ' วันแล้ว"></label>';
  }

  function sampleCells(f, c) {
    return c.samples.map(function (s) {
      if (s.date === null) return '<td class="s-date"></td>';
      return '<td class="s-date ' + s.state + '"><div class="s-wrap">' + sampleBox(f, s) +
        '<span>' + fmtDay(s.date) + '<small>' + (s.done ? 'เก็บแล้ว · ' : s.state === 'overdue' ? 'ยังไม่เก็บ · ' : '') + 'อายุ ' + nz(s.age) + ' วัน</small></span></div></td>';
    }).join('');
  }

  function renderTable(list) {
    var lastRank = null;
    $('#gridBody').innerHTML = list.map(function (r) {
      var f = r.f, c = r.c;
      var rank = c.status === 'ย้ายแล้ว' ? 'moved' : f.move ? 'up' : 'nomove';
      var sep = '';
      if (rank !== lastRank && lastRank !== null) {
        sep = '<tr class="sep"><td colspan="16"><span>' + (rank === 'nomove' ? 'ยังไม่กำหนดวันย้าย' : 'ย้ายแล้ว') + '</span></td></tr>';
      }
      lastRank = rank;
      return sep + '<tr data-id="' + esc(f.id) + '" class="r-' + (STATUS_CLS[c.status] || 'none') + '" tabindex="0">' +
        '<td class="sticky farm"><b>' + esc(f.farm) + '</b><span><em>' + esc(f.house) + '</em> · ' + esc(f.group) + '</span></td>' +
        '<td class="mono">' + esc(f.vendor) + '</td>' +
        '<td>' + esc(f.batch) + '</td>' +
        '<td class="num">' + fmtNum(f.count) + '</td>' +
        '<td>' + fmtISO(f.start) + '</td>' +
        '<td class="num ' + (c.age !== null && c.age >= 105 ? 'age-ok' : '') + '">' + nz(c.age) + '</td>' +
        '<td class="num">' + c.ageWD + '</td>' +
        '<td>' + fmtDay(c.d105) + '</td>' +
        '<td class="move"><b>' + fmtISO(f.move) + '</b></td>' +
        '<td class="num">' + nz(c.moveAge) + '</td>' +
        '<td class="num left">' + nz(c.left) + '</td>' +
        '<td>' + (c.status ? '<span class="status ' + STATUS_CLS[c.status] + '">' + c.status + '</span>' : '') + '</td>' +
        sampleCells(f, c) +
        '<td class="issue">' + (c.issue ? '<span>' + esc(c.issue) + '</span>' : '') + '</td>' +
        '</tr>';
    }).join('');
    var birds = list.reduce(function (a, r) { return a + (Number(r.f.count) || 0); }, 0);
    $('#gridFoot').innerHTML = list.length ? '<tr><td class="sticky">รวม ' + list.length + ' โรงเรือน</td><td></td><td></td><td class="num">' + fmtNum(birds) + '</td><td colspan="11"></td></tr>' : '';
    document.querySelector('.table-wrap').hidden = !list.length;
  }

  function renderCards(list) {
    $('#cards').innerHTML = list.map(function (r) {
      var f = r.f, c = r.c;
      return '<article class="card r-' + (STATUS_CLS[c.status] || 'none') + '" data-id="' + esc(f.id) + '" tabindex="0">' +
        '<header><div><b>' + esc(f.farm) + '</b> <span class="house">' + esc(f.house) + '</span>' +
        '<small>' + esc(f.group) + (f.vendor ? ' · ' + esc(f.vendor) : '') + (f.batch ? ' · รุ่น ' + esc(f.batch) : '') + '</small></div>' +
        (c.status ? '<span class="status ' + STATUS_CLS[c.status] + '">' + c.status + '</span>' : '') + '</header>' +
        '<dl>' +
        '<div><dt>วันย้าย</dt><dd><b>' + (fmtISO(f.move) || '—') + '</b>' + (c.left !== null ? '<small>' + (c.left >= 0 ? 'อีก ' + c.left + ' วัน' : 'ผ่านมา ' + (-c.left) + ' วัน') + '</small>' : '') + '</dd></div>' +
        '<div><dt>อายุ</dt><dd><b class="' + (c.age !== null && c.age >= 105 ? 'age-ok' : '') + '">' + (c.age !== null ? c.age + ' วัน' : '—') + '</b><small>' + c.ageWD + ' สัปดาห์</small></dd></div>' +
        '<div><dt>อายุวันย้าย</dt><dd><b>' + (c.moveAge !== null ? c.moveAge + ' วัน' : '—') + '</b><small>ครบ 105: ' + (fmtDay(c.d105) || '—') + '</small></dd></div>' +
        '<div><dt>จำนวนไก่</dt><dd><b>' + (fmtNum(f.count) || '—') + '</b><small>เริ่ม ' + (fmtISO(f.start) || '—') + '</small></dd></div>' +
        '</dl>' +
        (f.move ? '<ul class="samples">' + c.samples.map(function (s) {
          return '<li class="' + s.state + '">' + sampleBox(f, s) + '<div><span>−' + s.days + ' วัน' + (s.done ? ' · เก็บแล้ว' : '') + '</span><b>' + fmtDay(s.date) + '</b><small>' + s.test + ' · อายุ ' + nz(s.age) + '</small></div></li>';
        }).join('') + '</ul>' : '') +
        (c.issue ? '<p class="issue-line">⚠ ' + esc(c.issue) + '</p>' : '') +
        '</article>';
    }).join('');
  }

  /* ---------- edit dialog ---------- */
  var dlg = $('#editDlg'), form = $('#editForm');
  var FIELDS = ['group', 'farm', 'vendor', 'house', 'batch', 'count', 'start', 'move'];

  function openEdit(id) {
    var f = id ? state.data.flocks.find(function (x) { return x.id === id; }) : null;
    state.editing = f ? f.id : null;
    $('#editTitle').textContent = f ? 'แก้ไขฝูง' : 'เพิ่มฝูง';
    $('#delBtn').hidden = !f;
    var init = f || { group: state.group !== 'ทั้งหมด' ? state.group : (groups()[0] || ''), farm: '', vendor: '', house: '', batch: '', count: '', start: '', move: '' };
    FIELDS.forEach(function (k) { form.elements[k].value = init[k] == null ? '' : init[k]; });
    $('#dlGroups').innerHTML = groups().map(function (g) { return '<option value="' + esc(g) + '">'; }).join('');
    updateFarmList();
    updatePreview();
    form.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
    dlg.showModal();
    setTimeout(function () { form.elements[f ? 'move' : (init.group ? 'farm' : 'group')].focus(); }, 30);
  }

  function updateFarmList() {
    var g = form.elements.group.value.trim(), farms = {};
    state.data.flocks.forEach(function (f) { if (!g || f.group === g) farms[f.farm] = f.vendor; });
    $('#dlFarms').innerHTML = Object.keys(farms).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('');
    return farms;
  }

  function formValue() {
    var v = {};
    FIELDS.forEach(function (k) { v[k] = form.elements[k].value.trim(); });
    v.count = v.count === '' ? null : Number(v.count);
    return v;
  }

  function updatePreview() {
    var v = formValue();
    v.id = state.editing || '__new';
    var others = state.data.flocks.filter(function (x) { return x.id !== state.editing; }).concat([v]);
    var c = C.compute(v, state.ref, others);
    var cell = function (label, val, cls) { return '<div class="' + (cls || '') + '"><span>' + label + '</span><b>' + (val === '' || val === null ? '—' : val) + '</b></div>'; };
    $('#preview').innerHTML =
      '<div class="pv-grid">' +
      cell('อายุ (วัน)', nz(c.age), c.age >= 105 ? 'age-ok' : '') + cell('สัปดาห์-วัน', c.ageWD) + cell('ครบ 105 วัน', fmtDay(c.d105)) +
      cell('อายุวันย้าย', nz(c.moveAge)) + cell('เหลืออีก (วัน)', nz(c.left)) +
      cell('สถานะ', c.status ? '<span class="status ' + STATUS_CLS[c.status] + '">' + c.status + '</span>' : '') +
      c.samples.map(function (s) { return cell('ก่อนจับ ' + s.days + ' วัน', s.date !== null ? fmtDay(s.date) + ' <small>(อายุ ' + nz(s.age) + ')</small>' : '', 's-date ' + s.state); }).join('') +
      '</div>' + (c.issue ? '<p class="issue-line">⚠ ' + esc(c.issue) + '</p>' : '');
  }

  form.addEventListener('input', function (e) {
    if (e.target.name === 'group') updateFarmList();
    if (e.target.name === 'farm') {
      var farms = updateFarmList(), vendor = farms[e.target.value.trim()];
      if (vendor && !form.elements.vendor.value) form.elements.vendor.value = vendor;
    }
    e.target.classList.remove('invalid');
    updatePreview();
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var v = formValue(), bad = false;
    ['group', 'farm', 'house'].forEach(function (k) { if (!v[k]) { form.elements[k].classList.add('invalid'); bad = true; } });
    if (bad) { toast('กรุณากรอก กลุ่ม, ฟาร์ม และโรงเรือน'); return; }
    var msg;
    if (state.editing) {
      var f = state.data.flocks.find(function (x) { return x.id === state.editing; });
      Object.assign(f, v);
      msg = 'แก้ไข ' + v.farm + ' ' + v.house;
    } else {
      v.id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      v.done = {};
      state.data.flocks.push(v);
      msg = 'เพิ่ม ' + v.farm + ' ' + v.house;
    }
    dlg.close();
    render();
    persist(msg);
  });

  $('#delBtn').addEventListener('click', function () {
    var f = state.data.flocks.find(function (x) { return x.id === state.editing; });
    if (!f || !confirm('ลบ ' + f.farm + ' ' + f.house + ' ?')) return;
    state.data.flocks = state.data.flocks.filter(function (x) { return x.id !== f.id; });
    dlg.close();
    render();
    persist('ลบ ' + f.farm + ' ' + f.house);
  });

  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { b.closest('dialog').close(); });
  });

  /* ---------- persistence ---------- */
  async function persist(msg) {
    setSync('saving', 'กำลังบันทึก…');
    try {
      var res = await S.save(state.data, msg);
      var where = res.online ? 'บันทึกออนไลน์แล้ว' : res.synced ? 'บันทึกขึ้น GitHub แล้ว' : 'บันทึกในเครื่องนี้แล้ว';
      setSync(res.synced ? 'synced' : 'local', res.online ? 'ข้อมูลออนไลน์' : res.synced ? 'บันทึกขึ้น GitHub แล้ว' : 'บันทึกในเครื่องนี้');
      toast(msg + ' — ' + where);
    } catch (e) {
      if (e.conflict) {
        setSync('error', 'ข้อมูลบน GitHub เปลี่ยน');
        banner('มีคนบันทึกข้อมูลบน GitHub ก่อนหน้านี้ การแก้ไขล่าสุดของคุณยังเก็บอยู่ในเครื่อง — <button type="button" class="link-btn" data-banner="force">บันทึกทับ</button> หรือ <button type="button" class="link-btn" data-banner="reload">โหลดข้อมูลล่าสุด (ทิ้งการแก้ไข)</button>');
      } else if (S.isOnlineDb()) {
        setSync('error', 'บันทึกไม่สำเร็จ');
        toast('บันทึกไม่สำเร็จ: ' + (e.message || e.code) + ' — คุณอาจมีสิทธิ์ดูอย่างเดียว', 6000);
      } else {
        setSync('error', 'บันทึกขึ้น GitHub ไม่สำเร็จ');
        toast('บันทึกขึ้น GitHub ไม่สำเร็จ: ' + e.message + ' (ข้อมูลยังอยู่ในเครื่องนี้)', 6000);
      }
    }
  }

  async function reload() {
    setSync('saving', 'กำลังโหลด…');
    try {
      var res = await S.load();
      state.data = res.data;
      banner('');
      document.querySelectorAll('[data-act="github"], #menu hr').forEach(function (el) { el.hidden = res.source === 'db'; });
      if (res.source === 'db') setSync('synced', 'ข้อมูลออนไลน์');
      else if (res.source === 'github') setSync('synced', 'เชื่อมต่อ GitHub');
      else if (res.pendingLocal) {
        setSync('local', 'บันทึกในเครื่องนี้');
        if (!S.ghEnabled()) banner('มีการแก้ไขที่บันทึกไว้เฉพาะในเบราว์เซอร์นี้ — ตั้งค่า <button type="button" class="link-btn" data-banner="github">บันทึกขึ้น GitHub</button> เพื่อให้ทุกคนเห็นข้อมูลเดียวกัน');
      } else setSync('local', S.ghEnabled() ? 'ยังไม่มีไฟล์บน GitHub' : 'บันทึกในเครื่องนี้');
    } catch (e) {
      setSync('error', 'โหลดข้อมูลไม่สำเร็จ');
      banner('โหลดข้อมูลไม่สำเร็จ: ' + esc(e.message));
    }
    render();
  }

  function setSync(st, text) {
    $('#syncChip').dataset.state = st;
    $('#syncText').textContent = text;
  }

  /* ---------- GitHub settings ---------- */
  var ghDlg = $('#ghDlg'), ghForm = $('#ghForm');
  function openGitHub() {
    var c = S.ghConfig();
    ['owner', 'repo', 'branch', 'path', 'token'].forEach(function (k) { ghForm.elements[k].value = c[k] || ''; });
    ghDlg.showModal();
  }
  ghForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var cfg = {};
    ['owner', 'repo', 'branch', 'path', 'token'].forEach(function (k) { cfg[k] = ghForm.elements[k].value.trim(); });
    if (!cfg.token) { toast('กรุณาใส่ Token'); return; }
    try {
      var remote = await S.setGitHub(cfg);
      ghDlg.close();
      if (!remote) { await S.ghPushInitial(state.data); toast('สร้างไฟล์ข้อมูลบน GitHub แล้ว'); }
      else toast('เชื่อมต่อ GitHub แล้ว');
      reload();
    } catch (err) {
      toast('เชื่อมต่อไม่สำเร็จ: ' + err.message, 6000);
    }
  });
  $('#ghClear').addEventListener('click', function () { S.clearGitHub(); ghDlg.close(); toast('ล้างการตั้งค่า GitHub แล้ว'); reload(); });

  /* ---------- misc UI ---------- */
  var toastTimer;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3200);
  }
  function banner(html) { var b = $('#banner'); b.innerHTML = html; b.hidden = !html; }

  document.addEventListener('click', async function (e) {
    var t = e.target;
    if (t.closest('.sck')) return; // checkbox เก็บตัวอย่าง ไม่เปิดฟอร์มแก้ไข
    var row = t.closest('[data-id]');
    if (row && !t.closest('dialog')) { openEdit(row.dataset.id); return; }
    var g = t.closest('[data-group]');
    if (g) { state.group = g.dataset.group; saveUI(); render(); return; }
    if (t.closest('[data-kpi="issue"]')) { state.onlyIssue = true; $('#onlyIssue').checked = true; saveUI(); render(); document.getElementById('listTitle').scrollIntoView({ behavior: 'smooth' }); return; }
    var bAct = t.closest('[data-banner]');
    if (bAct) {
      var a = bAct.dataset.banner;
      if (a === 'github') openGitHub();
      if (a === 'reload') { try { localStorage.removeItem('pullet.data.v1'); } catch (er) { /* ignore */ } reload(); }
      if (a === 'force') { try { await S.refreshSha(); } catch (er) { /* ignore */ } banner(''); persist('บันทึกทับข้อมูล'); }
      return;
    }
    if (!t.closest('.menu-wrap')) closeMenu();
  });
  document.addEventListener('change', function (e) {
    var cb = e.target.closest && e.target.closest('input[data-sample]');
    if (!cb) return;
    var parts = cb.dataset.sample.split('|'), days = parts[1];
    var f = state.data.flocks.find(function (x) { return x.id === parts[0]; });
    if (!f) return;
    f.done = Object.assign({}, f.done);
    if (cb.checked) f.done[days] = true; else delete f.done[days];
    render();
    persist((cb.checked ? 'เก็บตัวอย่างแล้ว' : 'ยกเลิกเก็บตัวอย่าง') + ' ก่อนจับ ' + days + ' วัน · ' + f.farm + ' ' + f.house);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('[data-id]') && !e.target.closest('.sck')) openEdit(e.target.dataset.id);
  });

  function closeMenu() { $('#menu').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); }
  $('#menuBtn').addEventListener('click', function () {
    var m = $('#menu'); m.hidden = !m.hidden; this.setAttribute('aria-expanded', String(!m.hidden));
  });
  $('#menu').addEventListener('click', async function (e) {
    var act = e.target.dataset.act; if (!act) return;
    closeMenu();
    if (act === 'xlsx') {
      try { toast('กำลังสร้างไฟล์ Excel…'); await X.xlsx(state.data, state.ref, groups()); } catch (err) { toast(err.message); }
    }
    if (act === 'json') { try { await X.json(state.data); } catch (err) { toast(err.message); } }
    if (act === 'import') $('#importFile').click();
    if (act === 'github') openGitHub();
    if (act === 'reload') reload();
  });
  $('#syncChip').addEventListener('click', function () { if (!S.isOnlineDb()) openGitHub(); });
  // ข้อมูลเปลี่ยนจากผู้ใช้อื่น (โหมดออนไลน์) → แสดงผลทันที
  S.onRemote(function (data) { state.data = data; render(); });

  $('#importFile').addEventListener('change', function () {
    var file = this.files[0]; if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = S.normalize(JSON.parse(rd.result));
        if (!confirm('นำเข้า ' + d.flocks.length + ' ฝูง แทนที่ข้อมูลปัจจุบัน ' + state.data.flocks.length + ' ฝูง ?')) return;
        state.data = d; render(); persist('นำเข้าข้อมูล ' + d.flocks.length + ' ฝูง');
      } catch (err) { toast('ไฟล์ไม่ถูกต้อง: ' + err.message); }
    };
    rd.readAsText(file);
    this.value = '';
  });

  $('#addBtn').addEventListener('click', function () { openEdit(null); });
  $('#refDate').addEventListener('change', function () { if (this.value) { state.ref = this.value; render(); } });
  $('#refToday').addEventListener('click', function () { state.ref = C.todayISO(); render(); });
  $('#search').addEventListener('input', function () { state.q = this.value; render(); });
  $('#showMoved').checked = state.showMoved;
  $('#onlyIssue').checked = state.onlyIssue;
  $('#showMoved').addEventListener('change', function () { state.showMoved = this.checked; saveUI(); render(); });
  $('#onlyIssue').addEventListener('change', function () { state.onlyIssue = this.checked; saveUI(); render(); });

  // อัปเดตวันที่อ้างอิงอัตโนมัติเมื่อข้ามวัน (ถ้ายังใช้ "วันนี้" อยู่)
  var lastToday = C.todayISO();
  setInterval(function () {
    var t = C.todayISO();
    if (t !== lastToday) { if (state.ref === lastToday) state.ref = t; lastToday = t; render(); }
  }, 60000);

  reload();
})();
