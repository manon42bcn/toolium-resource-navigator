const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
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

test('FILE provider returns only existing files and does not read their contents', async () => {
  const uri = path => ({path, toString: () => path});
  let provider;
  const stats = [];
  const vscode = {
    Range: class { constructor(...args) { this.args = args; } },
    FileType: {File: 1, Directory: 2},
    Uri: {joinPath: (base, ...parts) => uri([base.path, ...parts].join('/'))},
    workspace: {
      getWorkspaceFolder: () => ({uri: uri('/repo')}),
      fs: {stat: async target => {
        stats.push(target.path);
        if (target.path.endsWith('/missing')) throw Error('Not found');
        return {type: target.path.endsWith('/directory') ? 2 : 1};
      }}
    },
    languages: {registerDefinitionProvider: (_, value) => {provider = value; return {dispose() {}};}}
  };
  const original = Module._load;
  try {
    Module._load = function(name, ...args) {
      return name === 'vscode' ? vscode : original.call(this, name, ...args);
    };
    require('../out/extension').activate({subscriptions: []});
  } finally { Module._load = original; }
  const resolve = (value, kind = 'FILE') => provider.provideDefinition({
    uri: uri('/repo/test.feature'), lineAt: () => ({text: `[${kind}:${value}]`})
  }, {line: 0, character: 7}, {isCancellationRequested: false});
  const links = await resolve('one/two/file.txt');
  assert.equal(links[0].targetUri.path, '/repo/acceptance/resources/one/two/file.txt');
  assert.deepEqual(links[0].targetSelectionRange.args, [0, 0, 0, 0]);
  assert.deepEqual(await resolve('directory'), []);
  assert.deepEqual(await resolve('missing'), []);
  assert.deepEqual(await resolve('../outside.txt'), []);
  const utf8Links = await resolve('one/two/file.txt', 'FILE_UTF8');
  assert.equal(utf8Links[0].targetUri.path, links[0].targetUri.path);
  assert.deepEqual(utf8Links[0].targetSelectionRange, links[0].targetSelectionRange);
  assert.deepEqual(await resolve('directory', 'FILE_UTF8'), []);
  assert.deepEqual(await resolve('missing', 'FILE_UTF8'), []);
  assert.deepEqual(await resolve('../outside.txt', 'FILE_UTF8'), []);
  const base64Links = await resolve('one/two/file.txt', 'BASE64');
  assert.equal(base64Links[0].targetUri.path, links[0].targetUri.path);
  assert.deepEqual(base64Links[0].targetSelectionRange, links[0].targetSelectionRange);
  assert.deepEqual(await resolve('directory', 'BASE64'), []);
  assert.deepEqual(await resolve('missing', 'BASE64'), []);
  assert.deepEqual(await resolve('../outside.txt', 'BASE64'), []);
  assert.equal(stats.length, 9);
});
