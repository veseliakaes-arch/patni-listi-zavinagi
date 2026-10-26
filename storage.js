/*
 * Съхранение на данните в браузъра (localStorage) – без тихи грешки.
 *
 *  - save() връща false и запомня причината, ако записът не успее; приложението
 *    тогава не издава лист, а показва съобщение.
 *  - load() никога не заменя тихо нечетими данни с началните. Влиза в режим
 *    „само четене“: нищо не се записва, докато човек не реши – да свали данните,
 *    да започне на чисто (повредените данни се пазят като копие) или да възстанови
 *    резервно копие.
 *
 * В браузъра създава глобалния обект Store, в Node (тестовете) се зарежда с require().
 */
var Store = (function () {
  'use strict';

  const KEY = 'pl_v2';
  // kind: '' – всичко е наред; 'unavailable' – браузърът не дава да се чете или пише;
  //       'corrupt' – записаните данни не могат да се прочетат; 'write' – последният запис не успя
  const st = { readOnly: false, kind: '', error: '', raw: null, downloaded: false };

  const ls = () => globalThis.localStorage;
  const why = (e) => (e && (e.message || e.name)) || String(e);
  const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);

  function reset() {
    st.readOnly = false;
    st.kind = '';
    st.error = '';
    st.raw = null;
    st.downloaded = false;
  }

  function fail(kind, error, value) {
    st.readOnly = kind !== 'write';
    st.kind = kind;
    st.error = error;
    return value;
  }

  /** Проверява с малък тестов запис дали браузърът изобщо позволява запис. */
  function probe() {
    try {
      const k = KEY + '__probe';
      ls().setItem(k, '1');
      ls().removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Минимална проверка, че данните имат нужната форма. */
  function validate(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('липсва обектът с данни');
    for (const k of ['vehicles', 'drivers', 'dests', 'sheets'])
      if (!Array.isArray(s[k])) throw new Error(`липсва списъкът „${k}“`);
    if (typeof s.seq !== 'number' || !isFinite(s.seq)) throw new Error('липсва броячът на номерата');
    return s;
  }

  /**
   * Зарежда данните. defaults() дава началните данни, migrate(s) обновява стари записи
   * (и хвърля грешка, ако не може). При проблем връща началните данни, но в режим
   * „само четене“ – записаното в браузъра остава непокътнато.
   */
  function load(defaults, migrate) {
    reset();
    let raw;
    try {
      raw = ls().getItem(KEY);
    } catch (e) {
      return fail(
        'unavailable',
        `Браузърът не дава достъп до записаните данни (${why(e)}). Отворете приложението в обикновен прозорец или разрешете данните за сайта.`,
        defaults(),
      );
    }
    if (!probe())
      return fail(
        'unavailable',
        'Браузърът не позволява запис на данни (частен режим, блокирани данни за сайта или пълно хранилище). Листове не могат да се издават, защото номерата и историята няма да се запазят.',
        raw == null ? defaults() : tryParse(raw, defaults, migrate),
      );
    if (raw == null) return defaults(); // първо отваряне
    try {
      return validate(migrate(JSON.parse(raw)));
    } catch (e) {
      st.raw = raw;
      return fail(
        'corrupt',
        `Записаните данни не могат да се прочетат (${why(e)}). Нищо не е изтрито: приложението е в режим „само четене“ и няма да записва, докато не изберете какво да направи.`,
        defaults(),
      );
    }
  }

  // при забранен запис все пак показва записаното, ако се чете
  function tryParse(raw, defaults, migrate) {
    try {
      return validate(migrate(JSON.parse(raw)));
    } catch (e) {
      return defaults();
    }
  }

  /** Записва данните. Връща true при успех; при неуспех – false и причината в status().error. */
  function save(state) {
    if (st.readOnly) return false;
    try {
      ls().setItem(KEY, JSON.stringify(state));
      if (st.kind === 'write') reset();
      return true;
    } catch (e) {
      fail(
        'write',
        `Данните НЕ са записани – ${isQuota(e) ? 'хранилището на браузъра е пълно' : why(e)}. Свалете резервно копие от „Автомобили, водачи, дестинации“ → „Данни“.`,
      );
      return false;
    }
  }

  /**
   * Заменя записаните данни с state – за „Започни на чисто“ и „Възстанови от копие“.
   * Ако записаните данни са нечетими, първо ги пази под отделен ключ; ако и това не стане,
   * продължава само след като човек ги е свалил на диска (markDownloaded).
   */
  function replace(state) {
    if (st.kind === 'unavailable') return false;
    if (st.kind === 'corrupt') {
      const backupKey = KEY + '_corrupt_' + new Date().toISOString().replace(/[:.]/g, '-');
      try {
        ls().setItem(backupKey, st.raw);
      } catch (e) {
        if (!st.downloaded) {
          st.error =
            'Не успях да запазя копие на нечетимите данни в браузъра. Първо ги свалете с бутона „Свали данните“ и опитайте пак.';
          return false;
        }
      }
      reset();
    }
    return save(state);
  }

  /** Чете резервно копие (текст на JSON файл) и проверява формата му. Хвърля грешка при проблем. */
  function parseBackup(text, migrate) {
    return validate(migrate(JSON.parse(text)));
  }

  /** Моля браузъра да не изтрива данните при липса на място (ако го поддържа). */
  async function persist() {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist)
        return await navigator.storage.persist();
    } catch (e) {}
    return false;
  }
  async function persisted() {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted)
        return await navigator.storage.persisted();
    } catch (e) {}
    return false;
  }

  return {
    KEY,
    load,
    save,
    replace,
    probe,
    validate,
    parseBackup,
    persist,
    persisted,
    status: () => ({ ...st, raw: undefined }),
    raw: () => st.raw,
    markDownloaded: () => (st.downloaded = true),
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Store;
