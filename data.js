/*
 * Данни на фирмата, началните дестинации и координатите за OSRM.
 * Фирмените данни се променят само тук (в приложението са заключени).
 * В браузъра създава глобалния обект AppData, в Node (тестовете) се зарежда с require().
 */
var AppData = (function () {
  'use strict';

  const COMPANY = () => ({
    name: 'BLD',
    eik: '207433903',
    addr: 'гр. София, ул. „Тинтява“ 126',
    mol: 'Димитър Бончев Савов',
  });
  const BASE = 'BLD – офис, ул. „Тинтява“ 126, София';
  const FUELS = ['Бензин', 'Дизел', 'Електрически', 'Газ (пропан-бутан)', 'Метан'];

  /** Обектите на BLD и административните сгради (заключени – не се трият). */
  const DESTS = () => [
    { id: 1, name: 'MONA 5, Манастирски ливади-изток', km: 9, type: 'obj', purpose: '' },
    { id: 16, name: 'MONA 6, Манастирски ливади-изток', km: 9, type: 'obj', purpose: '' },
    { id: 2, name: 'SREDA, Манастирски ливади-изток', km: 9, type: 'obj', purpose: '' },
    { id: 3, name: 'UPTOWN SQUARE, Лозенец', km: 5, type: 'obj', purpose: '' },
    { id: 4, name: 'SECRET GARDENS, Лозенец', km: 6, type: 'obj', purpose: '' },
    { id: 5, name: 'SONATA, ул. Филип Аврамов', km: 6, type: 'obj', purpose: '' },
    { id: 6, name: 'AVIVA Living, Възраждане', km: 8, type: 'obj', purpose: '' },
    { id: 7, name: 'SLOW LIFE, Владая', km: 23, type: 'obj', purpose: '' },
    { id: 8, name: 'KRISTA, Кръстова вада', km: 9, type: 'obj', purpose: '' },
    { id: 9, name: 'Столична община, ул. Московска 33', km: 5, type: 'adm', purpose: '' },
    { id: 10, name: 'МРРБ, ул. Св. св. Кирил и Методий 17', km: 5, type: 'adm', purpose: '' },
    { id: 11, name: 'Съдебна палата, бул. Витоша 2', km: 5, type: 'adm', purpose: '' },
    { id: 12, name: 'НАП, Централно управление', km: 6, type: 'adm', purpose: '' },
    { id: 13, name: 'Агенция по вписванията', km: 7, type: 'adm', purpose: '' },
    { id: 14, name: 'АГКК (Кадастър)', km: 8, type: 'adm', purpose: '' },
    { id: 15, name: 'ДНСК', km: 6, type: 'adm', purpose: '' },
  ];
  const LOCKED = [1, 16, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const isLocked = (r) => LOCKED.includes(+r.id) || DESTS().some((n) => n.name === r.name);

  /** Координати (ширина, дължина) на точките – основа за изчисляване на разстоянията през OSRM. */
  const COORDS = {
    0: [42.666371, 23.344583],
    1: [42.655822, 23.287765],
    16: [42.655822, 23.287765],
    2: [42.657878, 23.294569],
    3: [42.659507, 23.324561],
    4: [42.67288, 23.329933],
    5: [42.637184, 23.380595],
    6: [42.698042, 23.309235],
    7: [42.632981, 23.191765],
    8: [42.650742, 23.315438],
    9: [42.696971, 23.331769],
    10: [42.704705, 23.311959],
    11: [42.695501, 23.319947],
    12: [42.69843, 23.333892],
    13: [42.680289, 23.360697],
    14: [42.667958, 23.26823],
    15: [42.694896, 23.314947],
  };

  /** Началните данни при първо отваряне. */
  function defaults() {
    return {
      company: COMPANY(),
      base: BASE,
      vehicles: [{ id: 1, make: 'Škoda', model: 'Octavia', plate: 'СВ 1234 АА', fuel: 'Дизел', cons: 5.8, odo: 45000 }],
      drivers: [{ id: 1, name: 'Петър Петров', pos: 'Търговски представител' }],
      dests: DESTS(),
      offices: [],
      dv: 2,
      sheets: [],
      seq: 0,
    };
  }

  /**
   * Обновява записани данни до текущата версия. Хвърля грешка, ако записът няма нужната
   * форма – тогава приложението влиза в режим „само четене“ и не губи нищо.
   */
  function migrate(s) {
    if (!s || typeof s !== 'object') throw new Error('липсва обектът с данни');
    s.company = COMPANY();
    s.base = BASE;
    s.offices = s.offices || [];
    if (s.dv !== 2) {
      const nd = DESTS();
      s.dests = [
        ...nd.map((n) => {
          const o = s.dests.find((x) => x.id == n.id);
          return o ? Object.assign(o, { name: n.name, km: n.km, type: n.type }) : n;
        }),
        ...s.dests.filter((x) => !nd.some((n) => n.id == x.id)),
      ];
      s.dv = 2;
    }
    DESTS().forEach((n) => {
      if (!s.dests.some((x) => x.id == n.id || x.name === n.name)) s.dests.push(n);
    });
    return s;
  }

  /**
   * Строга проверка на резервно копие преди възстановяване: всяко поле трябва да е от
   * очаквания вид (числа – числа, дати – ГГГГ-ММ-ДД, номер – ПЛ-ГГГГ-NNNN). Така подправен
   * файл не може да вкара в страницата HTML или код. Хвърля грешка с първия проблем.
   */
  function checkBackup(s) {
    const fail = (where, what) => {
      throw new Error(`${where}: ${what}`);
    };
    const num = (v, where) => (typeof v === 'number' && isFinite(v)) || fail(where, 'трябва да е число');
    const str = (v, where) => typeof v === 'string' || fail(where, 'трябва да е текст');
    const opt = (v, check, where) => v === undefined || v === null || check(v, where);
    const date = (v, where) =>
      (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) || fail(where, 'невалидна дата');
    const list = (v, where) => Array.isArray(v) || fail(where, 'трябва да е списък');

    list(s.vehicles, 'автомобили');
    s.vehicles.forEach((v, i) => {
      const w = `автомобил ${i + 1}`;
      num(v.id, w + ', id');
      ['make', 'model', 'plate', 'fuel'].forEach((k) => opt(v[k], str, `${w}, ${k}`));
      opt(v.cons, num, w + ', разход');
      opt(v.odo, num, w + ', километраж');
      opt(v.drv, num, w + ', водач');
    });
    list(s.drivers, 'водачи');
    s.drivers.forEach((d, i) => {
      const w = `водач ${i + 1}`;
      num(d.id, w + ', id');
      opt(d.name, str, w + ', име');
      opt(d.pos, str, w + ', длъжност');
      opt(d.base, num, w + ', офис');
    });
    for (const [k, name] of [
      ['dests', 'дестинация'],
      ['offices', 'офис'],
    ]) {
      list(s[k], name);
      s[k].forEach((d, i) => {
        const w = `${name} ${i + 1}`;
        num(d.id, w + ', id');
        opt(d.name, str, w + ', име');
        opt(d.km, num, w + ', км');
        opt(d.purpose, str, w + ', цел');
        opt(d.type, str, w + ', вид');
      });
    }
    list(s.sheets, 'листове');
    s.sheets.forEach((x, i) => {
      const w = `лист ${i + 1}`;
      (typeof x.no === 'string' && /^ПЛ-\d{4}-\d{4,}$/.test(x.no)) || fail(w, 'невалиден номер');
      ['issued', 'from', 'to'].forEach((k) => date(x[k], `${x.no}, ${k}`));
      ['startOdo', 'endOdo', 'personal', 'sumKm', 'liters'].forEach((k) => opt(x[k], num, `${x.no}, ${k}`));
      opt(x.refuels, str, `${x.no}, зареждания`);
      opt(x.approver, str, `${x.no}, одобрил`);
      for (const [k, fields] of [
        ['vehicle', ['make', 'model', 'plate', 'fuel']],
        ['driver', ['name', 'pos']],
        ['company', ['name', 'eik', 'addr', 'mol']],
      ]) {
        const o = x[k];
        (o && typeof o === 'object') || fail(`${x.no}, ${k}`, 'липсва');
        fields.forEach((f) => opt(o[f], str, `${x.no}, ${k}.${f}`));
      }
      num(x.vehicle.id, `${x.no}, vehicle.id`);
      opt(x.vehicle.cons, num, `${x.no}, vehicle.cons`);
      list(x.trips, `${x.no}, курсове`);
      x.trips.forEach((t, j) => {
        const tw = `${x.no}, курс ${j + 1}`;
        date(t.date, tw);
        ['km', 's', 'e', 'l', 'base'].forEach((k) => opt(t[k], num, `${tw}, ${k}`));
        ['from', 'to', 'via', 'purpose', 'route', 'cname'].forEach((k) => opt(t[k], str, `${tw}, ${k}`));
        opt(t.ids, list, `${tw}, обекти`);
        (t.ids || []).forEach((id) => num(id, `${tw}, обект`));
      });
    });
    (Number.isInteger(s.seq) && s.seq >= 0) || fail('брояч на номерата', 'невалиден');
    opt(s.lastBackup, date, 'последно копие');
    opt(s.lastVeh, num, 'последен автомобил');
    if (s.matrix != null) {
      (typeof s.matrix === 'object' && !Array.isArray(s.matrix)) || fail('разстояния', 'невалидни');
      Object.values(s.matrix).forEach((v) => num(v, 'разстояния'));
    }
    if (s.mtxInfo != null) opt(s.mtxInfo.g, str, 'дата на разстоянията');
    return s;
  }

  return { COMPANY, BASE, FUELS, DESTS, LOCKED, isLocked, COORDS, defaults, migrate, checkBackup };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppData;
