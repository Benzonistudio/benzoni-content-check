// Generér en ren tekst-eksport, så Next.js ikke skal læse en fil ved import af validatoren.
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/cookie-runtime.js', import.meta.url), 'utf8');
fs.writeFileSync(new URL('../src/cookie-runtime-source.js', import.meta.url), '// Genereret fra cookie-runtime.js. Kør node scripts/update-cookie-runtime.mjs efter ændringer.\nexport default ' + JSON.stringify(source) + ';\n');
