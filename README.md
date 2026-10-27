# @benzoni/content-check

Fælles regler for indholdet på Benzoni Studios kundesider. Den samme pakke bruges af:

- **kvalitetstjekket i hvert kunderepo** (når siden bygges på Vercel og i en GitHub Action ved hvert push), og
- **Benzoni Editors server**, før en ændring gemmes.

Så kan reglerne aldrig gå i hver sin retning. Ren JavaScript, ingen afhængigheder, Node 20 eller nyere.

## Installation

Pakken hentes direkte fra GitHub som arkivet for et fast versionsmærke:

```bash
npm install --save-dev --save-exact https://github.com/Benzonistudio/benzoni-content-check/archive/refs/tags/v1.3.0.tar.gz
```

Brug arkivet over https, ikke `github:…`. Ellers skriver npm en SSH-adresse i `package-lock.json`, og så fejler installationen på Vercel og i GitHub Actions. Låsefilen gemmer en kontrolsum af arkivet.

## Brug

```js
import { loadContent, validateContent, imageSources, checkImages, checkSite, formatErrors } from '@benzoni/content-check';

const { schema, content } = loadContent(process.cwd());           // content/*.json og content/schema.json
const errors = [
  ...validateContent({ schema, content, publicDir: 'public' }),   // felter mod schema.json
  ...checkImages({ publicDir: 'public', skip: imageSources(schema, content) }),
  ...checkSite({ distDir: 'dist' })                                // den færdige side
];
console.log(formatErrors(errors));
```

Ét felt ad gangen, fx i editoren:

```js
import { validateField } from '@benzoni/content-check';
validateField(schema, 'menukort.kategorier.0.retter.1.pris', 95);   // []
```

## Fejl

Hver fejl har samme form:

```json
{
  "path": "forside.hero.overskrift",
  "language": "da",
  "audience": "kunde",
  "message": "Teksten i \"Overskrift\" (Øverst på siden, dansk) er for lang (47 tegn). Gør den højst 40 tegn.",
  "detail": "content/forside.json: forside.hero.overskrift (da): …",
  "file": "content/forside.json"
}
```

- `path` er den samme sti som `data-edit` på siden, så editoren kan vise fejlen ved det rigtige element.
- `audience` er `kunde`, når kunden selv kan rette fejlen i editoren, og `patrick`, når fejlen ligger i koden eller i felter med `"editor": false`.
- `message` er dansk i hverdagssprog og bruger feltets `label` fra `schema.json`.

## Regler

| Funktion | Tjekker |
| --- | --- |
| `validateContent` | Påkrævede felter, sprog (kun dansk skal udfyldes; mangler engelsk eller tysk, viser siden dansk), maks/min tegn, linjeskift, mønstre, formateret tekst (kun tilladte tags og sikre links), priser, datoer, perioder, åbningstider, links, telefonnumre, valg, lister, unikke id'er, ukendte felter og filer. Billeder: alt-tekst, filtype, at filen findes, højst 500 KB, samme format som pladsen (±1 %) og mindst samme størrelse. |
| `checkImages` | Alle billedfiler i `public/`: filtype og højst 500 KB. |
| `checkSite` | Den færdige side: alt-tekst på alle `<img>`, døde interne links og ankre, eksterne scripts/iframes/skrifttyper (kun via tilladt-liste) og kendte sporingstjenester (Google Analytics, Meta Pixel, Hotjar, Clarity, TikTok, LinkedIn m.fl.). Sporing må kun komme ind via cookiemodulet. |
| `formatErrors`, `githubAnnotations`, `githubSummary` | Fejlene som tekst, som fejlmarkeringer og som opsummering i GitHub Actions. |

Felttyperne og nøglerne i `schema.json` er beskrevet i `BESLUTNINGER.md` i repoet `benzoni-editor`.

## Udvikling

```bash
npm test
```

En ny version udgives ved at rette `version` i `package.json`, committe og lave et mærke, fx `git tag v1.1.0 && git push --tags`. Kunderepoerne og editoren opdateres derefter hver for sig.

Dette repo er offentligt. Læg aldrig kundedata, nøgler eller andre hemmeligheder her.

## Ændringer

- **1.3.0:** Et billede uden `required` må mangle helt (fx et opslag uden billede).
- **1.2.0:** Ny felttype `toggle` (slået til eller fra), fx til dele af siden, der kan skjules.
- **1.1.0:** I oversatte tekster og alt-tekster skal kun dansk udfyldes. Mangler engelsk eller tysk, viser siden den danske tekst. Et valgfrit felt må være helt tomt, men har et andet sprog tekst, skal dansk også have det.
- **1.0.0:** Første version.


## Valgfrit cookiemodul (1.4.0)

`cookieAssets(global.cookies)` giver installations-HTML, en indstillingsknap og de browserfiler, der skal skrives til dist. `privacyPage(global, global.cookies)` giver en grundskabelon til privatlivssiden. Indsæt `head` på hver side, `settings` i footeren og skriv `files` uændret. Sæt ikke sporingsscripts ind andre steder.

- `aktiv: false` eller en gammel tom opsætning giver ingen scripts eller samtykkeknap. Undlad at kopiere browserkoden til public/.
- Ved `aktiv: true` kræves `loesning: "cookiebot"` og et gyldigt offentligt `samtykkeId`. Analytics-, Ads- og Meta-ID'er er valgfrie. Ingen fri HTML eller JavaScript i opsætningen.
- Hele gruppen skal have `editor: false` i kundens schema.json. Bygningen, ikke kundens browser, vælger opsætningen.
- Kør `checkSite({distDir, cookies: content.global.cookies})`. Tjekket accepterer kun præcis pakkens browserkode og opsætning. Det giver ingen generel tilladelse til eksterne scripts.
- Google starter i basic Consent Mode v2. Ingen Google-/Meta-scripts før relevant samtykke. Tilbagetrækning stopper og genindlæser dokumentet for at fjerne de allerede indlæste tjenester. Kendte cookies, som siden kan fjerne, ryddes. Tredjepartscookies kan ikke loves slettet.
- Ingen leverandører indlæses inde i iframes, herunder Benzoni Editor.

Cookiebot-kontoens banner skal separat sættes op med lige synlig Afvis og Accepter, separate kategorier, passende dansk tekst, farver og skrifttype. Kontrollér rigtige netværkskald, cookies og deklarationen med en gyldig konto, før modulet aktiveres hos en kunde. Tests med falske leverandører beviser ikke opsætningen på kontoen.

Privatlivssiden er en grundskabelon til testkundens statiske side uden kontaktformular. Den skal gennemgås og tilpasses virksomhedens faktiske behandling, hosting og opbevaringstider før brug hos en rigtig kunde.

Integration: [Cookiebot API](https://www.cookiebot.com/en/developer/), [Googles Consent Mode](https://developers.google.com/tag-platform/security/concepts/consent-mode).
