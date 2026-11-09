const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');

const folder = uri('/repo');
const resource = uri('/repo/en.yml');
const usage = uri('/repo/steps.py');
const searches = [];
let settings = {};
const vscode = createVscode({
  workspace: {
    getWorkspaceFolder: () => ({ uri: folder }),
    getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
    findFiles: async pattern => {
      searches.push(pattern);
      return pattern.pattern === '**/*.{yaml,yml}' ? [resource] : [usage];
    },
    openTextDocument: async () => ({ getText: () => '[LANG:home.title]', positionAt: offset => offset })
  }
});
const { configuredBases } = loadWithVscode('paths', vscode);
const { findResourceFiles } = loadWithVscode('resources', vscode);
const { findUsages } = loadWithVscode('usages', vscode);
const token = { isCancellationRequested: false };
const document = {
  uri: resource,
  getText: () => 'home:\n  title: Hello\n',
  offsetAt: () => 8
};

test('configured folders accept root and relative paths, and reject paths outside the workspace', () => {
  assert.deepEqual(configuredBases(folder, ['', 'acceptance/resources', '/outside', '../outside',
    'acceptance/../../outside', 'file:outside', 'acceptance\\resources']).map(base => base.path),
  ['/repo', '/repo/acceptance/resources']);
  assert.deepEqual(configuredBases(folder, []), []);
});

test('resource discovery and usage search both resolve empty paths to the workspace root', async () => {
  settings = { resourcePaths: [''], referencePaths: [''] };
  searches.length = 0;
  assert.deepEqual(await findResourceFiles(usage, 'LANG', token), [resource]);
  const results = await findUsages(document, {}, token);
  assert.equal(results.length, 1);
  assert.equal(results[0].uri, usage);
  assert.deepEqual(searches.map(pattern => pattern.base.path), ['/repo', '/repo']);
});

test('empty directory lists disable discovery and usage search', async () => {
  settings = { resourcePaths: [] };
  searches.length = 0;
  assert.deepEqual(await findResourceFiles(usage, 'LANG', token), []);
  assert.deepEqual(await findUsages(document, {}, token), []);
  settings = { resourcePaths: [''], referencePaths: [] };
  assert.deepEqual(await findUsages(document, {}, token), []);
  assert.deepEqual(searches, []);
});

test('omitted directory settings retain default searches', async () => {
  settings = {};
  searches.length = 0;
  await findResourceFiles(usage, 'LANG', token);
  await findUsages({ ...document, uri: uri('/repo/acceptance/resources/language/en.yml') }, {}, token);
  assert.deepEqual(searches.map(pattern => pattern.base.path), [
    '/repo/acceptance/resources/language', '/repo/acceptance/common', '/repo/acceptance/features'
  ]);
});
