const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uri, createVscode, loadWithVscode } = require('./helpers/vscode');
const { completionAt, resourceSuggestions } = require('../out/completion');
const context = text => completionAt(text, text.length);
const labels = (source, text) => resourceSuggestions(source, context(text)).map(item => item.label);
const yaml = 'home:\n  button:\n    send:\n      en: Send\n      pt-br: Enviar\n    cancel:\n      en: Cancel\n';

test('completion detects incomplete placeholders and replaces only the segment under the cursor', () => {
  assert.deepEqual(context('[LANG:'), {kind:'LANG',parent:[],prefix:'',languages:false,start:6,end:6});
  const line = '"[LANG:home.button.send]"';
  const position = line.indexOf('button') + 2;
  const found = completionAt(line, position);
  assert.deepEqual(found.parent, ['home']);
  assert.equal(found.prefix, 'bu');
  assert.equal(line.slice(found.start, found.end), 'button');
  assert.equal(line.slice(0, found.start) + 'other' + line.slice(found.end), '"[LANG:home.other.send]"');
  for (const text of ['[LANG:a] ', '[POE:', '[FILE:', 'plain', '[LANG:home.<channel>.', '[CONF:missing..']) {
    assert.equal(context(text), undefined, text);
  }
  assert.equal(context('[LANG:home.] [CONF:serv').kind, 'CONF');
});

test('LANG offers each exact path level and filters case-sensitive partial keys', () => {
  assert.deepEqual(labels(yaml, '[LANG:'), ['home']);
  assert.deepEqual(labels(yaml, '[LANG:home.'), ['button']);
  assert.deepEqual(labels(yaml, '[LANG:home.button.s'), ['send']);
  assert.deepEqual(labels(yaml, '[LANG:home.button.S'), []);
  assert.deepEqual(labels(yaml, '[LANG:home.missing.'), []);
});

test('LANG hides language children on dotted paths and offers them after ::', () => {
  assert.deepEqual(labels(yaml, '[LANG:home.button.send.'), []);
  assert.deepEqual(labels(yaml, '[LANG:home.button.send::'), ['en','pt-br']);
  assert.deepEqual(labels(yaml, '[LANG:home.button.send::p'), ['pt-br']);
  assert.deepEqual(labels(yaml, '[LANG:home::'), []);
  const line = '[LANG:home.button.send::pt-br]';
  const found = completionAt(line, line.indexOf('pt-br') + 2);
  assert.equal(line.slice(found.start, found.end), 'pt-br');
});

test('CONF offers array indices, follows negative indices, and never falls back on missing parents', () => {
  const json = '{"services":[{"name":"one","nested":{"enabled":true}},{"name":"two"}],"object":{"0":"value"}}';
  assert.deepEqual(labels(json, '[CONF:'), ['services','object']);
  assert.deepEqual(labels(json, '[CONF:serv'), ['services']);
  assert.deepEqual(labels(json, '[CONF:services.'), ['0','1']);
  assert.deepEqual(labels(json, '[CONF:services.0.'), ['name','nested']);
  assert.deepEqual(labels(json, '[CONF:services.-1.n'), ['name']);
  assert.deepEqual(labels(json, '[CONF:services.0.nested.'), ['enabled']);
  assert.deepEqual(labels(json, '[CONF:object.'), ['0']);
  for (const path of ['services.8.', 'services.0.name.', 'absent.', 'services.bad.']) {
    assert.deepEqual(labels(json, '[CONF:' + path), []);
  }
});

test('malformed resources and unaddressable dotted keys do not produce suggestions', () => {
  assert.deepEqual(labels('a: [', '[LANG:'), []);
  assert.deepEqual(labels('{"key":1,}', '[CONF:'), []);
  assert.deepEqual(labels('{"a.b":1,"valid":2}', '[CONF:'), ['valid']);
  assert.deepEqual(labels(yaml, '[LANG:home.button.send::zz'), []);
});

