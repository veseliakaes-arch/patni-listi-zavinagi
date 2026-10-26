// Тестове на алгоритъма за маршрути.
// Стартиране:  node --test            (всички тестове, Node 18+, без външни зависимости)
//              node algorithm.test.mjs
// Всички случайни генерирания са със семе, за да се повтарят. Друго семе: SEED=12345 node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Algo = require('./algorithm.js');
const AppData = require('./data.js');

const SEED = Number(process.env.SEED) || 20261020;
const rng = (salt = 0) => Algo.seededRng(SEED + salt);
const S = AppData.defaults();
const R = Algo.createRouter({ base: S.base, offices: S.offices, dests: S.dests, matrix: null });
const days = Algo.workdays('2026-09-01', '2026-09-30');
const gen = (T, rnd, opt = {}) =>
  Algo.generate({
    T,
    days: opt.days || days,
    router: opt.router || R,
    dests: S.dests,
    max: 300,
    s: 0,
    e: opt.e ?? 0,
    rnd,
  });
const sum = (t) => t.reduce((a, x) => a + x.km, 0);
const range = (n) => Array.from({ length: n }, (_, i) => i);

test('работни дни: без уикенди, празници и подадените почивни дни', () => {
  assert.ok(!days.includes('2026-09-05') && !days.includes('2026-09-06'), 'уикенд');
  assert.ok(!days.includes('2026-09-22'), 'Ден на Независимостта');
  assert.equal(Algo.workdays('2026-09-01', '2026-09-30', new Set(['2026-09-02'])).includes('2026-09-02'), false);
});

test('Православен Великден 2024–2030', () => {
  const known = {
    2024: '2024-05-05',
    2025: '2025-04-20',
    2026: '2026-04-12',
    2027: '2027-05-02',
    2028: '2028-04-16',
    2029: '2029-04-08',
    2030: '2030-04-28',
  };
  for (const [y, d] of Object.entries(known)) assert.equal(Algo.orthodoxEaster(+y), d, y);
});

test('неработни делнични дни през 2026 г. (чл. 154 КТ)', () => {
  const weekdays = [...Algo.bgHolidays(2026)].filter((d) => new Date(d).getUTCDay() % 6 !== 0).sort();
  // 02.01.2026 е еднократно решение на Министерския съвет – подава се в „Почивни дни“
  assert.deepEqual(weekdays, [
    '2026-01-01',
    '2026-03-03',
    '2026-04-10',
    '2026-04-13',
    '2026-05-01',
    '2026-05-06',
    '2026-05-25',
    '2026-09-07',
    '2026-09-22',
    '2026-12-24',
    '2026-12-25',
    '2026-12-28',
  ]);
});

test('пренасяне на празници от събота и неделя', () => {
  const h21 = Algo.bgHolidays(2021); // 25 и 26.12.2021 са събота и неделя
  assert.ok(h21.has('2021-12-27') && h21.has('2021-12-28'));
  const h27 = Algo.bgHolidays(2027); // 01.05.2027 е събота, 03.05. е Великденски понеделник
  assert.ok(h27.has('2027-04-30') && h27.has('2027-05-03') && h27.has('2027-05-04'));
});

test('„Почивни дни“: дати, интервали и ясна грешка при невалиден запис', () => {
  assert.deepEqual([...Algo.parseOff('02.01.2026, 2026-01-05; 2.1.2026')].sort(), ['2026-01-02', '2026-01-05']);
  assert.deepEqual(
    [...Algo.parseOff('30.12.2026..02.01.2027')],
    ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'],
  );
  assert.equal(Algo.parseOff('').size, 0);
  for (const bad of ['31.02.2026', '2026-13-01', 'утре', '05.01.2026..01.01.2026'])
    assert.throws(() => Algo.parseOff(bad), /Почивни дни/, bad);
});

test('толеранс: сумата се различава от въведения пробег с най-много 1 км (500 пробега)', () => {
  const r = rng(1);
  for (const i of range(500)) {
    const T = 1 + Math.floor(r() * 2000);
    assert.ok(Math.abs(sum(gen(T, rng(1000 + i))) - T) <= 1, `T=${T}, семе ${SEED}`);
  }
});

test('пробег над 5 км се покрива точно в над 98% от случаите', () => {
  const r = rng(2),
    N = 600;
  let exact = 0;
  for (const i of range(N)) {
    const T = 6 + Math.floor(r() * 1800),
      d = sum(gen(T, rng(2000 + i))) - T;
    assert.ok(Math.abs(d) <= 1, `T=${T}`);
    if (d === 0) exact++;
  }
  assert.ok(exact / N > 0.98, `точни: ${exact}/${N}`);
});

