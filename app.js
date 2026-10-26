/*
 * Интерфейсът на приложението: състояние, екрани и действия.
 * Зарежда се последен – след vendor/, algorithm.js, storage.js, data.js и export.js.
 */

/* ---------- състояние ---------- */

let S = Store.load(AppData.defaults, AppData.migrate),
  TAB = 'new',
  DRAFT = null,
  ISSUED = null,
  ERR = '',
  ADV = false,
  CONF = '',
  PENDING = null; // прочетено резервно копие, което чака потвърждение

/** Записва данните; при неуспех показва причината и връща false. */
function save() {
  const ok = Store.save(S);
  if (!ok) {
    const st = Store.status();
    if (st.kind === 'write') toast(st.error);
    banner();
  }
  return ok;
}

const readOnly = () => Store.status().readOnly;

/* ---------- помощни ---------- */

const $ = (id) => document.getElementById(id),
  nf = (n, d = 2) => Number(n).toFixed(d).replace('.', ','),
  pad = (n, l) => String(n).padStart(l, '0'),
  dm = (iso) => iso.split('-').reverse().join('.'),
  esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]),
  today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  },
  U = (v) => (v.fuel == 'Електрически' ? 'kWh' : 'л'),
  mols = () =>
    (S.company.mol || '')
      .split(/,|;| и /)
      .map((x) => x.trim())
      .filter(Boolean),
  router = () => Algo.createRouter({ base: S.base, offices: S.offices, dests: S.dests, matrix: S.matrix });

function toast(m) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = m;
  t.style.display = 'block';
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.style.display = 'none'), 7000);
}

/* ---------- съобщение за проблем със записа ---------- */

function banner() {
  const el = $('banner');
  if (!el) return;
  const st = Store.status();
  let html = '';
  if (st.error) html = bannerHtml(st);
  if (el._html !== html) el.innerHTML = el._html = html; // без излишно преобразуване (и повторно четене от екранни четци)
}

function bannerHtml(st) {
  let actions = '';
  if (st.kind === 'corrupt')
    actions = `<div class="row"><button onclick="downloadRaw()">Свали данните (.json)</button>${
      CONF === 'fresh'
        ? `<button class="p" onclick="startFresh()">Потвърди: започни на чисто</button><button onclick="CONF='';banner()">Отказ</button>`
        : `<button onclick="startFresh()">Започни на чисто</button>`
    }<span class="note">или възстановете резервно копие от „Автомобили, водачи, дестинации“ → „Данни и резервно копие“.</span></div>`;
  else if (st.kind === 'write')
    actions = `<div class="row"><button onclick="downloadBackup()">Свали резервно копие (.json)</button></div>`;
  return `<div class="alert"><b>Внимание:</b> ${esc(st.error)}${actions}</div>`;
}

function downloadRaw() {
  const raw = Store.raw();
  if (raw == null) return;
  saveFile(`patni-listi-nechetimi-danni-${today()}.json`, raw, 'application/json');
  Store.markDownloaded();
  toast('Данните са свалени. Пазете файла – от него може да се възстанови историята.');
}

function startFresh() {
  if (CONF !== 'fresh') {
    CONF = 'fresh';
    banner();
    return;
  }
  CONF = '';
  const fresh = AppData.defaults();
  if (!Store.replace(fresh)) {
    banner();
    toast(Store.status().error || 'Данните не можаха да се запишат.');
    return;
  }
  S = fresh;
  DRAFT = null;
  ISSUED = null;
  render();
  toast('Започнахте на чисто. Предишните данни са запазени като копие (в браузъра или в сваления файл).');
}

/* ---------- резервно копие ---------- */

function downloadBackup() {
  if (Store.status().kind === 'corrupt') return downloadRaw();
  saveFile(`patni-listi-rezervno-kopie-${today()}.json`, JSON.stringify(S, null, 1), 'application/json');
  S.lastBackup = today();
  save();
  if (TAB == 'set') render();
  toast('Резервното копие е свалено.');
}

async function pickBackup(el) {
  const f = el.files && el.files[0];
  if (!f) return;
  try {
    PENDING = { name: f.name, data: Store.parseBackup(await f.text(), AppData.migrate) };
  } catch (e) {
    PENDING = null;
    toast('Файлът не е валидно резервно копие: ' + (e.message || e));
  }
  el.value = '';
  render();
}

function applyBackup() {
  if (!PENDING) return;
  const s = PENDING.data;
  if (!Store.replace(s)) {
    toast(Store.status().error || 'Данните не можаха да се запишат.');
    banner();
    return;
  }
  S = s;
  PENDING = null;
  DRAFT = null;
  ISSUED = null;
  render();
  toast('Данните са възстановени от копието.');
}

async function askPersist() {
  const ok = await Store.persist(),
    el = $('pst');
  if (el)
    el.textContent = ok
      ? 'Браузърът ще пази данните и при липса на място.'
      : 'Браузърът не потвърди – сваляйте редовно резервно копие.';
}

/* ---------- екрани ---------- */

const DIAG =
  '<div class="card"><h2>Диагностика</h2><p class="note">Проверка на алгоритъма: 300 случайни генерирания.</p><button onclick="selfTest()">Самотест на алгоритъма</button> <span id="st" class="note"></span></div>';

