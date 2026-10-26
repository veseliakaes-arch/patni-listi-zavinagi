/*
 * Алгоритъм за маршрутите на пътния лист.
 *
 * Чисти функции: без DOM и без глобално състояние – всичко нужно се подава като параметър.
 * В браузъра файлът се зарежда като обикновен скрипт и създава глобалния обект Algo,
 * а в Node (тестовете) се зарежда с require().
 */
var Algo = (function () {
  'use strict';

  const DAY = 864e5;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);

  /* ---------- случайни числа ---------- */

  /** Генератор със семе (mulberry32): едно и също семе дава едни и същи маршрути. */
  function seededRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Цяло число от a до b включително. */
  const rint = (a, b, rnd = Math.random) => a + Math.floor(rnd() * (b - a + 1));

  /** Разбъркано копие на масива (Fisher–Yates). */
  function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rint(0, i, rnd);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- работни дни ---------- */

  /** Официалните празници с фиксирана дата (чл. 154, ал. 1 КТ), във вид ММ-ДД. */
  const FIXED_HOLIDAYS = ['01-01', '03-03', '05-01', '05-06', '05-24', '09-06', '09-22', '12-24', '12-25', '12-26'];

  /** Православният Великден за година y (юлиански алгоритъм на Meeus, превърнат в григориански календар). */
  function orthodoxEaster(y) {
    const a = y % 4,
      b = y % 7,
      c = y % 19,
      d = (19 * c + 15) % 30,
      e = (2 * a + 4 * b - d + 34) % 7,
      month = Math.floor((d + e + 114) / 31),
      day = ((d + e + 114) % 31) + 1;
    return iso(Date.UTC(y, month - 1, day + 13));
  }

  const holidayCache = new Map();

  /**
   * Неработните дни за година y като множество от дати ГГГГ-ММ-ДД:
   * фиксираните празници, Велики петък – Великденски понеделник и почивните дни,
   * които се пренасят по чл. 154, ал. 2 КТ, когато празник се падне в събота или неделя
   * (правилото не важи за Великденските празници). Еднократните решения на Министерския
   * съвет не се знаят предварително – те се подават отделно (виж parseOff).
   */
  function bgHolidays(y) {
    if (holidayCache.has(y)) return holidayCache.get(y);
    const weekend = (t) => new Date(t).getUTCDay() % 6 === 0;
    const fixed = FIXED_HOLIDAYS.map((md) => Date.parse(`${y}-${md}`));
    const off = new Set(fixed.map(iso));
    const easter = Date.parse(orthodoxEaster(y));
    for (const n of [-2, -1, 0, 1]) off.add(iso(easter + n * DAY));
    for (const t of fixed) {
      if (!weekend(t)) continue;
      let x = t + DAY;
      while (weekend(x) || off.has(iso(x))) x += DAY;
      off.add(iso(x));
    }
    holidayCache.set(y, off);
    return off;
  }

  /** „2026-01-02“ или „02.01.2026“ → „2026-01-02“; невалидна дата → null. */
  function toIso(text) {
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text),
      y,
      mo,
      d;
    if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
    else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text))) [d, mo, y] = [+m[1], +m[2], +m[3]];
    else return null;
    const out = iso(Date.UTC(y, mo - 1, d)),
      want = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return out === want ? out : null; // отхвърля 31.02., 00.01. и т.н.
  }

  /**
   * Допълнителни почивни дни, въведени от потребителя: дати „ДД.ММ.ГГГГ“ или „ГГГГ-ММ-ДД“
   * и интервали „от..до“, разделени със запетая, точка и запетая или интервал.
   * Неразпозната дата спира генерирането с ясна грешка, вместо да се пропусне тихо.
   */
  function parseOff(text) {
    const s = new Set();
    for (const part of String(text || '')
      .split(/[,;\s]+/)
      .filter(Boolean)) {
      const range = part.includes('..'),
        [a, b] = part.split('..').map(toIso);
      if (!a || (range && (!b || b < a)))
        throw `Неразпозната дата в „Почивни дни“: „${part}“. Пишете например 02.01.2026 или 24.12.2026..28.12.2026.`;
      if (!range) s.add(a);
      else for (let t = Date.parse(a); t <= Date.parse(b); t += DAY) s.add(iso(t));
    }
    return s;
  }

  /** Работните дни от a до b включително: без събота, неделя, официалните празници и дните в off. */
  function workdays(a, b, off = new Set()) {
    const r = [];
    for (let t = Date.parse(a); t <= Date.parse(b); t += DAY) {
      const w = new Date(t).getUTCDay(),
        d = iso(t);
      if (w > 0 && w < 6 && !off.has(d) && !bgHolidays(+d.slice(0, 4)).has(d)) r.push(d);
    }
    return r;
  }

  /* ---------- точки и разстояния ---------- */

  /**
   * Справочник на точките и разстоянията.
   * base – името на основния офис (id 0); offices и dests – масиви {id, name, km, type?, purpose?};
   * matrix – {'a|b': км} от OSRM или distances.json, или null.
   */
  function createRouter({ base = '', offices = [], dests = [], matrix = null } = {}) {
    const pool = offices.concat(dests);
    const P = (id) =>
      id == 0
        ? { id: 0, name: base, km: 0, purpose: '' }
        : pool.find((x) => x.id == id) || { id, name: '?', km: 0, purpose: '' };

    function dist(a, b) {
      if (a.id == b.id) return 0;
      const m = matrix && matrix[a.id + '|' + b.id];
      if (m != null) return Math.max(1, Math.round(m));
      if (a.id == 0) return b.km;
      if (b.id == 0) return a.km;
      return Math.max(3, Math.round(0.6 * Math.min(a.km, b.km) + 0.5 * Math.abs(a.km - b.km)));
    }

    /** Всички вериги начало → 0–3 дестинации → край с дължина до max км. */
    function combos(list, max, s = 0, e = 0) {
      const o = [],
        A = P(s),
        B = P(e),
        vs = list.filter((d) => d.id != s && d.id != e),
        chain = (ids) => {
          let p = A,
            k = 0;
          ids.forEach((i) => {
            const q = P(i);
            k += dist(p, q);
            p = q;
          });
          return k + dist(p, B);
        };
      if (s != e) {
        const k = chain([]);
        if (k > 0 && k <= max) o.push({ ids: [], km: k });
      }
      vs.forEach((a, i) => {
        const k = chain([a.id]);
        if (k > 0 && k <= max) o.push({ ids: [a.id], km: k });
        vs.forEach((b, j) => {
          if (j > i) {
            const k2 = chain([a.id, b.id]);
            if (k2 <= max) o.push({ ids: [a.id, b.id], km: k2 });
            vs.forEach((c, l) => {
              if (l > j) {
                const k3 = chain([a.id, b.id, c.id]);
                if (k3 <= max) o.push({ ids: [a.id, b.id, c.id], km: k3 });
              }
            });
          }
        });
      });
      return o;
    }

    return { P, dist, combos };
  }

  /* ---------- генериране ---------- */

  const DISTMSG = 'Този пробег не може да се разпредели по дните – намалете го или добавете работни дни.';

  /**
   * Разпределя T км по работните дни days.
   * router – от createRouter; dests – дестинациите, от които се строят маршрутите;
   * max – дневен лимит в км; s и e – начална и крайна точка; mp – курсове на ден;
   * rnd – генератор на случайни числа (Math.random или seededRng(…)).
   */
  function generate({ T, days, router, dests, max = 300, s = 0, e = 0, mp = 3, rnd = Math.random }) {
    const opts = router.combos(dests, max - 5, s, e); // каталогът не зависи от опита – смята се веднъж
    for (let sh = 1; ; sh = +(sh - 0.1).toFixed(2)) {
      try {
        return gen0(T, days, opts, max, mp, sh, rnd);
      } catch (err) {
        if (err !== 'DIST') throw err;
        if (sh <= 0.61) throw DISTMSG;
      }
    }
  }

  function gen0(T, days, opts, max, mp, shr, rnd) {
    if (T < 0) throw 'Отрицателен пробег';
    if (T === 0) return [];
    if (!days.length) throw 'Няма работни дни в периода';
    // вариантите, подредени по км: така допустимите за даден лимит са началото на списъка
    const sorted = opts.slice().sort((a, b) => a.km - b.km),
      mo = sorted.length ? sorted[sorted.length - 1].km : 0,
      cap = days.length * Math.min(max - 5, mp * Math.max(mo, 50));
    if (T > cap)
      throw `Пробегът е твърде голям за ${days.length} работни дни – най-много около ${cap} км. Намалете го или добавете работни дни.`;

    /* 2–3 посещения при клиент седмично; всяко е най-много 50 км общо (25 км в посока) */
    const wk = {};
    days.forEach((d) => {
      const t = Date.parse(d),
        w = (new Date(t).getUTCDay() + 6) % 7,
        k = iso(t - w * DAY);
      (wk[k] = wk[k] || []).push(d);
    });
    const plan = [];
    Object.values(wk).forEach((ds) => {
      let k = ds.length >= 2 ? Math.max(1, Math.round((ds.length / 5) * rint(2, 3, rnd))) : rnd() < 0.5 ? 1 : 0;
      k = Math.min(k, ds.length);
      shuffle(ds, rnd)
        .slice(0, k)
        .forEach((d) => plan.push({ day: d, km: rint(12, 44, rnd) }));
    });
    while (plan.length && plan.reduce((a, p) => a + p.km, 0) > 0.5 * T) plan.splice(rint(0, plan.length - 1, rnd), 1);
    const Tr = T - plan.reduce((a, p) => a + p.km, 0);

    const key = (o) => o.ids.join('-'),
      minKm = sorted.length ? sorted[0].km : Infinity,
      avg = sorted.length ? sorted.reduce((a, o) => a + o.km, 0) / sorted.length : 0,
      capA = days.length * Math.min(max - 5, mp * avg),
      rcap = Tr <= shr * capA ? Tr : Math.floor(shr * capA);

    // Претеглен случаен избор: теглото на маршрута е броят обекти в него (поне 1).
    // cum[i] = сбор от теглата на sorted[0..i]; търсенето е двоично, затова изборът не
    // зависи от броя на вариантите (преди всеки избор строеше нов масив от всички).
    const cum = [];
    let acc = 0;
    for (const o of sorted) cum.push((acc += o.ids.length || 1));
    const position = new Map(sorted.map((o, i) => [key(o), i]));
    const countUpTo = (lim) => {
      let lo = 0,
        hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid].km <= lim) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const indexAt = (u, n) => {
      let lo = 0,
        hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] > u) hi = mid;
        else lo = mid + 1;
      }
      return lo;
    };

    let trips = [],
      rem = Tr,
      rs = 0,
      last = '';
    while (rem >= minKm + 6) {
      const n = countUpTo(Math.min(rem - 6, rcap - rs));
      if (!n) break;
      const L = position.has(last) ? position.get(last) : -1;
      let i;
      if (L >= 0 && L < n && n > 1) {
        // предишният маршрут не се повтаря веднага: неговата част от теглата се прескача
        const wL = sorted[L].ids.length || 1,
          startL = cum[L] - wL;
        let u = rnd() * (cum[n - 1] - wL);
        if (u >= startL) u += wL;
        i = indexAt(u, n);
      } else i = indexAt(rnd() * cum[n - 1], n);
      const o = sorted[i];
      trips.push({ ids: o.ids, km: o.km, base: o.km });
      rem -= o.km;
      rs += o.km;
      last = key(o);
    }

    /* остатъкът до въведения пробег се добавя към посещенията при клиент (до 50 км общо всяко) */
    for (const p of shuffle(plan, rnd)) {
      if (rem <= 0) break;
      const a = Math.min(rem, 50 - p.km);
      p.km += a;
      rem -= a;
    }
    if (rem >= 2) {
      const n = Math.ceil(rem / 50),
        b = Math.floor(rem / n),
        x = rem % n;
      for (let i = 0; i < n; i++) {
        const k = b + (i < x ? 1 : 0);
        trips.push({ ids: [], km: k, base: k, client: true, cname: 'Посещение при клиент' });
      }
    }
    const fixed = plan.map((p) => ({
      ids: [],
      km: p.km,
      base: p.km,
      client: true,
      cname: 'Посещение при клиент',
      wday: p.day,
    }));
    if (!trips.length && !fixed.length) return [];

    /* разпределяне по дни: дневен лимит max км и до mp курса (+2 посещения при клиент) */
    const n = trips.length,
      m = Math.min(days.length, n),
      use = shuffle(days, rnd).slice(0, m).sort(),
      load = {};
    use.forEach((d) => (load[d] = []));
    const sh = shuffle(trips, rnd);
    sh.forEach((t, i) => {
      if (i < m) load[use[i]].push(t);
    });
    const room = (d, t) =>
      (load[d] || []).length < mp + (t.client ? 2 : 0) && (load[d] || []).reduce((s, x) => s + x.km, 0) + t.km <= max;
    for (let i = m; i < n; i++) {
      const t = sh[i],
        c = use.filter((d) => room(d, t)),
        pool = c.length ? c : days.filter((d) => room(d, t));
      if (!pool.length) throw 'DIST';
      const d = pool[rint(0, pool.length - 1, rnd)];
      (load[d] = load[d] || []).push(t);
    }
    fixed.forEach((t) => {
      const fits = (d) =>
          (load[d] || []).length < mp + 2 && (load[d] || []).reduce((a, x) => a + x.km, 0) + t.km <= max,
        alt = days.filter(fits),
        d = fits(t.wday) ? t.wday : alt[rint(0, alt.length - 1, rnd)];
      if (!d) throw 'DIST';
      delete t.wday;
      (load[d] = load[d] || []).push(t);
    });
    const out = [];
    Object.keys(load)
      .sort()
      .forEach((d) => load[d].forEach((t) => out.push({ ...t, date: d })));
    return out;
  }

  /* ---------- описание и сметки ---------- */

  const PURP = {
    client: ['Среща с клиент', 'Оглед при клиент', 'Консултация при клиент', 'Връчване на документи на клиент'],
    obj: [
      'Оглед на обект',
      'Контрол на СМР',
      'Среща с подизпълнител',
      'Среща с клиент',
      'Приемане на изпълнени СМР',
      'Контрол на доставка на материали',
    ],
    adm: ['Подаване на документи', 'Получаване на документи', 'Среща в администрацията', 'Справка и съгласуване'],
  };

  /** Попълва текстовете на курса: начало, маршрут, край и цел. s и e – точките по подразбиране. */
  function describe(t, router, s = 0, e = 0, rnd = Math.random) {
    const P = router.P,
      a = t.fromId ?? s,
      b = t.toId ?? e;
    t.fromId = a;
    t.toId = b;
    const ds = t.ids.map(P);
    t.from = P(a).name;
    t.to = P(b).name;
    t.via = t.cname || ds.map((d) => d.name).join('; ');
    const pu = (d) => (d.type && PURP[d.type] ? PURP[d.type][rint(0, PURP[d.type].length - 1, rnd)] : d.purpose);
    t.purpose =
      [
        ...new Set(
          [P(a), ...ds, P(b)]
            .filter((d) => d.id != 0 && d.type != 'office')
            .map(pu)
            .filter(Boolean),
        ),
      ].join('; ') || 'Служебна задача';
    t.route = [t.from, ...ds.map((d) => d.name), t.to].join(' → ');
    if (t.cname) {
      t.purpose = PURP.client[rint(0, PURP.client.length - 1, rnd)];
      t.route = [t.from, t.cname, t.to].join(' → ');
    }
  }

  /** Преизчислява километража по редове, сумите, разликата и нормативния разход. */
  function recalc(D) {
    let o = D.startOdo;
    D.trips.forEach((t) => {
      t.km = Math.max(0, +t.km || 0);
      t.s = o;
      o += t.km;
      t.e = o;
      t.l = Math.round(t.km * D.vehicle.cons) / 100;
    });
    D.sumKm = D.trips.reduce((s, t) => s + t.km, 0);
    D.target = D.endOdo - D.startOdo - D.personal;
    D.diff = D.sumKm - D.target;
    D.liters = D.trips.reduce((s, t) => s + t.l, 0);
  }

  /* ---------- проверки след генериране и при ръчни промени ---------- */

  /** Километри по дни: {'ГГГГ-ММ-ДД': км}. */
  function dayTotals(trips) {
    const day = {};
    trips.forEach((t) => (day[t.date] = (day[t.date] || 0) + (+t.km || 0)));
    return day;
  }

  /** Дните, в които сборът надхвърля дневния лимит: [{date, km}], по дата. */
  function overDays(trips, max = 300) {
    return Object.entries(dayTotals(trips))
      .filter(([, km]) => km > max)
      .map(([date, km]) => ({ date, km }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Праг за предупреждение: среден пробег на работен ден, над който се иска потвърждение. */
  const PLAUSIBLE_KM_PER_DAY = 120;

  /**
   * Проверка дали въведеният пробег е правдоподобен, преди да се генерира.
   * T – служебни км за периода; days – брой работни дни; history – предишни листове на
   * автомобила като [{km, days}]. Връща списък с причини за съмнение (празен = всичко е наред).
   * Не е грешка: при съмнение приложението иска потвърждение, че километражът е въведен правилно.
   */
  function plausibility({ T, days, history = [], perDay = PLAUSIBLE_KM_PER_DAY }) {
    const out = [];
    if (!days) return out;
    const avg = T / days;
    if (avg > perDay)
      out.push(`средно ${Math.round(avg)} км на работен ден – над ${perDay} км, обичайното за градски курсове`);
    const h = history.filter((x) => x.days > 0 && x.km > 0);
    if (h.length) {
      const hAvg = h.reduce((a, x) => a + x.km, 0) / h.reduce((a, x) => a + x.days, 0);
      if (avg > 1.5 * hAvg && avg - hAvg > 20)
        out.push(
          `${(avg / hAvg).toFixed(1).replace('.', ',')} пъти повече от средното за ${h.length === 1 ? 'последния лист' : `последните ${h.length} листа`} на автомобила (${Math.round(hAvg)} км на работен ден)`,
        );
    }
    return out;
  }

  /**
   * Нов маршрут за ред i (бутона ↻). Новият маршрут винаги е със своите картографски км.
   * Първо се търсят маршрути със същите км. Ако няма, се взима маршрут с близки км
   * (до max(8 км, 15%)), а разликата се поема от посещенията при клиент – така сумата
   * на листа остава същата, посещенията остават между clientMin и clientMax км,
   * а нито един ден не минава дневния лимит.
   * options – вариантите от router.combos(…). Връща {route, adjust: [{index, km}]} или null.
   */
  function alternativeRoute({ trips, i, options, max = 300, clientMin = 2, clientMax = 50, rnd = Math.random }) {
    const t = trips[i],
      key = (ids) => ids.join('-'),
      cur = key(t.ids),
      cands = options.filter((o) => key(o.ids) !== cur);
    const exact = cands.filter((o) => o.km === t.km);
    if (exact.length) return { route: exact[rint(0, exact.length - 1, rnd)], adjust: [] };
    const lim = Math.max(8, t.km * 0.15);
    for (const o of shuffle(
      cands.filter((o) => Math.abs(o.km - t.km) <= lim),
      rnd,
    )) {
      const adjust = absorb(trips, i, o.km - t.km, max, clientMin, clientMax);
      if (adjust) return { route: o, adjust };
    }
    return null;
  }

  // Посещенията при клиент се променят общо с −delta км: първо тези от същия ден, после по дата.
  function absorb(trips, i, delta, max, clientMin, clientMax) {
    const day = trips[i].date,
      order = trips
        .map((x, j) => j)
        .filter((j) => j !== i && trips[j].client)
        .sort(
          (a, b) =>
            (trips[a].date === day ? 0 : 1) - (trips[b].date === day ? 0 : 1) ||
            trips[a].date.localeCompare(trips[b].date),
        );
    let need = -delta; // > 0: посещенията растат; < 0: намаляват
    const adjust = [];
    for (const j of order) {
      if (!need) break;
      const c = trips[j],
        room = need > 0 ? clientMax - c.km : c.km - clientMin;
      if (room <= 0) continue;
      const step = Math.min(room, Math.abs(need));
      adjust.push({ index: j, km: c.km + Math.sign(need) * step });
      need -= Math.sign(need) * step;
    }
    if (need) return null;
    const km = trips.map((x) => +x.km || 0);
    km[i] += delta;
    adjust.forEach((a) => (km[a.index] = a.km));
    const totals = {};
    trips.forEach((x, j) => (totals[x.date] = (totals[x.date] || 0) + km[j]));
    return Object.values(totals).some((v) => v > max) ? null : adjust;
  }

  return {
    FIXED_HOLIDAYS,
    PURP,
    DISTMSG,
    PLAUSIBLE_KM_PER_DAY,
    seededRng,
    rint,
    shuffle,
    orthodoxEaster,
    bgHolidays,
    toIso,
    parseOff,
    workdays,
    createRouter,
    generate,
    describe,
    recalc,
    dayTotals,
    overDays,
    plausibility,
    alternativeRoute,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Algo;
