const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');
const { filePathSegments, referenceAt } = require('../out/resolver');

test('FILE references preserve nested paths, spaces, and filename dots', () => {
  const value = 'one/two/my file.data.txt';
  assert.equal(referenceAt(`[FILE:${value}]`, 8).value, value);
  assert.equal(referenceAt(`[FILE:${value}]`, 8).kind, 'FILE');
  assert.equal(referenceAt(`[FILE_UTF8:${value}]`, 8).kind, 'FILE_UTF8');
  assert.equal(referenceAt(`[FILE_UTF8:${value}]`, 8).value, value);
  assert.equal(referenceAt(`[BASE64:${value}]`, 8).kind, 'BASE64');
  assert.equal(referenceAt(`[BASE64:${value}]`, 8).value, value);
  assert.deepEqual(filePathSegments(value), ['one', 'two', 'my file.data.txt']);
  assert.deepEqual(filePathSegments('LICENSE'), ['LICENSE']);
});

test('FILE paths must identify a relative file beneath resources', () => {
  for (const path of ['', '/tmp/file', '../file', 'a/../../file', 'a/',
    'a//file', './file', 'a/./file', 'C:/file', 'file:///tmp/file', 'a\\file', 'a\0file']) {
    assert.equal(filePathSegments(path), undefined, path);
  }
});

function fileFixture() {
  let provider;
  const stats = [];
  const vscode = createVscode({
    workspace: {
      getConfiguration: () => ({get: (_, fallback) => fallback}),
      getWorkspaceFolder: () => ({uri: uri('/repo')}),
      fs: {stat: async target => {
        stats.push(target.path);
        if (target.path.endsWith('/missing')) throw Error('Not found');
        return {type: target.path.endsWith('/directory') ? 2 : 1};
      }}
    },
    languages: {registerDefinitionProvider: (_, value) => {provider = value; return {dispose() {}};}}
  });
  provider = loadWithVscode('extension', vscode).resourceProvider;
  const resolve = (value, kind = 'FILE') => provider.provideDefinition({
    uri: uri('/repo/test.feature'), lineAt: () => ({text: `[${kind}:${value}]`})
  }, {line: 0, character: 7}, {isCancellationRequested: false});
  return { resolve, stats };
}

for (const kind of ['FILE', 'FILE_UTF8', 'BASE64']) {
  test(`${kind} navigates to existing files without reading their contents`, async () => {
    const { resolve, stats } = fileFixture();
    const links = await resolve('one/two/file.txt', kind);
    assert.equal(links[0].targetUri.path, '/repo/acceptance/resources/one/two/file.txt');
    assert.deepEqual(links[0].targetSelectionRange.args, [0, 0, 0, 0]);
    assert.deepEqual(stats, ['/repo/acceptance/resources/one/two/file.txt']);
  });
  for (const value of ['directory', 'missing', '../outside.txt']) {
    test(`${kind} rejects ${value}`, async () => {
      const { resolve, stats } = fileFixture();
      assert.deepEqual(await resolve(value, kind), []);
      assert.equal(stats.length, value === '../outside.txt' ? 0 : 1);
    });
  }
}
