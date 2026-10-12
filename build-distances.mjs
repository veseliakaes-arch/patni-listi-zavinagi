// Еднократно изчисляване на матрицата с разстояния. Node 18+. Пуска се локално:  node build-distances.mjs
import fs from 'fs';
const pts = JSON.parse(fs.readFileSync('points.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const failed = [];

// 1) Геокодиране само на точките без координати (Nominatim: макс. 1 заявка/сек)
for (const p of pts) {
  if (p.lat != null && p.lon != null) continue;
  const u = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=bg&q=' + encodeURIComponent(p.query);
  const r = await (await fetch(u, { headers: { 'User-Agent': 'pateni-listove/1.0 (nnaydenov@bld.bg)' } })).json();
  if (r[0]) { p.lat = +r[0].lat; p.lon = +r[0].lon; } else failed.push(p.id);
  await sleep(1100);
}
if (failed.length) console.warn('Без координати (попълнете ръчно lat/lon в points.json):', failed.join(', '));
const ok = pts.filter(p => p.lat != null);

// 2) OSRM: матрица на разстоянията (метри) – една заявка за до ~100 точки
const coords = ok.map(p => `${p.lon},${p.lat}`).join(';');
const res = await (await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance`)).json();
if (res.code !== 'Ok') throw new Error('OSRM: ' + res.code);
const km = {};
ok.forEach((a, i) => ok.forEach((b, j) => { if (i !== j) km[`${a.id}|${b.id}`] = Math.round(res.distances[i][j] / 100) / 10; }));

fs.writeFileSync('points.resolved.json', JSON.stringify(pts, null, 1));
fs.writeFileSync('distances.json', JSON.stringify({ generated: new Date().toISOString(), source: 'OSRM', km }, null, 1));
console.log(`Готово: ${ok.length} точки, ${Object.keys(km).length} двойки.`);