function foot() {
  const e = $('ft');
  if (!e) return;
  const g = S.mtxInfo && S.mtxInfo.g ? ` · обновени ${dm(S.mtxInfo.g.slice(0, 10))}` : '';
  e.innerHTML = S.matrix
    ? `Разстоянията са изчислени с <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a> (Open Source Routing Machine) върху картови данни © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">участниците в OpenStreetMap</a>${g}.`
    : 'Разстоянията са ориентировъчни.';
}

function vHelp() {
  const li = (a) =>
    '<ul style="margin:6px 0 0;padding-left:20px">' +
    a.map((x) => `<li style="margin:6px 0">${x}</li>`).join('') +
    '</ul>';
  const T = (x) => `<b>таб „${x}“</b>`;
  return `<div class="card"><h2>Как да направя пътен лист – стъпка по стъпка</h2><ol style="margin:0;padding-left:22px;line-height:1.8">
<li>Отворете ${T('Нов пътен лист')}.</li>
<li>Изберете <b>автомобил</b> и <b>водач</b> от списъците.</li>
<li>Периодът (от коя до коя дата) се попълва сам. Ако искате друг период, сменете датите.</li>
<li>Въведете в полето <b>КМ края на периода</b> какво показва километражът на колата в края на периода.</li>
<li>Натиснете <b>„Генерирай маршрути“</b>. Приложението само ще измисли маршрутите за всеки работен ден, така че сборът да излезе точно колкото сте въвели.</li>
<li>Прегледайте резултата в същия таб. Ако някой ред не ви харесва, натиснете <b>↻</b> (друг маршрут) или <b>✕</b> (махане на реда).</li>
<li>Когато всичко е наред, натиснете <b>„Издай и свали PDF“</b> или <b>„Издай и свали Excel“</b>. Листът получава свой пореден номер и файлът се сваля.</li>
<li>Всички издадени листове по-късно ги намирате в ${T('История')} – там можете да ги свалите отново.</li></ol></div>
<div class="card"><h2>Какво има във всеки таб</h2>${li([
    `${T('Нов пътен лист')} – тук се прави нов лист.`,
    `${T('История')} – списък на издадените листове. Можете да търсите по автомобил и период и да сваляте PDF или Excel.`,
    `${T('Автомобили, водачи, дестинации')} – тук добавяте или променяте автомобили (марка, модел, номер, гориво, разход на 100 км, начален километраж), водачи и собствени места за посещение, и сваляте резервно копие на данните. Данните на фирмата са само за четене (🔒).`,
    `${T('Инструкции')} – тази страница.`,
  ])}</div>
<div class="card"><h2>Допълнителни възможности (бутон „Още опции“ в таб „Нов пътен лист“)</h2>${li([
    '<b>Офис</b> – откъде тръгва и къде свършва всеки ден. По подразбиране е офисът на водача.',
    '<b>Лични километри</b> – километри, които не са служебни. Не влизат в маршрутите.',
    '<b>Почивни дни</b> – еднократни почивни дни, обявени от Министерския съвет (например 02.01.2026). Пишат се като 02.01.2026 или като интервал 24.12.2026..28.12.2026, разделени със запетая. Великден и пренесените почивни дни се пропускат сами.',
    '<b>Зареждания</b> – изберете дата, въведете литри (или kWh) и номер на фактура. Датата трябва да е в периода на листа.',
    '<b>Одобрил (МОЛ)</b> – по подразбиране е вписан <b>Димитър Бончев Савов</b>. Ако не искате име в листа, изберете „— без име (по избор) —“.',
  ])}</div>
<div class="card"><h2>Какво не може и защо</h2>${li([
    '<b>Грешка до 1 км е нормална.</b> Много рядко сборът на маршрутите се различава с 1 км от въведения. По-голяма разлика не се допуска и листът не се издава.',
    '<b>Километраж в края, по-малък от този в началото, не се приема.</b> Всеки нов лист започва там, където е свършил предишният за същата кола.',
    '<b>Периодите на една кола не могат да се застъпват.</b>',
    '<b>Маршрути има само в работни дни.</b> Събота, неделя, официалните празници, Великден (от Велики петък до понеделник) и почивните дни, пренесени по чл. 154, ал. 2 от Кодекса на труда, се пропускат автоматично. Еднократни почивни дни въведете в „Още опции“ → „Почивни дни“.',
    '<b>Най-много 300 км на ден.</b> Ако пробегът е твърде голям за периода (над около 2100–2500 км на месец), приложението ще ви каже да удължите периода.',
    '<b>Посещенията при клиент</b> са 2–3 на седмица. Не се сменят с ↻, а се редактират на ръка.',
    '<b>Основните адреси са заключени (🔒)</b> – обектите на BLD и административните сгради не могат да се трият. Собствените ви места можете да триете.',
    '<b>Данните на фирмата и офисът са заключени</b> и не се променят от приложението.',
  ])}</div>
<div class="card"><h2>Триене на пътни листове</h2>${li([
    'В таб „История“ можете да изтриете <b>само последните 3</b> издадени листа. По-старите са заключени.',
    'Приложението винаги пита „сигурни ли сте?“ преди да изтрие.',
    'Ако изтриете <b>последния</b> лист, номерът му се освобождава и следващият лист го получава.',
    'Ако изтриете лист, който <b>не е последен</b>, в номерацията остава дупка (например 1, 2, 4). Затова триенето е позволено само за листове, които още не са използвани или отпечатани.',
  ])}</div>
<div class="card"><h2>Къде се пазят листовете – важно!</h2>${li([
    'Листовете се пазят <b>само в този браузър на този компютър</b>. Друг компютър, друг браузър или режим „инкогнито“ няма да ги покаже.',
    'Ако изчистите данните на браузъра, листовете изчезват. Затова редовно сваляйте <b>резервно копие</b> (таб „Автомобили, водачи, дестинации“ → „Данни и резервно копие“) и пазете PDF или Excel на всеки лист.',
    'Ако браузърът не може да запише данните, най-горе се показва червено съобщение и <b>лист не се издава</b> – иначе номерът му би се повторил.',
    'Ако записаните данни не могат да се прочетат, нищо не се изтрива: приложението минава в режим „само четене“ и ви дава да ги свалите, да възстановите резервно копие или да започнете на чисто.',
    'Номерът на листа е във вида ПЛ-2026-0001 и расте с всеки нов лист.',
  ])}</div>`;
}