test('само в работни дни и в рамките на дневния лимит', () => {
  const r = rng(3);
  for (const i of range(200)) {
    const t = gen(100 + Math.floor(r() * 1900), rng(3000 + i)),
      perDay = {};
    t.forEach((x) => {
      assert.ok(days.includes(x.date), x.date);
      perDay[x.date] = (perDay[x.date] || 0) + x.km;
    });
    Object.values(perDay).forEach((v) => assert.ok(v <= 300, 'дневен лимит'));
  }
});

test('няма курсове в неработни дни (07.09.2026 и подадените „Почивни дни“)', () => {
  const off = Algo.parseOff('15.09.2026..16.09.2026'),
    d2 = Algo.workdays('2026-09-01', '2026-09-30', off);
  for (const i of range(50)) {
    const t = gen(1200, rng(4000 + i), { days: d2 });
    assert.ok(t.every((x) => !['2026-09-07', '2026-09-15', '2026-09-16', '2026-09-22'].includes(x.date)));
  }
});

test('посещенията при клиенти са най-много 25 км в посока (50 общо)', () => {
  const r = rng(5);
  for (const i of range(200))
    gen(50 + Math.floor(r() * 2000), rng(5000 + i))
      .filter((x) => x.client)
      .forEach((x) => assert.ok(x.km <= 50 && x.km >= 2));
});

test('2–3 посещения при клиент на пълна работна седмица', () => {
  const full = Algo.workdays('2026-10-05', '2026-10-18'); // две пълни седмици
  for (const i of range(100)) {
    const t = gen(900, rng(6000 + i), { days: full }),
      wk = {};
    t.filter((x) => x.client).forEach((x) => {
      const k = x.date < '2026-10-12' ? 1 : 2;
      wk[k] = (wk[k] || 0) + 1;
    });
    [1, 2].forEach((k) => assert.ok(wk[k] >= 2 && wk[k] <= 4, `седмица ${k}: ${wk[k]}`));
    assert.equal(sum(t), 900);
  }
});

test('без повтарящи се шаблони: поне половината маршрути са различни', () => {
  const t = gen(1000, rng(7)),
    uniq = new Set(t.map((x) => x.ids.join('-') + '|' + x.km)).size;
  assert.ok(uniq / t.length >= 0.5, `${uniq}/${t.length}`);
});

test('начална и крайна точка се спазват (друг офис)', () => {
  const office = { id: 9901, name: 'Офис на служител', km: 12, type: 'office', purpose: '' },
    R2 = Algo.createRouter({ base: S.base, offices: [office], dests: S.dests }),
    t = gen(600, rng(8), { router: R2, e: 9901 });
  t.forEach((x) => Algo.describe(x, R2, 0, 9901, rng(9)));
  t.forEach((x) => {
    assert.equal(x.from, S.base);
    assert.equal(x.to, 'Офис на служител');
  });
});

test('прекалено голям пробег дава ясна грешка, а не грешни маршрути', () => {
  assert.throws(() => gen(100000, rng(10)), /твърде голям/);
  assert.throws(() => gen(500, rng(11), { days: [] }), /работни дни/);
});

test('километраж по маршрути: непрекъсната верига и нормативен разход', () => {
  const D = {
    startOdo: 45000,
    endOdo: 46000,
    personal: 0,
    vehicle: { cons: 6.5, fuel: 'Дизел' },
    trips: gen(1000, rng(12)),
  };
  Algo.recalc(D);
  assert.equal(D.trips[0].s, 45000);
  D.trips.forEach((t, i) => {
    if (i) assert.equal(t.s, D.trips[i - 1].e);
    assert.equal(t.e - t.s, t.km);
    assert.equal(t.l, Math.round(t.km * 6.5) / 100);
  });
  assert.equal(D.diff, D.sumKm - D.target);
  assert.ok(Math.abs(D.diff) <= 1);
});

