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
