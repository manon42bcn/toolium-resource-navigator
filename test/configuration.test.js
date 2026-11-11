const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveJson, referenceAt, configurationFileKind } = require('../out/resolver');

const source = '{"qa_openai": {"api_version": "2026", "nested": {"api_version": "other"}}}';

test('CONF and LANG references are detected independently', () => {
  const line = '[LANG:var.foo] [CONF:qa_openai.api_version]';
  assert.equal(referenceAt(line, 3).kind, 'LANG');
  assert.deepEqual(referenceAt(line, 20).path, ['qa_openai', 'api_version']);
  assert.equal(referenceAt(line, 20).kind, 'CONF');
  assert.equal(referenceAt(line, 14), undefined);
});

test('JSON paths select the correct occurrence of a repeated key', () => {
  assert.deepEqual(resolveJson(source, ['qa_openai', 'api_version']), {
    offset: source.indexOf('"api_version"'), depth: 2
  });
  assert.deepEqual(resolveJson(source, ['qa_openai', 'nested', 'api_version']), {
    offset: source.lastIndexOf('"api_version"'), depth: 3
  });
});

test('JSON partial paths stop at dynamic, missing and scalar segments', () => {
  for (const segment of ['<example>', 'missing']) {
    assert.deepEqual(resolveJson(source, ['qa_openai', segment]), {offset: 1, depth: 1});
  }
  assert.equal(resolveJson(source, ['unknown']), undefined);
  assert.equal(resolveJson(source, ['qa_openai', 'api_version', 'child']).depth, 2);
  assert.equal(resolveJson('{"items": [1]}', ['items', '0']).depth, 2);
});

test('invalid JSON, comments and trailing commas are skipped', () => {
  for (const text of ['{"key":', '{"key":1,}', '{/*comment*/"key":1}']) {
    assert.equal(resolveJson(text, ['key']), undefined);
  }
});

test('configuration classification is independent from configurable exclusions', () => {
  assert.equal(configurationFileKind('private.json', ['private.json']), 'base');
  assert.equal(configurationFileKind('dev-private-properties.json', []), 'environment');
  assert.equal(configurationFileKind('custom.json', ['custom.json']), 'base');
  assert.equal(configurationFileKind('dev-eu-properties.json', []), 'environment');
  assert.equal(configurationFileKind('unrelated.json', []), undefined);
});
