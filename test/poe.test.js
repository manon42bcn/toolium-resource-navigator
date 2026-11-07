const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePoe, referenceAt } = require('../out/resolver');

const reference = 'bill:bill.check.genericCardText';

test('POE detection preserves colons and dots in the literal reference', () => {
  const line = `[LANG:a.b] [POE:${reference}] [CONF:c.d]`;
  const found = referenceAt(line, line.indexOf('POE'));
  assert.equal(found.kind, 'POE');
  assert.equal(found.value, reference);
  assert.equal(referenceAt(line, 2).kind, 'LANG');
  assert.equal(referenceAt(line, line.indexOf('CONF')).kind, 'CONF');
});

test('POE matches reference values exactly and returns every occurrence', () => {
  const text = JSON.stringify([
    { term: reference, reference: 'other' },
    { definition: 'Olá', reference },
    { reference: reference + '.suffix' },
    { reference }
  ]);
  const matches = resolvePoe(text, reference);
  assert.equal(matches.length, 2);
  for (const match of matches) {
    assert.equal(JSON.parse(text.slice(match.offset, match.offset + JSON.stringify(reference).length)), reference);
  }
  assert.notEqual(matches[0].offset, matches[1].offset);
  assert.deepEqual(resolvePoe(text, 'bill:bill.check'), []);
  assert.deepEqual(resolvePoe(text, 'bill:bill.check.<example>'), []);
});

test('POE skips malformed documents, non-array roots, and unrelated entries', () => {
  for (const text of ['[', '[{"reference":"x"},]', '[/*comment*/]', '{"reference":"x"}']) {
    assert.deepEqual(resolvePoe(text, 'x'), []);
  }
  assert.deepEqual(resolvePoe('[null,1,[],{}, {"reference":1}, {"nested":{"reference":"x"}}]', 'x'), []);
});

test('POE matches decoded JSON escape sequences while preserving source offsets', () => {
  const text = '[{"reference":"bill:bill.check.\\u006bey"}]';
  assert.deepEqual(resolvePoe(text, 'bill:bill.check.key'), [
    { offset: text.indexOf('"bill:'), depth: 1 }
  ]);
});
