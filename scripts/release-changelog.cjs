const { readFileSync, writeFileSync } = require('node:fs');

const [operation, version] = process.argv.slice(2);
const file = 'CHANGELOG.md';
const changelog = readFileSync(file, 'utf8');
const heading = `## ${version}`;
const unreleased = /^## (?:\d+\.\d+\.\d+ \()?Unreleased\)?$/m;

switch (operation) {
  case 'close': {
    if (!unreleased.test(changelog)) throw new Error('Expected an Unreleased changelog section.');
    writeFileSync(file, changelog.replace(unreleased, heading));
    break;
  }
  case 'open': {
    if (unreleased.test(changelog)) throw new Error('An Unreleased changelog section already exists.');
    writeFileSync(file, changelog.replace(/^# Changelog\n\n/, `# Changelog\n\n${heading} (Unreleased)\n\n`));
    break;
  }
  case 'notes': {
    const sections = changelog.split(/(?=^## )/m);
    const section = sections.find(text => text.startsWith(`${heading}\n`));
    if (!section) throw new Error(`Missing changelog section for ${version}.`);
    process.stdout.write(section.slice(heading.length).trim() || `Release v${version}`);
    break;
  }
  default:
    throw new Error(`Unknown changelog operation: ${operation}`);
}
