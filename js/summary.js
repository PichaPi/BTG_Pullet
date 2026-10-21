/* summary.js — หน้า Summary: ภาพรวมอายุไก่สาว รายกลุ่ม / รายฟาร์ม / แผนย้าย */
(function (root) {
  'use strict';

  var C = root.PulletCalc;
  var TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var BANDS = [
    { label: '0–6 สัปดาห์', sub: '0–48 วัน', min: 0, max: 48 },
    { label: '7–12 สัปดาห์', sub: '49–90 วัน', min: 49, max: 90 },
    { label: '13–14 สัปดาห์', sub: '91–104 วัน', min: 91, max: 104 },
    { label: '15 สัปดาห์ขึ้นไป', sub: '≥ 105 วัน', min: 105, max: Infinity }
  ];

  function sum(list, fn) { return list.reduce(function (a, x) { return a + (fn(x) || 0); }, 0); }
  function birds(r) { return Number(r.f.count) || 0; }
  /* อายุเฉลี่ยถ่วงด้วยจำนวนไก่ (ถ้าไม่มีจำนวนไก่ ใช้ค่าเฉลี่ยธรรมดา) */
  function avgAge(list) {
    if (!list.length) return null;
    var w = sum(list, birds);
    if (w > 0) return sum(list, function (r) { return r.c.age * birds(r); }) / w;
    return sum(list, function (r) { return r.c.age; }) / list.length;
  }
  function wd(age) { return Math.floor(age / 7) + '-' + (((age % 7) + 7) % 7); }

  function render(scope, h) {
    var esc = h.esc, fmtDay = h.fmtDay, fmtNum = h.fmtNum;
    var moved = scope.filter(function (r) { return r.c.status === 'ย้ายแล้ว'; });
    var current = scope.filter(function (r) { return r.c.status !== 'ย้ายแล้ว'; });
    var active = current.filter(function (r) { return r.c.age !== null; });
    var pending = current.filter(function (r) { return r.c.age === null; });
    var ref = C.toDay(h.ref);

    var out = '';

    /* ---------- 1) ภาพรวมรายกลุ่ม ---------- */
    var gs = [];
    current.forEach(function (r) { if (gs.indexOf(r.f.group) < 0) gs.push(r.f.group); });
    function groupRow(name, list, cls) {
      var act = list.filter(function (r) { return r.c.age !== null; });
      var farms = {};
      list.forEach(function (r) { farms[r.f.farm] = 1; });
      var ages = act.map(function (r) { return r.c.age; });
      var avg = avgAge(act);
      return '<tr class="' + (cls || '') + '"><th scope="row">' + esc(name) + '</th>' +
        '<td class="num">' + Object.keys(farms).length + '</td>' +
        '<td class="num">' + act.length + '</td>' +
        '<td class="num">' + fmtNum(sum(act, birds)) + '</td>' +
        '<td class="num">' + (avg === null ? '—' : Math.round(avg) + ' <small>(' + wd(Math.round(avg)) + ')</small>') + '</td>' +
        '<td class="num">' + (ages.length ? Math.min.apply(null, ages) + '–' + Math.max.apply(null, ages) : '—') + '</td>' +
        '<td class="num">' + act.filter(function (r) { return r.c.age >= C.AGE_TARGET; }).length + '</td>' +
        '<td class="num">' + (list.length - act.length) + '</td></tr>';
    }
    out += '<section class="panel sum-wide"><div class="panel-head"><h2>ภาพรวมรายกลุ่ม</h2>' +
      '<span class="muted small">' + (moved.length ? 'ไม่นับ ' + moved.length + ' โรงเรือนที่ย้ายแล้ว' : 'ฝูงที่ยังไม่ย้ายทั้งหมด') + '</span></div>' +
      '<div class="sum-table-wrap"><table class="sum-table"><thead><tr><th>กลุ่ม</th><th class="num">ฟาร์ม</th><th class="num">โรงเรือนที่เลี้ยงอยู่</th>' +
      '<th class="num">ไก่รวม (ตัว)</th><th class="num">อายุเฉลี่ย (วัน)</th><th class="num">อายุ ต่ำสุด–สูงสุด</th><th class="num">ครบ 105 วันแล้ว</th><th class="num">รอลงเลี้ยง</th></tr></thead><tbody>' +
      gs.map(function (g) { return groupRow(g, current.filter(function (r) { return r.f.group === g; })); }).join('') +
      '</tbody>' + (gs.length > 1 ? '<tfoot>' + groupRow('รวมทั้งหมด', current, 'total') + '</tfoot>' : '') + '</table></div>' +
      '<p class="muted small sum-foot">อายุเฉลี่ยถ่วงด้วยจำนวนไก่ · สัปดาห์-วันในวงเล็บ</p></section>';

    /* ---------- 2) การกระจายอายุ ---------- */
    var bandData = BANDS.map(function (b) {
      var l = active.filter(function (r) { return r.c.age >= b.min && r.c.age <= b.max; });
      return { b: b, houses: l.length, birds: sum(l, birds) };
    });
    var maxB = Math.max.apply(null, bandData.map(function (x) { return x.birds; }).concat([1]));
    out += '<section class="panel"><div class="panel-head"><h2>การกระจายอายุ</h2><span class="muted small">จำนวนไก่ตามช่วงอายุ</span></div>' +
      '<ul class="hbars">' + bandData.map(function (x) {
        var w = x.birds ? Math.max(2, x.birds / maxB * 100) : 0;
        return '<li title="' + esc(x.b.label + ' (' + x.b.sub + '): ' + x.houses + ' โรงเรือน · ' + fmtNum(x.birds) + ' ตัว') + '">' +
          '<span class="hb-label">' + x.b.label + '<small>' + x.b.sub + '</small></span>' +
          '<span class="hb-track"><span class="hb-fill" style="width:' + w.toFixed(1) + '%"></span></span>' +
          '<span class="hb-val"><b>' + fmtNum(x.birds) + '</b><small>' + x.houses + ' โรงเรือน</small></span></li>';
      }).join('') + '</ul></section>';

    /* ---------- 3) แผนย้ายรายเดือน ---------- */
    var months = {};
    current.forEach(function (r) {
      var m = C.toDay(r.f.move);
      if (m === null || m < ref) return;
      var d = new Date(m * 86400000), key = d.getUTCFullYear() * 100 + d.getUTCMonth();
      (months[key] = months[key] || { y: d.getUTCFullYear(), m: d.getUTCMonth(), list: [] }).list.push(r);
    });
    var mk = Object.keys(months).sort();
    var maxM = Math.max.apply(null, mk.map(function (k) { return sum(months[k].list, birds); }).concat([1]));
    out += '<section class="panel"><div class="panel-head"><h2>แผนย้ายรายเดือน</h2><span class="muted small">ฝูงที่กำหนดวันย้ายแล้ว</span></div>' +
      (mk.length ? '<ul class="hbars months">' + mk.map(function (k) {
        var mo = months[k], b = sum(mo.list, birds);
        mo.list.sort(function (a, c) { return C.toDay(a.f.move) - C.toDay(c.f.move); });
        return '<li title="' + esc(TH_MON[mo.m] + ' ' + mo.y + ': ' + mo.list.length + ' โรงเรือน · ' + fmtNum(b) + ' ตัว') + '">' +
          '<span class="hb-label">' + TH_MON[mo.m] + ' ' + String(mo.y).slice(2) + '<small>' + mo.list.length + ' โรงเรือน</small></span>' +
          '<span class="hb-track"><span class="hb-fill" style="width:' + Math.max(2, b / maxM * 100).toFixed(1) + '%"></span></span>' +
          '<span class="hb-val"><b>' + fmtNum(b) + '</b><small>ตัว</small></span>' +
          '<span class="hb-chips">' + mo.list.map(function (r) {
            return '<span class="chip" data-id="' + esc(r.f.id) + '">' + esc(r.f.farm) + ' ' + esc(r.f.house) + ' · ' + fmtDay(C.toDay(r.f.move)) + '</span>';
          }).join('') + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted">ยังไม่มีฝูงที่กำหนดวันย้าย</p>') + '</section>';

    /* ---------- 4) อายุปัจจุบันรายฟาร์ม / โรงเรือน ---------- */
    var scale = Math.max(130, Math.max.apply(null, current.map(function (r) { return Math.max(r.c.moveAge || 0, r.c.age || 0); }).concat([0])) + 5);
    var farms = [], fmap = {};
    current.forEach(function (r) {   // current มาตามลำดับวันย้ายใกล้สุดแล้ว
      var key = r.f.group + '|' + r.f.farm;
      if (!fmap[key]) { fmap[key] = { group: r.f.group, farm: r.f.farm, vendor: r.f.vendor, list: [] }; farms.push(fmap[key]); }
      fmap[key].list.push(r);
    });
    function pct(v) { return (Math.min(v, scale) / scale * 100).toFixed(1) + '%'; }
    function dots(c) {
      if (c.samples[0].date === null) return '<span class="muted">—</span>';
      return c.samples.map(function (s) {
        var t = 'ก่อนจับ ' + s.days + ' วัน · ' + fmtDay(s.date) + ' · ' +
          (s.state === 'done' ? 'เก็บแล้ว' : s.state === 'overdue' ? 'เลยวัน ยังไม่เก็บ' : s.state === 'due' ? 'ถึงกำหนดใน 7 วัน' : 'ยังไม่ถึง');
        return '<span class="sdot s-' + (s.state || 'later') + '" title="' + esc(t) + '">' + (s.state === 'done' ? '✓' : s.days) + '</span>';
      }).join('');
    }
    out += '<section class="panel sum-wide"><div class="panel-head wrap"><h2>อายุปัจจุบันรายฟาร์ม</h2>' +
      '<span class="legend"><span><i class="lg-fill"></i>อายุปัจจุบัน</span><span><i class="lg-105"></i>105 วัน</span><span><i class="lg-move"></i>อายุวันย้าย</span>' +
      '<span><span class="sdot s-done">✓</span>เก็บแล้ว</span><span><span class="sdot s-due">10</span>ใน 7 วัน</span><span><span class="sdot s-overdue">17</span>เลยวัน</span></span></div>' +
      farms.map(function (fm) {
        var act = fm.list.filter(function (r) { return r.c.age !== null; });
        fm.list.sort(function (a, b) { return String(a.f.house).localeCompare(String(b.f.house), 'th', { numeric: true }); });
        return '<div class="farm-block"><div class="farm-head"><b>' + esc(fm.farm) + '</b>' +
          '<span class="muted small">' + esc(fm.group) + (fm.vendor ? ' · ' + esc(fm.vendor) : '') + '</span>' +
          '<span class="farm-stats"><span>' + fm.list.length + ' โรงเรือน</span><span>' + fmtNum(sum(act, birds)) + ' ตัว</span>' +
          (act.length ? '<span>อายุเฉลี่ย ' + Math.round(avgAge(act)) + ' วัน</span>' : '') + '</span></div>' +
          '<div class="hrow hrow-head" aria-hidden="true"><span>โรงเรือน</span><span>วันลงเลี้ยง</span><span>อายุ</span><span>อายุ 0 → ' + scale + ' วัน</span><span>วันย้าย</span><span>ตัวอย่าง</span><span>สถานะ</span></div>' +
          fm.list.map(function (r) {
            var f = r.f, c = r.c;
            if (c.age === null) {
              return '<div class="hrow pending" data-id="' + esc(f.id) + '" tabindex="0"><span class="h-house">' + esc(f.house) + '</span>' +
                '<span class="h-start muted">ยังไม่ลงเลี้ยง</span><span class="h-age"></span><span class="h-bar"></span>' +
                '<span class="h-move">' + (f.move ? fmtDay(C.toDay(f.move)) : '') + '</span><span class="h-dots"></span><span class="h-status"></span></div>';
            }
            var tip = 'อายุ ' + c.age + ' วัน (' + c.ageWD + ') · ครบ 105 วัน ' + fmtDay(c.d105) + (c.moveAge !== null ? ' · ย้ายที่อายุ ' + c.moveAge + ' วัน' : '');
            return '<div class="hrow" data-id="' + esc(f.id) + '" tabindex="0">' +
              '<span class="h-house">' + esc(f.house) + (f.count ? '<small>' + fmtNum(f.count) + ' ตัว</small>' : '') + '</span>' +
              '<span class="h-start"><small class="m-only">ลงเลี้ยง </small>' + fmtDay(C.toDay(f.start)) + '</span>' +
              '<span class="h-age"><b class="' + (c.age >= C.AGE_TARGET ? 'age-ok' : '') + '">' + c.age + ' วัน</b><small>' + c.ageWD + ' สัปดาห์</small></span>' +
              '<span class="h-bar" title="' + esc(tip) + '"><span class="tl">' +
                '<span class="tl-fill" style="width:' + pct(Math.max(c.age, 0)) + '"></span>' +
                '<span class="tl-105" style="left:' + pct(C.AGE_TARGET) + '"></span>' +
                (c.moveAge !== null ? '<span class="tl-move" style="left:' + pct(c.moveAge) + '"></span>' : '') +
              '</span></span>' +
              '<span class="h-move">' + (f.move ? '<b>' + fmtDay(C.toDay(f.move)) + '</b><small>' + (c.left >= 0 ? 'อีก ' + c.left + ' วัน' : '') + ' · อายุ ' + c.moveAge + '</small>' : '<span class="muted">ยังไม่กำหนด</span>') + '</span>' +
              '<span class="h-dots">' + dots(c) + '</span>' +
              '<span class="h-status">' + (c.status ? '<span class="status ' + h.STATUS_CLS[c.status] + '">' + c.status + '</span>' : '') + '</span>' +
              '</div>';
          }).join('') + '</div>';
      }).join('') + (farms.length ? '' : '<p class="muted">ไม่มีฝูงที่เลี้ยงอยู่</p>') + '</section>';

    return out;
  }

  root.PulletSummary = { render: render };
})(this);
