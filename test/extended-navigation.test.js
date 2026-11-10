const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');
const { referenceAt, resolveYaml, resolveJson, resolvePoe } = require('../out/resolver');

test('explicit LANG language reaches its child key and preserves parent fallback', () => {
  const source = 'home:\n  button:\n    send:\n      en: Send\n      es: Enviar';
  const ref = referenceAt('[LANG:home.button.send::en]', 10);
  assert.deepEqual(ref.path, ['home', 'button', 'send', 'en']);
  assert.equal(resolveYaml(source, ref.path).offset, source.indexOf('en:'));
  assert.equal(resolveYaml(source, ['home', 'button', 'send', 'fr']).depth, 3);
  assert.deepEqual(referenceAt('[LANG:home.button.send]', 10).path, ['home', 'button', 'send']);
  assert.equal(referenceAt('[POE:home::en]', 5).value, 'home::en');
});

test('CONF traverses nested arrays, signed indices, and numeric object keys', () => {
  const source = '{"services":[{"name":"first"},{"name":"last"}],"matrix":[[42]],"0":{"name":true}}';
  assert.equal(resolveJson(source, ['services', '0', 'name']).offset, source.indexOf('"name"'));
  assert.equal(resolveJson(source, ['services', '-1', 'name']).offset, source.indexOf('"name"', source.indexOf('"name"') + 1));
  assert.equal(resolveJson(source, ['services', '+0', 'name']).depth, 3);
  assert.equal(resolveJson(source, ['matrix', '0', '0']).offset, source.indexOf('42'));
  assert.equal(resolveJson(source, ['0', 'name']).depth, 2);
  for (const index of ['2', '-3', '1.5', 'bad', '<index>', '9007199254740993']) {
    assert.equal(resolveJson(source, ['services', index, 'name']).depth, 1);
  }
});

test('POE supports contains, another key field, and prefix ranks without mutating options', () => {
  const source = '[{"code":"bill:mobile.key extra"},{"code":"bill:key"}]';
  const options = {searchType: 'contains', keyField: 'code', prefixes: ['mobile.']};
  const matches = resolvePoe(source, 'bill:key', options);
  assert.deepEqual(matches.map(match => match.priority), [0, 1]);
  assert.deepEqual(options.prefixes, ['mobile.']);
  assert.equal(resolvePoe(source, 'bill:key', {...options, searchType: 'exact'}).length, 1);
  assert.deepEqual(resolvePoe(source, 'bill:key'), []);
  assert.equal(resolvePoe('[{"reference":"pre-key"}]', 'key', {prefixes:['pre-']})[0].priority, 0);
});

function navigationFixture(settings = {}, contents = {}) {
  const discovery = Object.keys(contents);
  let provider;
  const stats = [];

  const vscode = createVscode({
    workspace: {
      getWorkspaceFolder: () => ({uri:uri('/repo')}),
      getConfiguration: () => ({get: (name, fallback) => settings[name] ?? fallback}),
      findFiles: async () => discovery.map(uri),
      fs: {stat: async target => {stats.push(target.path); return {type:1};}},
      openTextDocument: async target => ({
        getText: () => contents[target.path],
        positionAt: offset => ({line:0,character:offset}),
        getWordRangeAtPosition: () => undefined
      })
    },
    languages: {registerDefinitionProvider: (_, value) => {provider=value; return {dispose() {}};}}
  });
  provider = loadWithVscode('extension', vscode).resourceProvider;
  const resolve = value => provider.provideDefinition({uri:uri('/repo/example.feature'),
    lineAt: () => ({text:`[${value}]`})}, {line:0,character:5}, {isCancellationRequested:false});

  return { resolve, stats };
}

test('LANG provider navigates to an explicit language', async () => {
  const source = 'home:\n  send:\n    en: Send';
  const { resolve } = navigationFixture({}, { '/repo/lang.yaml': source });
  const links = await resolve('LANG:home.send::en');
  assert.equal(links[0].targetSelectionRange.args[0].character, source.indexOf('en:'));
});

test('CONF provider navigates through array indices', async () => {
  const source = '{"services":[{"name":"one"}]}';
  const { resolve } = navigationFixture({}, { '/repo/common-properties.json': source });
  const links = await resolve('CONF:services.0.name');
  assert.equal(links[0].targetSelectionRange.args[0].character, source.indexOf('"name"'));
});

test('POE provider selects the first matching prefix across all files', async () => {
  const { resolve } = navigationFixture({
    poeditorSearchType: 'contains', poeditorKeyField: 'code', poeditorPrefixes: ['first.', 'second.']
  }, {
    '/repo/a.json': '[{"code":"bill:second.key"},{"code":"bill:key"}]',
    '/repo/b.json': '[{"code":"bill:first.key suffix"}]',
    '/repo/c.json': '[{"code":"bill:first.key"}]'
  });
  const links = await resolve('POE:bill:key');
  assert.deepEqual(links.map(link => link.targetUri.path), ['/repo/b.json', '/repo/c.json']);
});

test('file providers use independent file and Base64 directories', async () => {
  const { resolve, stats } = navigationFixture({ filePath: 'custom/files', base64Path: 'custom/binary' });
  await resolve('FILE:nested/file.txt');
  await resolve('FILE_UTF8:nested/file.txt');
  await resolve('BASE64:nested/file.bin');
  assert.deepEqual(stats, ['/repo/custom/files/nested/file.txt',
    '/repo/custom/files/nested/file.txt', '/repo/custom/binary/nested/file.bin']);
});

test('large POE result sets preserve all matches for the preferred prefix', async () => {
  const count = 150000;
  const source = JSON.stringify([
    { reference: 'bill:key' },
    ...Array.from({ length: count }, () => ({ reference: 'bill:preferred.key' }))
  ]);
  const { resolve } = navigationFixture({ poeditorPrefixes: ['preferred.'] }, {
    '/repo/poe.json': source
  });
  const links = await resolve('POE:bill:key');
  assert.equal(links.length, count);
  assert.equal(links[0].targetSelectionRange.args[0].character, source.indexOf('"bill:preferred.key"'));
  assert.equal(links.at(-1).targetSelectionRange.args[0].character, source.lastIndexOf('"bill:preferred.key"'));
});

test('large CONF result sets still select the deepest definition', async () => {
  const contents = Object.fromEntries(Array.from({ length: 150000 }, (_, index) =>
    [`/repo/${index}-properties.json`, '{"home":{}}']));
  const deepest = '/repo/deepest-properties.json';
  contents[deepest] = '{"home":{"title":"Hello"}}';
  const { resolve } = navigationFixture({}, contents);
  const links = await resolve('CONF:home.title');
  assert.deepEqual(links.map(link => link.targetUri.path), [deepest]);
});