function render() {
  foot();
  banner();
  $('nav').innerHTML = [
    ['new', 'Нов пътен лист'],
    ['hist', 'История'],
    ['set', 'Автомобили, водачи, дестинации'],
    ['help', 'Инструкции'],
  ]
    .map(([k, l]) => `<button class="${TAB == k ? 'on' : ''}" onclick="TAB='${k}';render()">${l}</button>`)
    .join('');
  $('app').innerHTML =
    TAB == 'help' ? vHelp() : TAB == 'set' ? vSet() + vData() + DIAG : TAB == 'hist' ? vHist() : vNew();
  if (TAB == 'new') {
    autoPeriod();
    if (!DRAFT && $('eo')) $('eo').focus();
  }
  if (TAB == 'set')
    Store.persisted().then((p) => {
      const el = $('pst');
      if (el && p) el.textContent = 'Браузърът пази данните и при липса на място.';
    });
}

function inp(l, id, v, t = 'text', x = '') {
  return `<div><label>${l}</label><input id="${id}" type="${t}" value="${esc(v)}" ${x}></div>`;
}

function grid(k, cols, tpl) {
  return `<div class="sc"><table><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}<th></th></tr>${S[k]
    .map(
      (r, i) =>
        `<tr>${cols
          .map((c) =>
            c[2] == 'd'
              ? `<td><select onchange="S['${k}'][${i}]['${c[0]}']=+this.value;save()"><option value="0" ${S.drivers.some((x) => x.id == r[c[0]]) ? '' : 'selected'}>— изберете водач —</option>${S.drivers.map((x) => `<option value="${x.id}" ${x.id == r[c[0]] ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>`
              : c[2] == 'f'
                ? `<td><select onchange="S['${k}'][${i}]['${c[0]}']=this.value;save()">${[...new Set([...AppData.FUELS, r[c[0]]].filter(Boolean))].map((x) => `<option ${x == r[c[0]] ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>`
                : c[2] == 's'
                  ? `<td><select onchange="S['${k}'][${i}]['${c[0]}']=+this.value;save()">${ptOpts(r[c[0]] ?? 0)}</select></td>`
                  : `<td><input type="${c[2] == 'n' ? 'number' : 'text'}" step="any" value="${esc(r[c[0]])}" oninput="S['${k}'][${i}]['${c[0]}']=${c[2] == 'n' ? '+this.value' : 'this.value'};save()"></td>`,
          )
          .join(
            '',
          )}<td>${k == 'dests' && AppData.isLocked(r) ? '<span title="Основен адрес – не може да се изтрива" style="opacity:.6">🔒</span>' : `<button onclick="delRow('${k}',${i})">✕</button>`}</td></tr>`,
    )
    .join(
      '',
    )}</table></div><div class="row"><button onclick='addRow("${k}",${JSON.stringify(tpl)})'>+ Добави</button></div>`;
}

function addRow(k, t) {
  if (readOnly()) return toast('Режим „само четене“ – промените не се записват.');
  S[k].push({ ...t, id: Date.now() });
  if (!save()) S[k].pop();
  render();
}

function delRow(k, i) {
  if (readOnly()) return toast('Режим „само четене“ – промените не се записват.');
  if (k == 'dests' && AppData.isLocked(S[k][i])) {
    toast('Основните адреси не могат да се изтриват.');
    return;
  }
  const [removed] = S[k].splice(i, 1);
  if (!save()) S[k].splice(i, 0, removed);
  render();
}

function vSet() {
  const c = S.company;
  return `<div class="card"><h2>Данни на фирмата</h2><div class="g">
${['name:Име', 'eik:ЕИК', 'addr:Адрес', 'mol:МОЛ']
  .map((x) => {
    const [f, l] = x.split(':');
    return `<div><label>${l} 🔒</label><input value="${esc(c[f])}" readonly class="lk"></div>`;
  })
  .join('')}
<div><label>Базов адрес (офис) 🔒</label><input value="${esc(S.base)}" readonly class="lk"></div></div></div>
<div class="card"><h2>Автомобили</h2><p class="note">Колоната „Водач“ е водачът по подразбиране при избор на автомобил.</p>${grid(
    'vehicles',
    [
      ['make', 'Марка'],
      ['model', 'Модел'],
      ['plate', 'Рег. номер'],
      ['fuel', 'Гориво', 'f'],
      ['drv', 'Водач', 'd'],
      ['cons', 'Разход на 100 км (л или kWh)', 'n'],
      ['odo', 'Начален километраж', 'n'],
    ],
    { make: '', model: '', plate: '', fuel: 'Бензин', cons: 7, odo: 0, drv: 0 },
  )}</div>
<div class="card"><h2>Водачи</h2>${grid(
    'drivers',
    [
      ['name', 'Име'],
      ['pos', 'Длъжност'],
      ['base', 'Офис на водача (начална и крайна точка по подразбиране)', 's'],
    ],
    { name: '', pos: '', base: 0 },
  )}</div>
<div class="card"><h2>Други офиси (напр. офиси на служители)</h2><p class="note">Могат да се избират за начална и крайна точка. Км – от основния офис, в една посока (ориентировъчно, редактирайте).</p>${grid(
    'offices',
    [
      ['name', 'Офис / адрес'],
      ['km', 'Км от основния офис', 'n'],
    ],
    { name: '', km: 10, type: 'office', purpose: '' },
  )}</div>
<div class="card"><h2>Дестинации и разстояния (км в една посока от базата)</h2><p class="note">Километри в една посока от основния офис.</p>${grid(
    'dests',
    [
      ['name', 'Дестинация'],
      ['km', 'Км (в една посока)', 'n'],
      ['purpose', 'Цел на пътуването'],
    ],
    { name: '', km: 10, purpose: 'Служебна задача' },
  )}</div>`;
}

function vData() {
  const kb = Math.max(1, Math.round(JSON.stringify(S).length / 1024));
  return `<div class="card"><h2>Данни и резервно копие</h2>
<p class="note">Всичко се пази само в този браузър: ${S.sheets.length} издадени листа, около ${kb} KB. ${S.lastBackup ? `Последно резервно копие: ${dm(S.lastBackup)}.` : 'Още няма свалено резервно копие.'}</p>
<div class="row"><button onclick="downloadBackup()">Свали резервно копие (.json)</button><label class="btn">Възстанови от копие…<input type="file" accept=".json,application/json" onchange="pickBackup(this)" hidden></label><button onclick="askPersist()">Защити данните от автоматично изчистване</button><span id="pst" class="note"></span></div>
${
  PENDING
    ? `<p class="bad">Файлът „${esc(PENDING.name)}“ съдържа ${PENDING.data.sheets.length} издадени листа. Текущите данни (${S.sheets.length} листа) ще бъдат заменени – ако ви трябват, първо свалете резервно копие.</p><div class="row"><button class="p" onclick="applyBackup()">Потвърди замяната</button><button onclick="PENDING=null;render()">Отказ</button></div>`
    : ''
}</div>`;
}

/* ---------- разстояния ---------- */

function applyMatrix(j) {
  S.mtxInfo = { g: j.generated || '' };
  const km = j.km || j;
  if (!km || typeof km !== 'object') throw 0;
  S.matrix = km;
  S.dests.concat(S.offices).forEach((d) => {
    const v = km['0|' + d.id];
    if (v != null) d.km = Math.max(1, Math.round(v));
  });
  save();
  return Object.keys(km).length;
}

const hav = (a, b) => {
  const r = Math.PI / 180,
    x =
      Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
      Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

/** Матрица на разстоянията от публичния OSRM – веднъж за браузър. */
async function liveMatrix() {
  const C = AppData.COORDS,
    ids = Object.keys(C),
    key = 'live:v1:' + ids.length;
  if (S.mtxSrc === key && S.matrix) return;
  try {
    const co = ids.map((i) => C[i][1] + ',' + C[i][0]).join(';'),
      r = await (
        await fetch('https://router.project-osrm.org/table/v1/driving/' + co + '?annotations=distance')
      ).json();
    if (r.code !== 'Ok') return;
    const km = {};
    ids.forEach((a, i) =>
      ids.forEach((b, j) => {
        if (i === j) return;
        const d = r.distances[i][j];
        if (d == null) return;
        const road = d / 1000,
          st = hav(C[a], C[b]);
        // защита: нереалистичен резултат (под правата линия или над ~2,2 пъти по-дълъг) се заменя с оценка
        km[a + '|' + b] =
          road >= st * 0.9 && road <= st * 2.2 + 1.5 ? Math.round(road * 10) / 10 : Math.round(st * 1.3 * 10) / 10;
      }),
    );
    applyMatrix({ km, generated: new Date().toISOString() });
    S.mtxSrc = key;
    save();
    if (!DRAFT) render();
  } catch (e) {}
}

/** distances.json до index.html (качен от администратора) има предимство пред OSRM. */
async function autoMatrix() {
  let file = false;
  try {
    const r = await fetch('distances.json', { cache: 'no-cache' });
    if (r.ok) {
      file = true;
      const t = await r.text();
      if (S.mtxSrc !== t) {
        applyMatrix(JSON.parse(t));
        S.mtxSrc = t;
        save();
        if (!DRAFT) render();
      }
    }
  } catch (e) {}
  if (!file) await liveMatrix();
}

/* ---------- нов пътен лист ---------- */

const vs = (vid) => S.sheets.filter((s) => s.vehicle.id == vid),
  prevSheet = (vid, pf) =>
    vs(vid)
      .filter((s) => s.to < pf)
      .sort((a, b) => (a.to < b.to ? -1 : 1))
      .pop(),
  nextSheet = (vid, pt) =>
    vs(vid)
      .filter((s) => s.from > pt)
      .sort((a, b) => (a.from < b.from ? -1 : 1))[0];

const ptOpts = (sel) => {
  const o = (id, n) =>
    `<option value="${id}" ${sel !== undefined && String(sel) == String(id) ? 'selected' : ''}>${esc(n)}</option>`;
  return (
    o(0, S.base + ' (основен офис)') +
    (S.offices.length
      ? '<optgroup label="Други офиси">' + S.offices.map((x) => o(x.id, x.name)).join('') + '</optgroup>'
      : '') +
    '<optgroup label="Обекти и администрации">' +
    S.dests.map((d) => o(d.id, d.name)).join('') +
    '</optgroup>'
  );
};

const monthEnd = (mo) => {
  const [y, m] = mo.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const curVeh = () => S.vehicles.find((x) => x.id == $('veh').value),
  drvOf = (v) => S.drivers.find((x) => x.id == (v && v.drv)) || (v && v.drv === undefined ? S.drivers[0] : undefined);
const lastOf = (vid) =>
  vs(vid)
    .sort((a, b) => (a.to < b.to ? -1 : 1))
    .pop();

function vNew() {
  const v = S.vehicles,
    d = DRAFT;
  return `<div class="card"><h2>Нов пътен лист</h2><div class="g g6">
<div><label>Автомобил</label><select id="veh" onchange="autoPeriod()">${v.map((x) => `<option value="${x.id}">${esc(x.plate)} – ${esc(x.make)} ${esc(x.model)}</option>`).join('')}</select></div>
<div><label>Водач</label><select id="drv" onchange="drvBase()"><option value="">— изберете водач —</option>${S.drivers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
${inp('Период от', 'pf', '', 'date', 'onchange="setTo()"')}${inp('Период до', 'pt', '', 'date', 'onchange="syncOdo(true)"')}
${inp('КМ края на периода', 'eo', '', 'number', 'inputmode="numeric" oninput="odoNote()" onkeydown="if(event.key===\'Enter\')gen()"')}</div>
<p class="note" id="sonote"></p>
<details id="adv" ${ADV ? 'open' : ''} ontoggle="ADV=this.open" style="margin-top:8px"><summary style="cursor:pointer;color:var(--ac)">Още опции (офис, лични км, почивни дни, зареждания)</summary><div class="g" style="margin-top:10px">
<div><label>Офис (начална и крайна точка)</label><select id="sp">${ptOpts()}</select></div>
<div style="display:none">${inp('Километраж в началото на периода', 'so', '', 'number', 'inputmode="numeric" oninput="syncOdo()"')}</div>${inp('От тях лични км', 'pk', '0', 'number', 'inputmode="numeric"')}<div><label>Одобрил (МОЛ)</label><select id="ap">${mols()
    .map((x) => `<option>${esc(x)}</option>`)
    .join('')}<option value="">— без име (по избор) —</option></select></div>
<div class="wide"><label for="off">Почивни дни (по избор)</label><input id="off" type="text" placeholder="напр. 02.01.2026 или 24.12.2026..28.12.2026"><p class="note" style="margin:4px 0 0">Великден и пренесените почивни дни се пропускат автоматично. Тук въведете само еднократни почивни дни, обявени от Министерския съвет.</p></div></div>
<div style="margin-top:12px"><label>Зареждания (по избор)</label><div id="refs">${refRows()}</div><button type="button" onclick="addRef()" style="margin-top:6px">+ Добави зареждане</button></div></details>
<div id="err" class="err">${esc(ERR)}</div><div class="row"><button class="p big" onclick="gen()">Генерирай маршрути</button></div></div>${d ? vReview() : vIssued()}`;
}

let REF = [{ d: '', l: '', n: '' }];
const refRows = () =>
  REF.map(
    (r, i) =>
      `<div class="row" style="margin:4px 0"><input type="date" value="${esc(r.d)}" title="Дата на зареждане" oninput="REF[${i}].d=this.value" style="width:160px"><input type="number" step="0.01" min="0" inputmode="decimal" placeholder="Литри / kWh" value="${esc(r.l)}" oninput="REF[${i}].l=this.value" style="width:130px"><input type="text" placeholder="№ на фактура" value="${esc(r.n)}" oninput="REF[${i}].n=this.value" style="width:200px"><button type="button" title="Премахни" onclick="REF.splice(${i},1);if(!REF.length)REF=[{d:'',l:'',n:''}];$('refs').innerHTML=refRows()">✕</button></div>`,
  ).join('');

function addRef() {
  REF.push({ d: '', l: '', n: '' });
  $('refs').innerHTML = refRows();
}

function refText(pf, pt) {
  return REF.filter((r) => r.d || r.l || r.n)
    .map((r) => {
      if (!r.d) throw 'При зареждане изберете дата';
      if (!(+r.l > 0)) throw 'При зареждане от ' + dm(r.d) + ' въведете количество';
      if (r.d < pf || r.d > pt) throw 'Зареждането от ' + dm(r.d) + ' е извън периода на листа';
      return [dm(r.d), (+r.l).toFixed(2).replace('.', ','), r.n.trim() || '-'].join(';');
    })
    .join('\n');
}

function drvBase() {
  const d = S.drivers.find((x) => x.id == $('drv').value),
    b = d && d.base != null ? d.base : 0;
  if ($('sp')) $('sp').value = b;
}

function autoPeriod() {
  if (!$('veh')) return;
  if (S.lastVeh && S.vehicles.some((x) => x.id == S.lastVeh) && !autoPeriod.u) $('veh').value = S.lastVeh;
  autoPeriod.u = 1;
  const v = curVeh();
  if (!v) return;
  const l = lastOf(v.id);
  let pf,
    mo = today().slice(0, 7);
  if (l) {
    pf = new Date(Date.parse(l.to) + 864e5).toISOString().slice(0, 10);
    mo = pf.slice(0, 7);
  } else pf = mo + '-01';
  let pt = monthEnd(mo);
  if (l && (Date.parse(l.to) - Date.parse(l.from)) / 864e5 <= 7)
    pt = new Date(Date.parse(pf) + 6 * 864e5).toISOString().slice(0, 10);
  $('pf').value = pf;
  $('pt').value = pt;
  const dr = drvOf(v);
  if ($('drv')) $('drv').value = dr ? dr.id : '';
  drvBase();
  syncOdo(true);
}

function setTo() {
  const v = $('pf').value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) $('pt').value = monthEnd(v.slice(0, 7));
  syncOdo(true);
}

function syncOdo(init) {
  const s = $('so');
  if (!s) return;
  if (init) {
    const v = curVeh();
    if (!v) return;
    const l = prevSheet(v.id, $('pf').value);
    s.value = l ? l.endOdo : v.odo;
  }
  odoNote();
}

const odoNote = () => {
  const n = $('sonote');
  if (n && $('so')) {
    const a = +$('so').value,
      b = +$('eo').value;
    n.textContent =
      'Километраж в началото на периода: ' +
      a +
      ' (автоматично от предходния отчет)' +
      (b > a ? ' · изминати: ' + (b - a) + ' км' : '');
  }
};

function gen() {
  ERR = '';
  try {
    const c0 = S.company;
    if (!c0.name || /допълнете/i.test(c0.name) || !c0.eik || !c0.addr)
      throw 'Попълнете данните на фирмата (наименование, ЕИК, адрес) в „Автомобили, водачи, дестинации“.';
    const v = S.vehicles.find((x) => x.id == $('veh').value),
      dr = S.drivers.find((x) => x.id == $('drv').value);
    if (!v || !dr) throw 'Изберете водач (а ако липсва – добавете го в „Настройки“)';
    const so = +$('so').value,
      eo = +$('eo').value,
      pk = +$('pk').value || 0,
      pf = $('pf').value,
      pt = $('pt').value,
      offText = $('off') ? $('off').value.trim() : '',
      mx = 300;
    if (!pf || !pt || pt < pf) throw 'Невалиден период';
    if (!eo) throw 'Въведете КМ края на периода';
    if (eo < so) throw 'Километражът в края на периода не може да е по-малък от този в началото';
    const ov = vs(v.id).find((x) => x.from <= pt && x.to >= pf);
    if (ov)
      throw `Периодът се припокрива с вече издадения ${ov.no} (${dm(ov.from)} – ${dm(ov.to)}) за същия автомобил. Изберете друг период или автомобил, или изтрийте листа от „История“ (само ако е последният издаден).`;
    const l = prevSheet(v.id, pf),
      nx = nextSheet(v.id, pt);
    if (l && so !== l.endOdo)
      throw `Началният километраж трябва да е ${l.endOdo} км – краят на предишния период (${dm(l.from)} – ${dm(l.to)})`;
    if (nx && eo !== nx.startOdo)
      throw `Крайният километраж трябва да е ${nx.startOdo} км – началото на следващия период (${dm(nx.from)} – ${dm(nx.to)})`;
    if (pk < 0 || pk > eo - so) throw 'Невалидни лични км';
    if (eo - so - pk <= 0) throw 'Крайният километраж трябва да е по-голям от началния';
    const sp = +$('sp').value,
      off = Algo.parseOff(offText),
      rt = refText(pf, pt),
      R = router(),
      days = Algo.workdays(pf, pt, off),
      trips = Algo.generate({ T: eo - so - pk, days, router: R, dests: S.dests, max: mx, s: sp, e: sp });
    trips.forEach((t) => Algo.describe(t, R, sp, sp));
    ISSUED = null;
    DRAFT = {
      approver: $('ap') ? $('ap').value : mols()[0] || '',
      company: { ...S.company },
      vehicle: { ...v },
      driver: { ...dr },
      base: S.base,
      from: pf,
      to: pt,
      startOdo: so,
      endOdo: eo,
      personal: pk,
      refuels: rt,
      trips,
      params: { pf, pt, mx, off: offText, s: sp, e: sp, dl: S.dests.map((d) => d.id) },
    };
    Algo.recalc(DRAFT);
    S.lastVeh = v.id;
    const vv = S.vehicles.find((x) => x.id == v.id);
    if (vv) vv.drv = dr.id;
    save();
  } catch (e) {
    ERR = String(e.message || e);
    DRAFT = null;
    if (/Още опции|точк|Водач|период|Период|километраж|Почивни/.test(ERR)) ADV = true;
  }
  const k = snap();
  render();
  restore(k);
}

function vIssued() {
  const x = S.sheets[ISSUED];
  if (!x) return '';
  return `<div class="card"><h2>Издаден: ${esc(x.no)}</h2><p>${esc(x.vehicle.plate || '')} · ${esc(x.driver.name || '')} · ${dm(x.from)} – ${dm(x.to)} · <b>${x.sumKm} км</b></p><div class="row"><button class="p big" onclick="expPdf([ISSUED])">Свали PDF</button><button class="big" onclick="expXls([ISSUED])">Свали Excel</button><button onclick="ISSUED=null;render()">Скрий</button></div><p class="note">Всички издадени листове са в „История“.</p></div>`;
}

function vReview() {
  const d = DRAFT,
    ok = Math.abs(d.diff) <= 1,
    can = ok && !readOnly(),
    bar = `<p>Сума на маршрутите: <b>${d.sumKm} км</b> · Въведени (без лични): <b>${d.target} км</b> · Разлика: <span class="${ok ? 'ok' : 'bad'}">${d.diff > 0 ? '+' : ''}${d.diff} км ${ok ? '(в толеранса ±1 км)' : '(над толеранса!)'}</span><br>Нормативен разход на гориво (${esc(d.vehicle.fuel)}): <b>${nf(d.liters)} ${U(d.vehicle)}</b> (${nf(d.vehicle.cons, 1)} ${U(d.vehicle)}/100 км) · Лични км: ${d.personal}</p>
`,
    act = `<div class="sticky"><div class="row" style="margin:0"><button class="p big" ${can ? '' : 'disabled'} onclick="saveSheet('pdf')">Издай и свали PDF</button><button class="p big" ${can ? '' : 'disabled'} onclick="saveSheet('xls')">Издай и свали Excel</button><button onclick="gen()">Прегенерирай всичко</button>${readOnly() ? '<span class="bad">Издаването е спряно – вижте съобщението най-горе.</span>' : ''}</div></div>`;
  return `<div class="card"><h2>Преглед</h2>${bar}<div class="sc" style="margin-top:14px"><table><tr><th>Дата</th><th>Начална точка</th><th>Маршрут</th><th>Крайна точка</th><th>Цел</th><th>Нач. км</th><th>Изм. км</th><th>Крайни км</th><th>${d.vehicle.fuel == 'Електрически' ? 'kWh' : 'Литри'} (${esc(d.vehicle.fuel.toLowerCase())})</th><th></th></tr>
${d.trips.map((t, i) => `<tr><td><input type="date" value="${t.date}" onchange="DRAFT.trips[${i}].date=this.value"></td><td><input style="min-width:170px" value="${esc(t.from)}" oninput="DRAFT.trips[${i}].from=this.value"></td><td><input style="min-width:210px" placeholder="директно" value="${esc(t.via)}" oninput="DRAFT.trips[${i}].via=this.value"></td><td><input style="min-width:170px" value="${esc(t.to)}" oninput="DRAFT.trips[${i}].to=this.value"></td><td><input style="min-width:200px" value="${esc(t.purpose)}" oninput="DRAFT.trips[${i}].purpose=this.value"></td><td>${t.s}</td><td><input type="number" style="width:80px" value="${t.km}" onchange="DRAFT.trips[${i}].km=+this.value;upd()"></td><td>${t.e}</td><td>${nf(t.l)}</td><td style="white-space:nowrap"><button title="Прегенерирай маршрута" onclick="regen(${i})">↻</button> <button onclick="DRAFT.trips.splice(${i},1);upd()">✕</button></td></tr>`).join('')}</table></div>${d.trips.length > 12 ? `<div style="margin-top:14px">${bar}</div>` : ''}${act}</div>`;
}

// стойностите на формата се пазят при прерисуване след „Генерирай“ и при редакция на ред
const IDS = ['veh', 'drv', 'sp', 'pf', 'pt', 'so', 'eo', 'pk', 'ap', 'off'];
const snap = () => IDS.map((i) => ($(i) ? $(i).value : undefined)),
  restore = (k) => {
    IDS.forEach((i, x) => {
      if ($(i) && k[x] !== undefined) $(i).value = k[x];
    });
    odoNote();
  };

function upd() {
  Algo.recalc(DRAFT);
  const k = window.scrollY,
    f = snap();
  render();
  restore(f);
  scrollTo(0, k);
}

function regen(i) {
  const t = DRAFT.trips[i];
  if (t.client) {
    toast('Посещенията при клиент не се прегенерират – при нужда променете километрите или текста ръчно.');
    return;
  }
  const R = router(),
    p = DRAFT.params,
    o = R.combos(
      S.dests.filter((d) => p.dl.includes(d.id)),
      p.mx - 5,
      p.s,
      p.e,
    ).filter((o) => Math.abs(o.km - t.km) <= Math.max(8, t.km * 0.15) && o.ids.join() != t.ids.join());
  if (!o.length) {
    toast('Няма подходяща алтернатива с този пробег');
    return;
  }
  const c = o[Algo.rint(0, o.length - 1)];
  t.ids = c.ids;
  t.base = c.km;
  Algo.describe(t, R, p.s, p.e);
  upd();
}

function saveSheet(pdf) {
  const d = DRAFT;
  if (readOnly()) {
    toast('Листът не може да се издаде: ' + Store.status().error);
    banner();
    return;
  }
  d.trips = d.trips.filter((t) => t.km > 0);
  Algo.recalc(d);
  if (Math.abs(d.diff) > 1) return;
  if (d.trips.some((t) => !t.date || t.date < d.from || t.date > d.to)) {
    toast('Има маршрути с дата извън избрания период.');
    return;
  }
  d.trips.sort((a, b) => (a.date < b.date ? -1 : 1));
  Algo.recalc(d);
  S.seq++;
  d.no = `ПЛ-${d.to.slice(0, 4)}-${pad(S.seq, 4)}`;
  d.issued = today();
  S.sheets.push(d);
  if (!save()) {
    // записът не успя – листът не се издава, иначе номерът му би се повторил
    S.sheets.pop();
    S.seq--;
    delete d.no;
    delete d.issued;
    render();
    toast('Листът НЕ е издаден, защото данните не могат да се запишат. ' + Store.status().error);
    return;
  }
  DRAFT = null;
  REF = [{ d: '', l: '', n: '' }];
  ISSUED = S.sheets.length - 1;
  render();
  toast('Издаден ' + d.no);
  if (pdf === 'pdf') expPdf([S.sheets.length - 1]);
  if (pdf === 'xls') expXls([S.sheets.length - 1]);
}

/* ---------- история ---------- */

function delSheet(i) {
  if (readOnly()) return toast('Режим „само четене“ – листове не могат да се изтриват.');
  if (i < S.sheets.length - 3) {
    toast('Могат да се изтриват само последните 3 издадени листа.');
    return;
  }
  if (CONF !== 'd' + i) {
    CONF = 'd' + i;
    render();
    return;
  }
  CONF = '';
  const seq = S.seq,
    [removed] = S.sheets.splice(i, 1);
  S.seq = Math.max(0, ...S.sheets.map((z) => parseInt(z.no.slice(-4), 10) || 0));
  if (!save()) {
    S.sheets.splice(i, 0, removed);
    S.seq = seq;
    render();
    return;
  }
  render();
  toast('Листът е изтрит.');
}

function vHist() {
  const fv = window.FV || '',
    ff = window.FF || '',
    ft = window.FT || '';
  const L = S.sheets
    .filter((s) => (!fv || s.vehicle.id == fv) && (!ff || s.to >= ff) && (!ft || s.from <= ft))
    .reverse();
  return `<div class="card"><h2>История на пътните листа</h2><div class="g"><div><label>Автомобил</label><select onchange="FV=this.value;render()"><option value="">Всички</option>${S.vehicles.map((v) => `<option value="${v.id}" ${fv == v.id ? 'selected' : ''}>${esc(v.plate)}</option>`).join('')}</select></div><div><label>От</label><input type="date" value="${ff}" onchange="FF=this.value;render()"></div><div><label>До</label><input type="date" value="${ft}" onchange="FT=this.value;render()"></div></div>
<div class="sc"><table style="margin-top:10px"><tr><th>№</th><th>Издаден</th><th>Автомобил</th><th>Водач</th><th>Период</th><th>Км</th><th>Разход</th><th></th></tr>${
    L.map((s) => {
      const i = S.sheets.indexOf(s);
      return `<tr><td>${s.no}</td><td>${dm(s.issued)}</td><td>${esc(s.vehicle.plate)}</td><td>${esc(s.driver.name)}</td><td>${dm(s.from)} – ${dm(s.to)}</td><td>${s.endOdo - s.startOdo}</td><td>${nf(s.liters)} ${U(s.vehicle)} (${esc(s.vehicle.fuel.toLowerCase())})</td><td style="white-space:nowrap"><button onclick="expPdf([${i}])">PDF</button> <button onclick="expXls([${i}])">Excel</button>${CONF == 'd' + i ? `<button class="p" onclick="delSheet(${i})">Потвърди изтриването</button> <button onclick="CONF='';render()">Отказ</button>` : i >= S.sheets.length - 3 ? `<button onclick="delSheet(${i})">Изтрий</button>` : `<button disabled title="Могат да се изтриват само последните 3 издадени листа">Изтрий</button>`}</td></tr>`;
    }).join('') || '<tr><td colspan=8 class="note">Няма издадени листове</td></tr>'
  }</table></div>
<div class="row"><button ${L.length ? '' : 'disabled'} onclick="expPdf([${L.map((s) => S.sheets.indexOf(s))}])">Експорт на всички филтрирани – PDF</button><button ${L.length ? '' : 'disabled'} onclick="expXls([${L.map((s) => S.sheets.indexOf(s))}])">Експорт на всички филтрирани – Excel</button></div>
${CONF[0] == 'd' && S.sheets[+CONF.slice(1)] ? `<p class="bad">${S.sheets[+CONF.slice(1)].no}: ${+CONF.slice(1) === S.sheets.length - 1 ? 'номерът ще бъде освободен.' : 'в номерацията ще остане пропуск.'} За данъчни цели изтривайте само лист, който не е отпечатан или използван.</p>` : ''}
<p class="note">Номерацията е последователна. Могат да се изтриват само последните 3 издадени листа. Данните се пазят в браузъра.</p></div>`;
}

/* ---------- самотест ---------- */

function selfTest() {
  let bad = 0,
    inf = 0,
    ok = 0;
  const n = 300,
    days = Algo.workdays('2026-09-01', '2026-09-30'),
    R = router();
  for (let i = 0; i < n; i++) {
    const T = Algo.rint(1, 1200);
    try {
      const t = Algo.generate({ T, days, router: R, dests: S.dests, max: 300 }),
        sm = t.reduce((a, x) => a + x.km, 0),
        dl = {};
      t.forEach((x) => (dl[x.date] = (dl[x.date] || 0) + x.km));
      if (Math.abs(sm - T) > 1 || Object.values(dl).some((v) => v > 300) || t.some((x) => !days.includes(x.date)))
        bad++;
      else ok++;
    } catch (e) {
      inf++;
    }
  }
  $('st').textContent =
    `Генерирания: ${n} · верни: ${ok} · грешни: ${bad} · неразпределими: ${inf} (пробег 1–1200 км, септември 2026)`;
}

/* ---------- старт ---------- */

render();
autoMatrix();
{
  const im = new Image();
  im.onload = () => document.body.classList.add('has-photo');
  im.src = 'header.jpg';
}
