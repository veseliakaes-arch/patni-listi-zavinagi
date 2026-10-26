// Тестове на записа и зареждането на данните (storage.js) с фалшиво localStorage.
// Стартиране:  node --test   или   node storage.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Store = require('./storage.js');
const AppData = require('./data.js');
const { defaults, migrate } = AppData;

/** localStorage в паметта; може да откаже четене, запис или да има малък лимит. */
class FakeStorage {
  constructor({ failGet = false, failSet = false, quota = Infinity } = {}) {
    Object.assign(this, { failGet, failSet, quota, data: new Map() });
  }
  getItem(k) {
    if (this.failGet) throw Object.assign(new Error('SecurityError'), { name: 'SecurityError' });
    return this.data.has(k) ? this.data.get(k) : null;
  }
  setItem(k, v) {
    const size = [...this.data].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0) + String(v).length;
    if (this.failSet || size > this.quota) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    this.data.set(k, String(v));
  }
  removeItem(k) {
    this.data.delete(k);
  }
}

const KEY = Store.KEY;
const withSheet = () => {
  const s = defaults();
  s.sheets.push({
    no: 'ПЛ-2026-0001',
    from: '2026-09-01',
    to: '2026-09-30',
    startOdo: 45000,
    endOdo: 46000,
    vehicle: { id: 1 },
  });
  s.seq = 1;
  return s;
};

beforeEach(() => {
  globalThis.localStorage = new FakeStorage();
});

test('първо отваряне: начални данни, записът работи', () => {
  const s = Store.load(defaults, migrate);
  assert.equal(s.sheets.length, 0);
  assert.equal(Store.status().readOnly, false);
  assert.equal(Store.save(s), true);
  assert.ok(localStorage.getItem(KEY));
});

test('запис и зареждане пазят листовете', () => {
  Store.load(defaults, migrate);
  assert.equal(Store.save(withSheet()), true);
  const s = Store.load(defaults, migrate);
  assert.equal(s.sheets.length, 1);
  assert.equal(s.seq, 1);
});

test('№1: отказан запис се връща като false с причина, вместо да се загуби тихо', () => {
  const s = Store.load(defaults, migrate);
  localStorage.failSet = true;
  assert.equal(Store.save(s), false);
  assert.equal(Store.status().kind, 'write');
  assert.match(Store.status().error, /НЕ са записани/);
  localStorage.failSet = false;
  assert.equal(Store.save(s), true, 'следващ успешен запис чисти грешката');
  assert.equal(Store.status().error, '');
});

test('№1: пълно хранилище се назовава ясно', () => {
  globalThis.localStorage = new FakeStorage({ quota: 50000 });
  const s = Store.load(defaults, migrate);
  s.big = 'x'.repeat(60000);
  assert.equal(Store.save(s), false);
  assert.match(Store.status().error, /хранилището на браузъра е пълно/);
});

test('№1: браузър без запис (частен режим, блокирани данни) – режим „само четене“ още при отваряне', () => {
  globalThis.localStorage = new FakeStorage({ failSet: true });
  Store.load(defaults, migrate);
  assert.equal(Store.status().readOnly, true);
  assert.equal(Store.status().kind, 'unavailable');
  assert.equal(Store.save(defaults()), false);
});

test('№1: браузър без достъп до хранилището', () => {
  globalThis.localStorage = new FakeStorage({ failGet: true });
  const s = Store.load(defaults, migrate);
  assert.equal(s.sheets.length, 0);
  assert.equal(Store.status().kind, 'unavailable');
});

test('№2: повреден JSON – нищо не се презаписва', () => {
  localStorage.setItem(KEY, '{"sheets":[{"no":"ПЛ-2026-0001"');
  const before = localStorage.getItem(KEY);
  const s = Store.load(defaults, migrate);
  assert.equal(Store.status().kind, 'corrupt');
  assert.equal(Store.status().readOnly, true);
  assert.equal(Store.save(s), false, 'в режим „само четене“ не се записва');
  assert.equal(localStorage.getItem(KEY), before, 'записаното остава непокътнато');
  assert.equal(Store.raw(), before, 'суровите данни могат да се свалят');
});

