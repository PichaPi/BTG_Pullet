/*
 * calc.js — สูตรคำนวณทั้งหมด ยกมาจากไฟล์ Pullet_Age.xlsx แบบ 1:1
 *
 *   อายุ (วัน)          G = วันอ้างอิง − วันเริ่มเลี้ยง                      =IF($F6="","",$E$2-$F6)
 *   อายุ (สัปดาห์-วัน)   H = INT(G/7) & "-" & MOD(G,7)                       =IF($F6="","",INT($G6/7)&"-"&MOD($G6,7))
 *   ครบ 105 วัน          I = วันเริ่มเลี้ยง + 105                              =IF($F6="","",$F6+105)
 *   อายุวันย้าย          K = วันย้าย − วันเริ่มเลี้ยง                          =IF(OR($F6="",$J6=""),"",$J6-$F6)
 *   เหลืออีก (วัน)       L = วันย้าย − วันอ้างอิง                             =IF($J6="","",$J6-$E$2)
 *   สถานะ               M = รอกำหนดวันย้าย / ย้ายแล้ว / ใกล้ย้าย (≤7 วัน) / ปกติ
 *   ก่อนจับ 17/10/3 วัน  อายุ = K − n , วันที่เก็บ = J − n
 *   ตรวจสอบ (ข้อมูลผิดปกติ) ตามสูตรคอลัมน์ S ของแผ่น "ไก่สาวโครงการ"
 */
