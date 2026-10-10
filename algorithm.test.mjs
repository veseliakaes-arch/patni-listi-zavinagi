// Тестове на алгоритъма за маршрути. Стартиране:  node tests/algorithm.test.mjs   (Node 18+, без зависимости)
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\nrender\(\);\s*$/, '');
const ctx = { localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ value: '' }) }, console, Math, Date, JSON, Set, Array, Object, String, Number, RegExp };
vm.createContext(ctx);
vm.runInContext(code + ';this.api={generate,workdays,recalc,describe,S,setCUR:v=>CUR=v}', ctx);
const { generate, workdays, recalc, describe, S, setCUR } = ctx.api;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('✔', name); };
const days = workdays('2026-09-01', '2026-09-30', new Set());
const pool = () => S.dests.concat(S.clients);
const gen = (T, s = 0, e = 0, d = days) => { setCUR({ s, e }); return generate(T, d, pool(), 300, s, e); };
const sum = t => t.reduce((a, x) => a + x.km, 0);

test('работни дни: без уикенди и официални празници', () => {
  assert.ok(!days.includes('2026-09-05') && !days.includes('2026-09-06'), 'уикенд');
  assert.ok(!days.includes('2026-09-22'), 'Ден на независимостта');
  assert.equal(workdays('2026-09-01', '2026-09-30', new Set(['2026-09-02'])).includes('2026-09-02'), false);
});

test('толеранс: сумата се различава от въведения пробег с най-много 1 км (500 случайни пробега)', () => {
  for (let i = 0; i < 500; i++) {
    const T = 1 + Math.floor(Math.random() * 2000);
    assert.ok(Math.abs(sum(gen(T)) - T) <= 1, `T=${T}`);
  }
});

test('пробег над 5 км се покрива точно (разлика 0)', () => {
  for (let i = 0; i < 300; i++) { const T = 6 + Math.floor(Math.random() * 1800); assert.equal(sum(gen(T)), T, `T=${T}`); }
});

test('само в работни дни и в рамките на дневния лимит', () => {
  for (let i = 0; i < 200; i++) {
    const t = gen(100 + Math.floor(Math.random() * 1900)), perDay = {};
    t.forEach(x => { assert.ok(days.includes(x.date), x.date); perDay[x.date] = (perDay[x.date] || 0) + x.km; });
    Object.values(perDay).forEach(v => assert.ok(v <= 300, 'дневен лимит'));
  }
});

test('посещенията при клиенти са най-много 25 км в посока (50 общо)', () => {
  for (let i = 0; i < 200; i++) gen(50 + Math.floor(Math.random() * 2000)).filter(x => x.client).forEach(x => assert.ok(x.km <= 50 && x.km >= 2));
});

test('без повтарящи се шаблони: поне половината маршрути са различни', () => {
  const t = gen(1000), uniq = new Set(t.map(x => x.ids.join('-') + '|' + x.km)).size;
  assert.ok(uniq / t.length >= 0.5, `${uniq}/${t.length}`);
});

test('начална и крайна точка се спазват (друг офис)', () => {
  S.offices.push({ id: 9901, name: 'Офис на служител', km: 12, type: 'office', purpose: '' });
  const t = gen(600, 0, 9901); t.forEach(x => describe(x));
  t.forEach(x => { assert.equal(x.from, S.base); assert.equal(x.to, 'Офис на служител'); });
});

test('прекалено голям пробег дава ясна грешка, а не грешни маршрути', () => {
  assert.throws(() => gen(100000), /твърде голям/);
  assert.throws(() => gen(500, 0, 0, []), /работни дни/);
});

test('километраж по маршрути: непрекъсната верига и нормативен разход', () => {
  const D = { startOdo: 45000, endOdo: 46000, personal: 0, vehicle: { cons: 6.5, fuel: 'Дизел' }, trips: gen(1000) };
  recalc(D);
  assert.equal(D.trips[0].s, 45000);
  D.trips.forEach((t, i) => { if (i) assert.equal(t.s, D.trips[i - 1].e); assert.equal(t.e - t.s, t.km); assert.equal(t.l, Math.round(t.km * 6.5) / 100); });
  assert.equal(D.diff, D.sumKm - D.target);
  assert.ok(Math.abs(D.diff) <= 1);
});

console.log(`\nУспешни тестове: ${passed}`);
