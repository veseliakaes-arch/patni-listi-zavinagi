# Външни библиотеки и шрифт

Всичко тук се сервира от самия сайт, затова не са нужни CDN, SRI или Google Fonts.

| Файл | Версия | Източник | Лиценз | SHA-256 |
|---|---|---|---|---|
| `pdfmake.min.js` | 0.2.7 | npm `pdfmake@0.2.7` | MIT | `21af5bb8ba1561f9f99d4125aa6d3cd08fa6d2351eaf4ec8d1097e69ecc00828` |
| `vfs_fonts.js` (Roboto) | 0.2.7 | npm `pdfmake@0.2.7` | MIT (шрифт Roboto – Apache 2.0) | `37abe8ae52fd6cf54f720f1cf1bd5bd0db7e4aefede573cad378d313ef93e483` |
| `xlsx.full.min.js` | 0.18.5 | npm `xlsx@0.18.5` | Apache 2.0 | `c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99` |
| `manrope-*.woff2` | 5.3.0 | npm `@fontsource-variable/manrope@5.3.0` (вижте бележката) | SIL OFL 1.1 | – |

## SheetJS

Приложението само **записва** .xlsx. Известните уязвимости на 0.18.5 (CVE-2023-30533, CVE-2024-22363) засягат **четенето** на файлове, затова днес не могат да се използват.
Преди да се добави импорт от Excel, обновете библиотеката:

1. Свалете `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (новите версии не се публикуват в npm).
2. Заменете с него `xlsx.full.min.js` в хранилището (името остава същото).
3. Пуснете `node --test` и проверете сваляне на Excel от „История“.

## Шрифтът Manrope

Файловете са от `@fontsource-variable/manrope` (същият шрифт като в Google Fonts), подмножества кирилица, латиница и разширена латиница.
От кирилицата е махнат само езиковият режим „Bulgarian“ (`BGR`) на OpenType, който при `lang="bg"` сменя формите на д, г, т и др. с „българската кирилица“. Така сайтът изглежда както досега. Повторение:

```python
from fontTools.ttLib import TTFont
t = TTFont('manrope-cyrillic-wght-normal.woff2')
for sr in t['GSUB'].table.ScriptList.ScriptRecord:
    sr.Script.LangSysRecord = [ls for ls in sr.Script.LangSysRecord if ls.LangSysTag != 'BGR ']
    sr.Script.LangSysCount = len(sr.Script.LangSysRecord)
t.flavor = 'woff2'
t.save('manrope-cyrillic-wght-normal.woff2')
```

Ако предпочитате българските форми, сложете оригиналния файл от пакета на негово място.
