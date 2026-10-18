# benzoni-content-check

Den fælles valideringspakke `@benzoni/content-check` for Benzoni Editor. Se `README.md` for brug, fejlformat og regler.

## Læs først

Planen står i `../benzoni-editor/benzoni-editor-spec.md`, og beslutningerne i `../benzoni-editor/BESLUTNINGER.md`.

## Rolle

- Den eneste kilde til reglerne for kundernes indhold. Bruges af kvalitetstjekket i hvert kunderepo og af editorens server, så reglerne aldrig går i hver sin retning.
- Læser regler fra kunderepoets `content/schema.json`. Kundespecifikke regler hører hjemme i `schema.json`, ikke her.

## Regler

- Ingen afhængigheder. Kun Node 20 eller nyere.
- Alle beskeder til kunden er på dansk og i hverdagssprog. Brug "Teksten i …", "Feltet …", "Billedet …", så sætningerne er grammatisk rigtige uanset feltets navn.
- Hver regel har tests (`npm test`).
- Repoet er offentligt: ingen kundedata, nøgler eller hemmeligheder.
- Ny version: ret `version` i `package.json`, commit og lav et mærke (`v1.1.0`). Bryd ikke fejlformatet uden en ny hovedversion.
