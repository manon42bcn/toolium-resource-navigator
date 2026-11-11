const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configurationExcluded, defaultConfigurationExcludePatterns: defaults } = require('../out/configurationExclusions');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');

test('default globs preserve private names and are case insensitive', () => {
  for (const name of ['private.json', 'private-properties.json', 'dev-private.json',
    'dev-private-properties.json', 'DEV-PRIVATE.JSON']) {
    assert.ok(configurationExcluded('acceptance/settings/' + name, defaults));
  }
  assert.equal(configurationExcluded('settings/dev-properties.json', defaults), false);
});

test('exclusions support filenames and workspace-relative globs, and [] disables them', () => {
  assert.ok(configurationExcluded('settings/dev-properties.json', ['dev-properties.json']));
  assert.ok(configurationExcluded('settings/nested/dev-properties.json', ['settings/**/*.json']));
  assert.equal(configurationExcluded('other/dev-properties.json', ['settings/**/*.json']), false);
  assert.equal(configurationExcluded('settings/private.json', []), false);
  assert.equal(configurationExcluded('settings/private.json', ['dev-properties.json']), false);
});

test('CONF discovery applies overrides before opening even explicitly listed base files', async () => {
  const files = ['private.json', 'dev-private-properties.json', 'dev-properties.json']
    .map(name => uri('/repo/acceptance/settings/' + name));
  let patterns;
  const vscode = createVscode({ workspace: {
    getWorkspaceFolder: () => ({ uri: uri('/repo') }),
    getConfiguration: () => ({ get: (key, fallback) => key === 'configurationExcludePatterns' ? patterns
      : key === 'baseConfigurationFiles' ? ['private.json'] : fallback }),
    findFiles: async () => files,
    openTextDocument: () => { throw Error('Discovery must not read files'); }
  }});
  const { findResourceFiles } = loadWithVscode('resources', vscode);
  const discover = () => findResourceFiles(uri('/repo/example.py'), 'CONF', { isCancellationRequested: false });
  patterns = defaults;
  assert.deepEqual((await discover()).map(file => file.path), [files[2].path]);
  patterns = [];
  assert.equal((await discover()).length, 3);
  patterns = ['**/dev-properties.json'];
  assert.deepEqual((await discover()).map(file => file.path), [files[0].path, files[1].path]);
});