test('№2: данни от стара версия без дестинации (сценарият от анализа)', () => {
  localStorage.setItem(
    KEY,
    JSON.stringify({ vehicles: [], drivers: [], sheets: [{ no: 'ПЛ-2026-0001' }], seq: 1, dv: 1 }),
  );
  Store.load(defaults, migrate);
  assert.equal(Store.status().kind, 'corrupt');
  assert.match(Store.status().error, /не могат да се прочетат/);
});

test('№2: данни без списък с листове или брояч', () => {
  const s = withSheet();
  delete s.sheets;
  localStorage.setItem(KEY, JSON.stringify(s));
  Store.load(defaults, migrate);
  assert.equal(Store.status().kind, 'corrupt');
});

test('№2: „Започни на чисто“ пази нечетимите данни като копие', () => {
  localStorage.setItem(KEY, 'не е JSON');
  Store.load(defaults, migrate);
  assert.equal(Store.replace(defaults()), true);
  const backup = [...localStorage.data.keys()].find((k) => k.startsWith(KEY + '_corrupt_'));
  assert.ok(backup, 'има копие');
  assert.equal(localStorage.getItem(backup), 'не е JSON');
  assert.equal(JSON.parse(localStorage.getItem(KEY)).sheets.length, 0);
  assert.equal(Store.status().readOnly, false);
});

test('№2: без място за копие – чака данните да бъдат свалени', () => {
  const raw = 'x'.repeat(30000);
  globalThis.localStorage = new FakeStorage({ quota: 40000 });
  localStorage.setItem(KEY, raw);
  Store.load(defaults, migrate);
  assert.equal(Store.replace(defaults()), false);
  assert.equal(localStorage.getItem(KEY), raw, 'нищо не е изтрито');
  assert.match(Store.status().error, /свалете/i);
  Store.markDownloaded();
  assert.equal(Store.replace(defaults()), true);
});

test('резервно копие: валидно се приема, невалидно – с ясна грешка', () => {
  const s = Store.parseBackup(JSON.stringify(withSheet()), migrate);
  assert.equal(s.sheets.length, 1);
  assert.throws(() => Store.parseBackup('{"a":1}', migrate));
  assert.throws(() => Store.parseBackup('не е JSON', migrate));
});

test('резервно копие: строга проверка спира подправени стойности', () => {
  const ok = migrate(withFullSheet());
  assert.equal(AppData.checkBackup(ok), ok);
  const bad = [
    (s) => (s.sheets[0].no = '<img src=x onerror=alert(1)>'),
    (s) => (s.sheets[0].from = '2026-09-01"><script>'),
    (s) => (s.sheets[0].sumKm = '<b>1</b>'),
    (s) => (s.vehicles[0].id = '1" onfocus="alert(1)'),
    (s) => (s.dests[0].km = 'x'),
    (s) => (s.sheets[0].trips[0].date = 'утре'),
    (s) => (s.seq = 1.5),
    (s) => (s.matrix = { '0|1': '<x>' }),
  ];
  bad.forEach((spoil, k) => {
    const s = migrate(withFullSheet());
    spoil(s);
    assert.throws(() => AppData.checkBackup(s), Error, `случай ${k + 1}`);
  });
});

function withFullSheet() {
  const s = defaults();
  s.sheets.push({
    no: 'ПЛ-2026-0001',
    issued: '2026-09-30',
    from: '2026-09-01',
    to: '2026-09-30',
    startOdo: 45000,
    endOdo: 45020,
    personal: 0,
    sumKm: 20,
    liters: 1.16,
    refuels: '',
    approver: 'Димитър Бончев Савов',
    vehicle: { ...s.vehicles[0] },
    driver: { ...s.drivers[0] },
    company: { ...s.company },
    trips: [
      {
        date: '2026-09-01',
        ids: [1],
        km: 20,
        s: 45000,
        e: 45020,
        l: 1.16,
        base: 20,
        from: 'А',
        to: 'Б',
        via: 'В',
        purpose: 'Г',
      },
    ],
  });
  s.seq = 1;
  s.lastBackup = '2026-10-01';
  return s;
}