(function (root) {
  'use strict';

  var DAY = 86400000;
  var SAMPLE_PLAN = [
    { days: 17, test: 'TITER + PCR' },
    { days: 10, test: 'TITER + PCR' },
    { days: 3, test: 'PCR' }
  ];
  var AGE_TARGET = 105;       // ครบ 105 วัน
  var MOVE_SOON_DAYS = 7;     // ใกล้ย้าย เมื่อเหลือ ≤ 7 วัน
  var SAMPLE_WINDOW = 7;      // ไฮไลต์วันเก็บตัวอย่างที่ถึงกำหนดภายใน 7 วัน
  var NO_MOVE_WARN_AGE = 91;  // อายุ ≥ 91 วัน แต่ยังไม่กำหนดวันย้าย
  var MOVE_AGE_MAX = 125;     // อายุวันย้ายเกิน 125 วัน

  /* วันที่เก็บเป็นสตริง 'YYYY-MM-DD' และคำนวณเป็น "เลขวัน" (เหมือน serial ของ Excel) เพื่อไม่ให้ timezone มายุ่ง */
  function toDay(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
  }
  function fromDay(n) {
    if (n === null || n === undefined) return '';
    return new Date(n * DAY).toISOString().slice(0, 10);
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function isBlank(v) { return v === null || v === undefined || String(v).trim() === ''; }
  /* MOD ของ Excel ให้ผลเครื่องหมายตามตัวหาร (7 → ไม่ติดลบเสมอ) */
  function excelMod(a, b) { return ((a % b) + b) % b; }

  function compute(f, refISO, all) {
    var ref = toDay(refISO);
    var start = toDay(f.start);
    var move = toDay(f.move);
    var r = {
      age: null, ageWD: '', d105: null, moveAge: null, left: null,
      status: '', samples: [], issue: ''
    };

    if (start !== null) {
      r.age = ref - start;
      r.ageWD = Math.floor(r.age / 7) + '-' + excelMod(r.age, 7);
      r.d105 = start + AGE_TARGET;
    }
    if (start !== null && move !== null) r.moveAge = move - start;
    if (move !== null) r.left = move - ref;

    // สถานะ (สูตรคอลัมน์ M แผ่น KBP)
    if (start !== null) {
      if (move === null) r.status = 'รอกำหนดวันย้าย';
      else if (ref > move) r.status = 'ย้ายแล้ว';
      else if (move - ref <= MOVE_SOON_DAYS) r.status = 'ใกล้ย้าย';
      else r.status = 'ปกติ';
    }

    // แผนเก็บตัวอย่างย้อนหลังจากวันย้าย
    // state: 'done' = ติ๊กว่าเก็บแล้ว (สีเทา) · 'overdue' = เลยวันแต่ยังไม่เก็บ (ตัวแดง)
    //        'due' = ถึงกำหนดภายใน 7 วัน (ไฮไลต์เหลือง) · '' = ยังไม่ถึง
    var done = f.done || {};
    r.samples = SAMPLE_PLAN.map(function (p) {
      var date = move === null ? null : move - p.days;
      var isDone = !!done[p.days];
      var state = '';
      if (date !== null) {
        if (isDone) state = 'done';
        else if (date < ref) state = 'overdue';
        else if (date <= ref + SAMPLE_WINDOW) state = 'due';
      }
      return {
        days: p.days, test: p.test,
        age: r.moveAge === null ? null : r.moveAge - p.days,
        date: date, state: state, done: isDone
      };
    });

    r.issue = checkIssue(f, r, ref, start, move, all);
    return r;
  }

  // สูตรคอลัมน์ "ข้อมูลผิดปกติ" (ไก่สาวโครงการ!S6) — ลำดับเงื่อนไขเหมือนเดิม
  function checkIssue(f, r, ref, start, move, all) {
    if (isBlank(f.farm) || isBlank(f.house)) return '';
    if (isBlank(f.start)) return 'ยังไม่กรอกวันเริ่มเลี้ยง';
    if (start === null) return 'วันเริ่มเลี้ยงไม่ใช่วันที่';
    if (start > ref) return 'วันเริ่มเลี้ยงเป็นวันในอนาคต';
    if (isBlank(f.count)) return 'ยังไม่กรอกจำนวนไก่';
    if (all) {
      var dup = all.filter(function (o) {
        return o.group === f.group &&
          String(o.farm).trim() === String(f.farm).trim() &&
          String(o.house).trim() === String(f.house).trim();
      }).length;
      if (dup > 1) return 'โรงเรือนซ้ำ';
    }
    if (isBlank(f.move)) return r.age >= NO_MOVE_WARN_AGE ? 'อายุ ≥91 วัน แต่ยังไม่กำหนดวันย้าย' : '';
    if (move === null) return 'วันย้ายไม่ใช่วันที่';
    if (move <= start) return 'วันย้ายอยู่ก่อนวันเริ่มเลี้ยง';
    if (r.moveAge < AGE_TARGET) return 'ย้ายก่อนครบ 105 วัน';
    if (r.moveAge > MOVE_AGE_MAX) return 'อายุวันย้ายเกิน 125 วัน';
    return '';
  }

  /*
   * ลำดับการแสดงผล: วันย้ายใกล้วันนี้ที่สุดขึ้นก่อน
   *   1) ฝูงที่ยังไม่ย้าย — เรียงวันย้ายจากใกล้ → ไกล
   *   2) ฝูงที่ยังไม่กำหนดวันย้าย
   *   3) ฝูงที่ย้ายแล้ว — ย้ายล่าสุดขึ้นก่อน
   */
  function sortRank(f, refISO) {
    var ref = toDay(refISO), move = toDay(f.move);
    if (move === null) return [1, 0];
    if (move >= ref) return [0, move - ref];
    return [2, ref - move];
  }
  function sortFlocks(list, refISO) {
    return list.slice().sort(function (a, b) {
      var ra = sortRank(a, refISO), rb = sortRank(b, refISO);
      if (ra[0] !== rb[0]) return ra[0] - rb[0];
      if (ra[1] !== rb[1]) return ra[1] - rb[1];
      return (String(a.farm) + a.house).localeCompare(String(b.farm) + b.house, 'th');
    });
  }

  var api = {
    SAMPLE_PLAN: SAMPLE_PLAN, AGE_TARGET: AGE_TARGET, SAMPLE_WINDOW: SAMPLE_WINDOW,
    toDay: toDay, fromDay: fromDay, todayISO: todayISO,
    compute: compute, sortFlocks: sortFlocks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PulletCalc = api;
})(this);
