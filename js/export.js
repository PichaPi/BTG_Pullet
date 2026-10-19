/*
 * export.js — ส่งออก Excel (.xlsx) โดยใส่สูตรเดิมไว้ในทุกเซลล์ที่คำนวณ
 * เปิดใน Excel แล้วสูตรคำนวณต่อได้ตามปกติ (E2 = TODAY())
 */
(function (root) {
  'use strict';

  var XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var EXCEL_EPOCH = 25569; // 1970-01-01 ใน serial ของ Excel
  var DATE_FMT = '[$-41E]d mmm yy';

  function loadXLSX() {
    if (root.XLSX) return Promise.resolve(root.XLSX);
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = XLSX_SRC; s.onload = function () { ok(root.XLSX); };
      s.onerror = function () { fail(new Error('โหลดไลบรารี Excel ไม่ได้')); };
      document.head.appendChild(s);
    });
  }

  function serial(dayNum) { return dayNum === null || dayNum === undefined ? null : dayNum + EXCEL_EPOCH; }
  function sheetName(s) { return String(s || 'Sheet').replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31); }

  function buildSheet(XLSX, group, flocks, refISO, C) {
    var ws = {};
    var first = 6, last = first + flocks.length - 1;
    function put(addr, cell) { ws[addr] = cell; }
    function txt(addr, v) { put(addr, { t: 's', v: String(v) }); }
    function f(addr, formula, v, z) {
      var cell = { f: formula };
      if (v === null || v === undefined || v === '') { cell.t = 's'; cell.v = ''; }
      else if (typeof v === 'number') { cell.t = 'n'; cell.v = v; }
      else { cell.t = 's'; cell.v = String(v); }
      if (z) cell.z = z;
      put(addr, cell);
    }

    txt('A1', group + '  —  ตารางติดตามอายุไก่สาว');
    txt('A2', 'วันที่อ้างอิง :');
    put('E2', { t: 'n', f: 'TODAY()', v: serial(C.toDay(refISO)), z: DATE_FMT });

    txt('A4', 'ข้อมูลฝูงไก่สาว'); txt('G4', 'อายุปัจจุบัน'); txt('J4', 'แผนย้าย / จับ');
    txt('N4', 'ก่อนจับ 17 วัน (TITER + PCR)'); txt('P4', 'ก่อนจับ 10 วัน (TITER + PCR)');
    txt('R4', 'ก่อนจับ 3 วัน (PCR)'); txt('T4', 'ตรวจสอบ'); txt('U4', 'เก็บตัวอย่างแล้ว');
    ['ฟาร์ม', 'Vendor', 'โรงเรือน', 'รุ่น', 'จำนวนไก่ (ตัว)', 'วันเริ่มเลี้ยง', 'อายุ (วัน)', 'อายุ (สัปดาห์-วัน)',
      'ครบ 105 วัน', 'วันย้าย', 'อายุวันย้าย', 'เหลืออีก (วัน)', 'สถานะ', 'อายุ', 'วันที่เก็บ', 'อายุ', 'วันที่เก็บ',
      'อายุ', 'วันที่เก็บ', 'ข้อมูลผิดปกติ', '17 วัน', '10 วัน', '3 วัน'].forEach(function (h, i) { txt(XLSX.utils.encode_cell({ r: 4, c: i }), h); });

    flocks.forEach(function (fl, i) {
      var r = first + i, c = C.compute(fl, refISO, flocks);
      if (fl.farm) txt('A' + r, fl.farm);
      if (fl.vendor) put('B' + r, /^\d+$/.test(fl.vendor) ? { t: 'n', v: Number(fl.vendor) } : { t: 's', v: fl.vendor });
      if (fl.house) txt('C' + r, fl.house);
      if (fl.batch) put('D' + r, /^\d+$/.test(fl.batch) ? { t: 'n', v: Number(fl.batch) } : { t: 's', v: fl.batch });
      if (fl.count != null && fl.count !== '') put('E' + r, { t: 'n', v: Number(fl.count), z: '#,##0' });
      if (fl.start) put('F' + r, { t: 'n', v: serial(C.toDay(fl.start)), z: DATE_FMT });
      if (fl.move) put('J' + r, { t: 'n', v: serial(C.toDay(fl.move)), z: DATE_FMT });

      f('G' + r, 'IF($F' + r + '="","",$E$2-$F' + r + ')', c.age);
      f('H' + r, 'IF($F' + r + '="","",INT($G' + r + '/7)&"-"&MOD($G' + r + ',7))', c.ageWD);
      f('I' + r, 'IF($F' + r + '="","",$F' + r + '+105)', serial(c.d105), DATE_FMT);
      f('K' + r, 'IF(OR($F' + r + '="",$J' + r + '=""),"",$J' + r + '-$F' + r + ')', c.moveAge);
      f('L' + r, 'IF($J' + r + '="","",$J' + r + '-$E$2)', c.left, '0;\\-0;0');
      f('M' + r, 'IF($F' + r + '="","",IF($J' + r + '="","รอกำหนดวันย้าย",IF($E$2>$J' + r + ',"ย้ายแล้ว",IF($J' + r + '-$E$2<=7,"ใกล้ย้าย","ปกติ"))))', c.status);
      [['N', 'O', 17], ['P', 'Q', 10], ['R', 'S', 3]].forEach(function (p, k) {
        var s = c.samples[k];
        f(p[0] + r, 'IF($K' + r + '="","",$K' + r + '-' + p[2] + ')', s.age);
        f(p[1] + r, 'IF($J' + r + '="","",$J' + r + '-' + p[2] + ')', serial(s.date), DATE_FMT);
      });
      [['U', 17], ['V', 10], ['W', 3]].forEach(function (p) { if (fl.done && fl.done[p[1]]) txt(p[0] + r, '✓'); });
      var rng = '$A$' + first + ':$A$' + Math.max(last, 60) + ',$A' + r + ',$C$' + first + ':$C$' + Math.max(last, 60) + ',$C' + r;
      f('T' + r,
        'IF(OR($A' + r + '="",$C' + r + '=""),"",IF($F' + r + '="","ยังไม่กรอกวันเริ่มเลี้ยง",IF(NOT(ISNUMBER($F' + r + ')),"วันเริ่มเลี้ยงไม่ใช่วันที่",' +
        'IF($F' + r + '>$E$2,"วันเริ่มเลี้ยงเป็นวันในอนาคต",IF($E' + r + '="","ยังไม่กรอกจำนวนไก่",IF(COUNTIFS(' + rng + ')>1,"โรงเรือนซ้ำ",' +
        'IF($J' + r + '="",IF($G' + r + '>=91,"อายุ ≥91 วัน แต่ยังไม่กำหนดวันย้าย",""),IF(NOT(ISNUMBER($J' + r + ')),"วันย้ายไม่ใช่วันที่",' +
        'IF($J' + r + '<=$F' + r + ',"วันย้ายอยู่ก่อนวันเริ่มเลี้ยง",IF($K' + r + '<105,"ย้ายก่อนครบ 105 วัน",IF($K' + r + '>125,"อายุวันย้ายเกิน 125 วัน","")))))))))))',
        c.issue);
    });

    var tot = last + 1;
    txt('A' + tot, 'รวม ' + flocks.length + ' โรงเรือน');
    var sum = flocks.reduce(function (a, x) { return a + (Number(x.count) || 0); }, 0);
    put('E' + tot, { t: 'n', f: flocks.length ? 'SUM(E' + first + ':E' + last + ')' : '0', v: sum, z: '#,##0' });

    ws['!ref'] = 'A1:W' + tot;
    ws['!merges'] = [
      { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } }, { s: { r: 3, c: 6 }, e: { r: 3, c: 8 } },
      { s: { r: 3, c: 9 }, e: { r: 3, c: 12 } }, { s: { r: 3, c: 13 }, e: { r: 3, c: 14 } },
      { s: { r: 3, c: 15 }, e: { r: 3, c: 16 } }, { s: { r: 3, c: 17 }, e: { r: 3, c: 18 } },
      { s: { r: 3, c: 20 }, e: { r: 3, c: 22 } }
    ];
    ws['!cols'] = [24, 12, 9, 6, 12, 11, 9, 11, 11, 11, 10, 10, 15, 6, 11, 6, 11, 6, 11, 34, 7, 7, 7].map(function (w) { return { wch: w }; });
    return ws;
  }

  async function exportXlsx(data, refISO, groups) {
    var XLSX = await loadXLSX();
    var C = root.PulletCalc;
    var wb = XLSX.utils.book_new();
    groups.forEach(function (g) {
      var list = C.sortFlocks(data.flocks.filter(function (f) { return f.group === g; }), refISO);
      XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, g, list, refISO, C), sheetName(g));
    });
    var buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return download('Pullet_Age_' + refISO + '.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  /* บน claude.ai Artifact ต้องบันทึกไฟล์ผ่าน capability "downloads"; นอกนั้นใช้ลิงก์ดาวน์โหลดปกติ */
  async function download(name, data, type) {
    if (root.claude && typeof root.claude.use === 'function') {
      var dl = null;
      try { dl = await root.claude.use('downloads'); } catch (e) { dl = null; }
      if (dl) {
        try { await dl.save({ filename: name, data: data }); } catch (e) {
          if (e && e.code === 'declined') return;
          throw new Error('บันทึกไฟล์ไม่สำเร็จ (' + (e && (e.code || e.message)) + ')');
        }
        return;
      }
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  root.PulletExport = {
    xlsx: exportXlsx,
    json: function (data) { return download('flocks_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2), 'application/json'); }
  };
})(this);
