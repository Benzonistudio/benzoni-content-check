// Skriver fejlene som tekst i terminalen, som fejlmarkeringer i GitHub og som opsummering i GitHub Actions.

const groups = [
  ['kunde', 'Ret dette i editoren'],
  ['patrick', 'Ret dette i koden (Patrick)']
];

export function formatErrors(errors) {
  if (!errors.length) return 'Kvalitetstjekket er bestået.';
  const lines = [`Siden blev ikke udgivet. Kvalitetstjekket fandt ${errors.length} fejl:`];
  for (const [audience, title] of groups) {
    const list = errors.filter(error => error.audience === audience);
    if (!list.length) continue;
    lines.push('', `${title}:`);
    for (const error of list) lines.push(`  - ${error.message}`, `    (${error.detail})`);
  }
  return lines.join('\n');
}

const escapeData = text => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = text => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function githubAnnotations(errors) {
  return errors.map(error => {
    const props = [error.file && `file=${escapeProperty(error.file)}`, `title=${escapeProperty(error.path ? `Kvalitetstjek: ${error.path}` : 'Kvalitetstjek')}`].filter(Boolean).join(',');
    return `::error ${props}::${escapeData(`${error.message} (${error.detail})`)}`;
  }).join('\n');
}

export function githubSummary(errors) {
  if (!errors.length) return '## Kvalitetstjek\n\nBestået. Siden kan udgives.\n';
  const rows = errors.map(error => `| ${error.audience === 'kunde' ? 'Kunden' : 'Patrick'} | ${error.message.replace(/\|/g, '\\|')} | \`${error.path || error.file || ''}\` |`);
  return `## Kvalitetstjek\n\nSiden blev ikke udgivet. ${errors.length} fejl:\n\n| Hvem retter | Besked | Felt |\n| --- | --- | --- |\n${rows.join('\n')}\n`;
}
