// ทดสอบสูตรคำนวณเทียบกับค่าที่ Excel (Pullet_Age.xlsx) คำนวณไว้ ณ วันที่อ้างอิง 17 ต.ค. 2026
// รัน: node tests/calc.test.js
const assert = require('assert');
const C = require('../js/calc.js');
const REF = '2026-10-17';

const cases = [
  // [start, move, age, wk-day, ครบ105, อายุวันย้าย, เหลือ, สถานะ, [อายุ17, วันที่17], [อายุ10, วันที่10], [อายุ3, วันที่3]]
  ['2026-09-03', '2026-12-24', 44, '6-2', '2026-12-17', 112, 68, 'ปกติ', [95, '2026-12-07'], [102, '2026-12-14'], [109, '2026-12-21']],
  ['2026-07-16', '2026-11-07', 93, '13-2', '2026-10-29', 114, 21, 'ปกติ', [97, '2026-10-21'], [104, '2026-10-28'], [111, '2026-11-04']],
  ['2026-10-08', '2027-02-01', 9, '1-2', '2027-01-21', 116, 107, 'ปกติ', [99, '2027-01-15'], [106, '2027-01-22'], [113, '2027-01-29']],
  ['2026-06-25', '2026-10-28', 114, '16-2', '2026-10-08', 125, 11, 'ปกติ', [108, '2026-10-11'], [115, '2026-10-18'], [122, '2026-10-25']],
  ['2026-07-06', '2026-11-01', 103, '14-5', '2026-10-19', 118, 15, 'ปกติ', [101, '2026-10-15'], [108, '2026-10-22'], [115, '2026-10-29']]
];

cases.forEach(function (t) {
  const f = { group: 'T', farm: 'F', house: 'H' + t[0], count: 1, start: t[0], move: t[1] };
  const c = C.compute(f, REF, [f]);
  assert.strictEqual(c.age, t[2]);
  assert.strictEqual(c.ageWD, t[3]);
  assert.strictEqual(C.fromDay(c.d105), t[4]);
  assert.strictEqual(c.moveAge, t[5]);
  assert.strictEqual(c.left, t[6]);
  assert.strictEqual(c.status, t[7]);
  [8, 9, 10].forEach(function (i, k) {
    assert.strictEqual(c.samples[k].age, t[i][0]);
    assert.strictEqual(C.fromDay(c.samples[k].date), t[i][1]);
  });
});

// สถานะ
const st = (start, move) => C.compute({ farm: 'F', house: 'H', count: 1, start, move }, REF, []).status;
assert.strictEqual(st('2026-07-01', ''), 'รอกำหนดวันย้าย');
assert.strictEqual(st('2026-07-01', '2026-10-16'), 'ย้ายแล้ว');
assert.strictEqual(st('2026-07-01', '2026-10-17'), 'ใกล้ย้าย');
assert.strictEqual(st('2026-07-01', '2026-10-24'), 'ใกล้ย้าย');
assert.strictEqual(st('2026-07-01', '2026-10-25'), 'ปกติ');
assert.strictEqual(st('', '2026-10-25'), '');

// ข้อมูลผิดปกติ
const iss = (f, all) => C.compute(f, REF, all || [f]).issue;
assert.strictEqual(iss({ farm: 'F', house: 'H', start: '' }), 'ยังไม่กรอกวันเริ่มเลี้ยง');
assert.strictEqual(iss({ farm: 'F', house: 'H', start: '2026-10-20', count: 1 }), 'วันเริ่มเลี้ยงเป็นวันในอนาคต');
assert.strictEqual(iss({ farm: 'F', house: 'H', start: '2026-07-01', count: null }), 'ยังไม่กรอกจำนวนไก่');
assert.strictEqual(iss({ farm: 'F', house: 'H', start: '2026-07-01', count: 1, move: '' }), 'อายุ ≥91 วัน แต่ยังไม่กำหนดวันย้าย');
assert.strictEqual(iss({ farm: 'F', house: 'H', start: '2026-09-01', count: 1, move: '' }), '');
assert.strictEqual(iss({ farm: 'F', house: 'H', start: '2026-07-01', count: 1, move: '2026-07-01' }), 'วันย้ายอยู่ก่อนวันเริ่มเลี้ยง');
assert.strictEqual(iss({ farm: 'F', house: 'H', start: '2026-07-01', count: 1, move: '2026-10-13' }), 'ย้ายก่อนครบ 105 วัน');
assert.strictEqual(iss({ farm: 'F', house: 'H', start: '2026-07-01', count: 1, move: '2026-11-04' }), 'อายุวันย้ายเกิน 125 วัน');
const a = { group: 'G', farm: 'F', house: 'H', start: '2026-07-01', count: 1, move: '2026-10-20' };
assert.strictEqual(iss(a, [a, Object.assign({}, a)]), 'โรงเรือนซ้ำ');

// การเรียงลำดับ: ใกล้วันย้ายที่สุดก่อน → ไม่มีวันย้าย → ย้ายแล้ว
const order = C.sortFlocks([
  { farm: 'moved', move: '2026-10-01' }, { farm: 'none', move: '' },
  { farm: 'far', move: '2026-12-01' }, { farm: 'near', move: '2026-10-20' }
], REF).map(f => f.farm);
assert.deepStrictEqual(order, ['near', 'far', 'none', 'moved']);

console.log('✓ calc tests passed');
