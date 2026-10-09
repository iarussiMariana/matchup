'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeCatalog, compatibilityIssues } = require('../tools/catalog-data.cjs');
const { applyCatalog, migrationSql, seedCatalog } = require('../tools/deploy-catalog.cjs');
const fixture = () => ({ institution: 'FACENS', checked_at: '2026-10-02', source_url: 'https://facens.br/', courses: [
  { id: 'engenharia-presencial', name: 'Engenharia', degree: 'Bacharelado', modality: 'Presencial', source_url: 'https://facens.br/curso/', curriculum_source_url: 'https://facens.br/matriz.pdf', curriculum_version: '2026', curriculum_status: 'partial', subjects: [{ name: 'Física', semester: 2 }, { name: 'Cálculo', semester: 1 }, { name: 'Projeto', semester: null }] },
  { id: 'administracao-ead', name: 'Administração', degree: 'Bacharelado', modality: 'EAD', source_url: 'https://facens.br/ead/', curriculum_source_url: null, curriculum_version: null, curriculum_status: 'unavailable', subjects: [] }
] });
test('normalization is pure, deterministic, preserves names and missing curricula', () => {
  const input = fixture(); const before = structuredClone(input); const normalized = normalizeCatalog(input);
  assert.deepEqual(input, before);
  assert.deepEqual(normalizeCatalog(normalized), normalized);
  assert.equal(normalized.courses[0].id, 'administracao-ead');
  assert.equal(normalized.courses[0].curriculum_source_url, null);
  assert.deepEqual(normalized.courses[1].subjects.map(s => s.name), ['Projeto', 'Cálculo', 'Física']);
  assert.deepEqual(compatibilityIssues(normalized), []);
});
test('rejects malformed metadata, identities, unverifiable curricula, and subject shape', () => {
  const mutations = [
    x => x.institution = ' ', x => x.checked_at = '2026-02-30', x => x.checked_at = 'yesterday',
    x => x.source_url = 'http://facens.br/', x => x.source_url = 'https://user:password@facens.br/',
    x => x.courses = [], x => x.courses.push(x.courses[0]), x => x.courses[0].id = 'Course Name',
    x => x.courses[0].name = ' Engenharia', x => x.courses[0].degree = null,
    x => x.courses[0].curriculum_source_url = null, x => x.courses[0].curriculum_version = undefined,
    x => x.courses[0].curriculum_status = 'invented', x => x.courses[0].subjects = [],
    x => x.courses[1].subjects = [{ name: 'Inventada', semester: 1 }],
    x => x.courses[0].subjects[0].semester = 0, x => x.courses[0].subjects[0].semester = 21,
    x => x.courses[0].subjects[0].semester = '1', x => x.courses[0].subjects[0].semester = 1.5,
    x => x.courses[0].subjects[0].name = 'Física\n', x => x.courses[0].subjects.push(x.courses[0].subjects[0]),
  ];
  for (const mutate of mutations) { const input = fixture(); mutate(input); assert.throws(() => normalizeCatalog(input), TypeError); }
  for (const input of [null, [], 1, 'catalog']) assert.throws(() => normalizeCatalog(input), TypeError);
});
test('course 80 / subject 256 limits are explicit, Unicode-aware, never truncate', () => {
  const input = fixture(); input.courses[0].subjects[0].name = 'á'.repeat(257);
  input.courses[0].name = '🚀'.repeat(80);
  const normalized = normalizeCatalog(input); const issues = compatibilityIssues(normalized);
  assert.equal(issues.length, 1); assert.equal(issues[0].length, 257);
  assert.equal(normalized.courses[1].subjects[2].name, input.courses[0].subjects[0].name);
});
test('113-character official names and 256-character subjects remain intact', () => {
  const input = fixture();
  input.courses[0].subjects[0].name = 'Estágio de Ênfase em Processos Psicossocias e Psicoeducacionais OU Processos de Promoção da Saúde e bem-estar III';
  assert.equal(input.courses[0].subjects[0].name.length, 113);
  assert.deepEqual(compatibilityIssues(normalizeCatalog(input)), []);
  input.courses[0].subjects[0].name = 'x'.repeat(256);
  assert.deepEqual(compatibilityIssues(normalizeCatalog(input)), []);
});
test('official source dataset validates when available', t => {
  const file = path.join(__dirname, '..', 'data', 'facens-catalog.json');
  if (!fs.existsSync(file)) return t.skip('Researcher has not produced verified source dataset yet');
  const catalog = normalizeCatalog(JSON.parse(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(compatibilityIssues(catalog), [], 'Official names exceed course 80 / subject 256 API limits');
});
test('deployment is atomic, migration has no nested transaction, seed is parameterized', async () => {
  assert.doesNotMatch(migrationSql(), /^BEGIN;|^COMMIT;/m);
  assert.doesNotMatch(migrationSql(), /CREATE OR REPLACE FUNCTION public\.mentor_save\(/);
  const calls = []; const db = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } };
  await applyCatalog(db, fixture());
  assert.equal(calls[0].sql, 'BEGIN'); assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.ok(calls.some(c => c.values?.includes('FACENS')));
  assert.ok(calls.some(c => c.sql.includes('ON CONFLICT')));
  assert.ok(!calls.some(c => /DELETE FROM/i.test(c.sql)));
  const attack = fixture(); attack.courses[0].name = "Engenharia'); DROP TABLE profiles; --";
  calls.length = 0; await seedCatalog(db, attack);
  assert.ok(!calls.some(c => c.sql.includes(attack.courses[0].name)));
  assert.ok(calls.some(c => c.values?.includes(attack.courses[0].name)));
});
test('failed deployment rolls back and incompatible dataset never opens transaction', async () => {
  const calls = []; const db = { query: async sql => { calls.push(sql); if (sql.startsWith('UPDATE public.mentor_catalog_courses')) throw new Error('test failure'); } };
  await assert.rejects(() => applyCatalog(db, fixture()), /test failure/);
  assert.equal(calls.at(-1), 'ROLLBACK'); assert.ok(!calls.includes('COMMIT'));
  calls.length = 0; const input = fixture(); input.courses[0].name = 'x'.repeat(81);
  await assert.rejects(() => applyCatalog(db, input), /80-character/); assert.deepEqual(calls, []);
  const overlongSubject = fixture(); overlongSubject.courses[0].subjects[0].name = 'x'.repeat(257);
  await assert.rejects(() => applyCatalog(db, overlongSubject), /256-character/); assert.deepEqual(calls, []);
});
