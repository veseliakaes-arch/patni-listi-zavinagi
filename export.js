/*
 * Сваляне на файлове и експорт на пътните листове в PDF (pdfmake) и Excel (SheetJS).
 * Ползва помощните функции от app.js (dm, nf, U) – извикват се едва след като всичко е заредено.
 */

/** Сваля файл в браузъра. */
function saveFile(name, bytes, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const fname = (x) => [x.no, x.vehicle.plate.replace(/\s+/g, ''), x.from, x.to].join('_').replace(/[\\/:*?"<>|]/g, '');

/** Листове от по-стари версии пазят маршрута като един текст – тук се разделя на части. */
function N(t) {
  if (t.from !== undefined) return t;
  const p = (t.route || '').split(' → ');
  return { from: p[0], to: p[p.length - 1], via: p.slice(1, -1).join('; ') };
}

function pdfSheet(s, first) {
  const H = (t, w) => ({ text: t, bold: true, fillColor: '#eeeeee', fontSize: 8, alignment: w || 'left' }),
    C = (t, a) => ({ text: String(t), fontSize: 8, alignment: a || 'left' });
  const rows = [
    [
      H('№'),
      H('Дата'),
      H('Начална точка'),
      H('Маршрут'),
      H('Крайна точка'),
      H('Цел на пътуването'),
      H('Нач. км', 'right'),
      H('Крайни км', 'right'),
      H('Изм. км', 'right'),
      H('Разход ' + s.vehicle.fuel.toLowerCase() + ', ' + U(s.vehicle), 'right'),
    ],
    ...s.trips.map((t, i) => [
      C(i + 1),
      C(dm(t.date)),
      C(N(t).from),
      C(N(t).via || '—'),
      C(N(t).to),
      C(t.purpose),
      C(t.s, 'right'),
      C(t.e, 'right'),
      C(t.km, 'right'),
      C(nf(t.l), 'right'),
    ]),
    ...(s.personal
      ? [
          [
            C(''),
            C(''),
            C('Лично ползване (отчетено отделно)'),
            C(''),
            C(''),
            C(''),
            C(s.startOdo + s.sumKm, 'right'),
            C(s.endOdo, 'right'),
            C(s.personal, 'right'),
            C(''),
          ],
        ]
      : []),
    [
      { text: 'ОБЩО за периода', colSpan: 6, bold: true, fontSize: 8 },
      {},
      {},
      {},
      {},
      {},
      C(s.startOdo, 'right'),
      C(s.endOdo, 'right'),
      C(s.endOdo - s.startOdo, 'right'),
      C(nf(s.liters), 'right'),
    ],
  ];
  const f = s.refuels.split('\n').filter((x) => x.trim());
  return [
    {
      text: `ПЪТЕН ЛИСТ № ${s.no}`,
      fontSize: 15,
      bold: true,
      alignment: 'center',
      pageBreak: first ? undefined : 'before',
    },
    {
      text: `Дата на издаване: ${dm(s.issued)} · Период: ${dm(s.from)} – ${dm(s.to)}`,
      alignment: 'center',
      fontSize: 9,
      margin: [0, 2, 0, 8],
    },
    {
      columns: [
        {
          width: '*',
          fontSize: 9,
          text: [
            { text: 'Фирма: ', bold: true },
            `${s.company.name}\nЕИК: ${s.company.eik}\nАдрес: ${s.company.addr}\nПредставители (МОЛ): ${s.company.mol}`,
          ],
        },
        {
          width: '*',
          fontSize: 9,
          text: [
            { text: 'Автомобил: ', bold: true },
            `${s.vehicle.make} ${s.vehicle.model}, ${s.vehicle.plate}\nГориво: ${s.vehicle.fuel}\nНорма: ${nf(s.vehicle.cons, 1)} ${U(s.vehicle)}/100 км\n`,
            { text: 'Водач: ', bold: true },
            `${s.driver.name}${s.driver.pos ? ' (' + s.driver.pos + ')' : ''}`,
          ],
        },
      ],
    },
    {
      table: { headerRows: 1, widths: [16, 42, '*', 90, '*', 85, 40, 40, 34, 52], body: rows },
      margin: [0, 10, 0, 6],
      layout: 'lightHorizontalLines',
    },
    {
      fontSize: 9,
      text: `Начален километраж: ${s.startOdo} · Краен: ${s.endOdo} · Изминати: ${s.endOdo - s.startOdo} км (служебни ${s.sumKm}, лични ${s.personal}). Нормативен разход на гориво (${s.vehicle.fuel}): ${s.sumKm} км × ${nf(s.vehicle.cons, 1)} ${U(s.vehicle)}/100 км = ${nf(s.liters)} ${U(s.vehicle)}.`,
    },
    {
      fontSize: 9,
      margin: [0, 4, 0, 0],
      text:
        'Зареждания: ' +
        (f.length
          ? f
              .map((x) => {
                const p = x.split(';');
                return `${p[0] || ''}: ${p[1] || ''} ${U(s.vehicle)}, фактура № ${p[2] || '-'}`;
              })
              .join(' | ')
          : 'няма отчетени'),
    },
    {
      columns: [
        { text: '\n\n______________________\nВодач: ' + s.driver.name, fontSize: 9 },
        {
          text: '\n\n______________________\nОдобрил (ръководител/МОЛ): ' + (s.approver || ''),
          fontSize: 9,
          alignment: 'right',
        },
      ],
      margin: [0, 20, 0, 0],
    },
  ];
}

function expPdf(ix) {
  const c = ix.flatMap((i, k) => pdfSheet(S.sheets[i], !k));
  pdfMake
    .createPdf({
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [28, 28, 28, 28],
      content: c,
      defaultStyle: { font: 'Roboto' },
    })
    .getBuffer((b) =>
      saveFile(ix.length == 1 ? fname(S.sheets[ix[0]]) + '.pdf' : 'pateni-listove.pdf', b, 'application/pdf'),
    );
}

function expXls(ix) {
  const wb = XLSX.utils.book_new();
  ix.forEach((i) => {
    const s = S.sheets[i],
      a = [
        [`ПЪТЕН ЛИСТ № ${s.no}`],
        ['Дата на издаване', dm(s.issued), 'Период', `${dm(s.from)} – ${dm(s.to)}`],
        ['Фирма', s.company.name, 'ЕИК', s.company.eik],
        ['Адрес', s.company.addr, 'МОЛ', s.company.mol],
        ['Автомобил', `${s.vehicle.make} ${s.vehicle.model}`, 'Рег. номер', s.vehicle.plate],
        ['Гориво', s.vehicle.fuel, 'Норма ' + U(s.vehicle) + '/100 км', s.vehicle.cons],
        ['Водач', s.driver.name, 'Длъжност', s.driver.pos],
        [],
        [
          '№',
          'Дата',
          'Начална точка',
          'Маршрут',
          'Крайна точка',
          'Цел на пътуването',
          'Начален км',
          'Краен км',
          'Изминати км',
          'Разход ' + s.vehicle.fuel.toLowerCase() + ', ' + U(s.vehicle),
        ],
        ...s.trips.map((t, k) => [
          k + 1,
          dm(t.date),
          N(t).from,
          N(t).via || '—',
          N(t).to,
          t.purpose,
          t.s,
          t.e,
          t.km,
          t.l,
        ]),
        ...(s.personal ? [['', '', 'Лично ползване', '', '', '', s.startOdo + s.sumKm, s.endOdo, s.personal, '']] : []),
        [
          '',
          '',
          'ОБЩО за периода',
          '',
          '',
          '',
          s.startOdo,
          s.endOdo,
          s.endOdo - s.startOdo,
          Math.round(s.liters * 100) / 100,
        ],
        [],
        ['Зареждания: дата', 'Количество, ' + U(s.vehicle), '№ на фактура'],
        ...s.refuels
          .split('\n')
          .filter((x) => x.trim())
          .map((x) => x.split(';').map((v, i) => (i == 1 ? +v.replace(',', '.') : v))),
        ...(s.refuels.trim() ? [] : [['няма отчетени зареждания']]),
        [],
        ['Водач: ____________', '', 'Одобрил: ____________ ' + (s.approver || '')],
      ],
      ws = XLSX.utils.aoa_to_sheet(a);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 12 },
      { wch: 34 },
      { wch: 30 },
      { wch: 34 },
      { wch: 30 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, s.no);
  });
  saveFile(
    ix.length == 1 ? fname(S.sheets[ix[0]]) + '.xlsx' : 'pateni-listove.xlsx',
    new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}