function completionFixture(options = {}) {
  let completion;
  let triggers;
  const configuredPaths = options.paths;
  const noFolder = options.noFolder ?? false;
  const files = options.files ?? [
    '/repo/acceptance/settings/common-properties.json',
    '/repo/acceptance/settings/dev-properties.json',
    '/repo/acceptance/settings/dev-private-properties.json',
    '/repo/acceptance/settings/dev-private.json',
    '/repo/acceptance/settings/private.json',
    '/repo/acceptance/settings/unrelated.json',
    '/repo/acceptance/settings/broken-properties.json',
    '/repo/acceptance/settings/unreadable-properties.json'
  ];
  const documents = new Map([
    [files[0], '{"services":[{"name":"one"}]}'],
    [files[1], '{"services":[{"name":"two","extra":true}]}'],
    [files[6], '{invalid']
  ]);
  const opened = [];
  const patterns = [];

  const vscode = createVscode({
    RelativePattern:class {constructor(base,pattern) {patterns.push({base,pattern});}},
    workspace:{
      getWorkspaceFolder:() => noFolder ? undefined : {uri:uri('/repo')},
      getConfiguration:() => ({get:(key,fallback) => {
        if (key === 'configurationPaths' && configuredPaths) return configuredPaths;
        if (key === 'baseConfigurationFiles') return ['common-properties.json','dev-private.json'];
        return fallback;
      }}),
      findFiles:async () => files.map(uri),
      openTextDocument:async target => {
        opened.push(target.path);
        assert.ok(!target.path.includes('private'), 'Private documents must never be opened');
        if (!documents.has(target.path)) throw Error('Unreadable file');
        return {getText:() => documents.get(target.path)};
      }
    },
    languages:{
      registerCompletionItemProvider:(_,value,...characters) => {completion=value;triggers=characters;return {dispose() {}};}
    }
  });
  loadWithVscode('extension', vscode).activate({ subscriptions: [] });
  const token={isCancellationRequested:false};
  const complete=(text,character=text.length) => completion.provideCompletionItems({
    uri:uri('/repo/example.feature'),lineAt:() => ({text})
  }, {line:0,character},token);
  return { complete, triggers, token, documents, files, opened, patterns };
}

test('completion registers colon and dot triggers', () => {
  assert.deepEqual(completionFixture().triggers, [':', '.']);
});

test('CONF completion merges origins and skips private, invalid and unreadable files', async () => {
  const { complete, opened, patterns } = completionFixture();
  const items = await complete('[CONF:services.0.');
  assert.deepEqual(items.map(item => item.label), ['extra', 'name']);
  const name = items.find(item => item.label === 'name');
  assert.ok(name.detail.includes('acceptance/settings/common-properties.json'));
  assert.ok(name.detail.includes('acceptance/settings/dev-properties.json'));
  assert.equal(opened.length, 4);
  assert.equal(patterns[0].base.path, '/repo/acceptance/settings');
  assert.equal(patterns[0].pattern, '**/*.json');
  assert.deepEqual(name.range.args, [0, 17, 0, 17]);
});

test('completion reads edits made after a previous request', async () => {
  const { complete, documents, files } = completionFixture();
  await complete('[CONF:services.0.');
  documents.set(files[0], '{"services":[{"updated":true}]}');
  const items = await complete('[CONF:services.0.u');
  assert.deepEqual(items.map(item => item.label), ['updated']);
});

test('cancelled completion does not open resource documents', async () => {
  const { complete, token, opened } = completionFixture();
  token.isCancellationRequested = true;
  assert.deepEqual(await complete('[CONF:'), []);
  assert.equal(opened.length, 0);
});

test('completion searches configured directories', async () => {
  const { complete, patterns } = completionFixture({ paths: ['custom/settings'] });
  await complete('[CONF:');
  assert.equal(patterns[0].base.path, '/repo/custom/settings');
});

test('LANG completion replaces the current segment and preserves its closing bracket', async () => {
  const { complete, documents } = completionFixture({ files: ['/repo/lang.yaml'] });
  documents.set('/repo/lang.yaml', yaml);
  const text = '[LANG:home.button.something]';
  const items = await complete(text, text.indexOf('something') + 1);
  assert.deepEqual(items.map(item => item.label), ['send']);
  assert.equal(items[0].insertText, 'send');
  assert.deepEqual(items[0].range.args, [0, text.indexOf('something'), 0, text.indexOf(']')]);
});

test('LANG provider offers explicit language completions', async () => {
  const { complete, documents } = completionFixture({ files: ['/repo/lang.yaml'] });
  documents.set('/repo/lang.yaml', yaml);
  const items = await complete('[LANG:home.button.send::');
  assert.deepEqual(items.map(item => item.label), ['en', 'pt-br']);
});

test('completion without a workspace returns no suggestions', async () => {
  const { complete, opened } = completionFixture({ noFolder: true });
  assert.deepEqual(await complete('[LANG:'), []);
  assert.deepEqual(opened, []);
});