test('повторимост: едно и също семе дава едни и същи маршрути', () => {
  const a = gen(1234, rng(13)),
    b = gen(1234, rng(13)),
    c = gen(1234, rng(14));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('№9 ↻: новият маршрут е със своите км, а сумата на листа остава същата', () => {
  let exact = 0,
    absorbed = 0,
    none = 0;
  const options = R.combos(S.dests, 295, 0, 0),
    mapKm = new Map(options.map((o) => [o.ids.join('-'), o.km]));
  for (const n of range(150)) {
    const trips = gen(400 + n * 10, rng(9000 + n)),
      r = rng(9500 + n);
    for (const k of range(6)) {
      const i = trips.findIndex((t, j) => !t.client && j >= Math.floor(r() * trips.length));
      if (i < 0) continue;
      const before = sum(trips),
        old = trips[i].ids.join('-'),
        alt = Algo.alternativeRoute({ trips, i, options, max: 300, rnd: rng(9900 + n * 10 + k) });
      if (!alt) {
        none++;
        continue;
      }
      assert.notEqual(alt.route.ids.join('-'), old, 'друг маршрут');
      trips[i].ids = alt.route.ids;
      trips[i].km = alt.route.km;
      alt.adjust.forEach((a) => (trips[a.index].km = a.km));
      if (alt.adjust.length) absorbed++;
      else exact++;
      assert.equal(sum(trips), before, 'сумата не се променя');
      assert.equal(trips[i].km, mapKm.get(alt.route.ids.join('-')), 'км = картографските на новия маршрут');
      trips.filter((t) => t.client).forEach((t) => assert.ok(t.km >= 2 && t.km <= 50, `посещение ${t.km} км`));
      assert.deepEqual(Algo.overDays(trips, 300), [], 'дневен лимит');
    }
  }
  assert.ok(
    exact > 0 && absorbed >= 0 && exact + absorbed > 10 * none,
    `същите км: ${exact}, с поемане: ${absorbed}, без алтернатива: ${none}`,
  );
});

test('№9 ↻: разликата се поема от посещение при клиент, а без такова – само същите км', () => {
  const trips = [
    { date: '2026-09-01', ids: [1], km: 20 },
    { date: '2026-09-01', ids: [], km: 30, client: true },
  ];
  const options = [
    { ids: [2], km: 24 },
    { ids: [3], km: 40 },
  ];
  const alt = Algo.alternativeRoute({ trips, i: 0, options, rnd: rng(1) });
  assert.deepEqual(alt, { route: { ids: [2], km: 24 }, adjust: [{ index: 1, km: 26 }] });
  assert.equal(
    Algo.alternativeRoute({ trips: [trips[0]], i: 0, options, rnd: rng(1) }),
    null,
    'няма посещение за поемане',
  );
  assert.deepEqual(
    Algo.alternativeRoute({ trips, i: 0, options: [{ ids: [5], km: 20 }, ...options], rnd: rng(1) }).adjust,
    [],
    'първо същите км',
  );
  const full = [
    { date: '2026-09-01', ids: [1], km: 20 },
    { date: '2026-09-02', ids: [], km: 30, client: true },
    { date: '2026-09-01', ids: [4], km: 278 },
  ];
  assert.equal(Algo.alternativeRoute({ trips: full, i: 0, options, rnd: rng(1) }), null, 'денят би минал 300 км');
});

test('№16: дневен лимит при ръчни промени', () => {
  const trips = [
    { date: '2026-09-01', km: 200 },
    { date: '2026-09-01', km: 120 },
    { date: '2026-09-02', km: 300 },
  ];
  assert.deepEqual(Algo.dayTotals(trips), { '2026-09-01': 320, '2026-09-02': 300 });
  assert.deepEqual(Algo.overDays(trips, 300), [{ date: '2026-09-01', km: 320 }]);
});

test('№16: правдоподобен пробег – обичайното и историята на автомобила', () => {
  assert.deepEqual(Algo.plausibility({ T: 1480, days: 21 }), [], '70 км/ден е обичайно');
  assert.equal(Algo.plausibility({ T: 3000, days: 21 }).length, 1, '143 км/ден');
  assert.match(Algo.plausibility({ T: 3000, days: 21 })[0], /143 км на работен ден/);
  const history = [
    { km: 1000, days: 20 },
    { km: 1100, days: 22 },
  ];
  assert.deepEqual(Algo.plausibility({ T: 1500, days: 21, history }), [], '71 срещу 50 км/ден – до 1,5 пъти');
  const r = Algo.plausibility({ T: 2400, days: 21, history });
  assert.equal(r.length, 1);
  assert.match(r[0], /2,3 пъти повече от средното за последните 2 листа/);
  assert.deepEqual(
    Algo.plausibility({ T: 300, days: 21, history: [{ km: 100, days: 21 }] }),
    [],
    'малки числа – без шум',
  );
});
