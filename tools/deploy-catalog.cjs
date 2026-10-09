'use strict';

// Usage: node tools\deploy-catalog.cjs [--data path] [--apply]
// Default is offline validation. Only --apply opens a connection and commits.
const fs = require('node:fs');
const path = require('node:path');
const { normalizeCatalog, compatibilityIssues } = require('./catalog-data.cjs');
const root = path.join(__dirname, '..');
function migrationSql() {
  return fs.readFileSync(path.join(root, 'supabase', 'mentorship-catalog.sql'), 'utf8')
    .replace(/^BEGIN;\s*/m, '').replace(/COMMIT;\s*$/, '');
}
async function seedCatalog(db, input) {
  const catalog = normalizeCatalog(input);
  // Retire, never delete: profile FKs and previously used official names survive refreshes.
  await db.query('UPDATE public.mentor_catalog_courses SET active=false WHERE active');
  await db.query('UPDATE public.mentor_catalog_course_subjects SET active=false WHERE active');
  await db.query(`INSERT INTO public.mentor_catalog_metadata(singleton,institution,checked_at,source_url)
    VALUES(true,$1,$2::date,$3) ON CONFLICT(singleton) DO UPDATE SET
    institution=excluded.institution,checked_at=excluded.checked_at,source_url=excluded.source_url`,
  [catalog.institution, catalog.checked_at, catalog.source_url]);
  for (const course of catalog.courses) {
    await db.query(`INSERT INTO public.mentor_catalog_courses
      (id,name,degree,modality,source_url,curriculum_source_url,curriculum_version,curriculum_status,active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,degree=excluded.degree,modality=excluded.modality,source_url=excluded.source_url,
      curriculum_source_url=excluded.curriculum_source_url,curriculum_version=excluded.curriculum_version,
      curriculum_status=excluded.curriculum_status,active=true`,
    [course.id, course.name, course.degree, course.modality, course.source_url, course.curriculum_source_url, course.curriculum_version, course.curriculum_status]);
    if (course.subjects.length) {
      await db.query(`INSERT INTO public.mentor_catalog_subjects(name)
        SELECT DISTINCT name FROM jsonb_to_recordset($1::jsonb) AS s(name text,semester integer)
        ON CONFLICT(name) DO NOTHING`, [JSON.stringify(course.subjects)]);
      await db.query(`INSERT INTO public.mentor_catalog_course_subjects(course_id,subject_name,semester,active)
        SELECT $1,name,coalesce(semester,0),true FROM jsonb_to_recordset($2::jsonb) AS s(name text,semester integer)
        ON CONFLICT(course_id,subject_name,semester) DO UPDATE SET active=true`, [course.id, JSON.stringify(course.subjects)]);
    }
  }
  return catalog;
}
async function applyCatalog(db, input) {
  const catalog = normalizeCatalog(input);
  if (compatibilityIssues(catalog).length) throw new Error('Official names exceed the 80-character course or 256-character subject API limit; deployment blocked, never truncate names.');
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='10s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('spark:mentor:catalog-deploy',0))");
    await db.query(migrationSql());
    await seedCatalog(db, catalog);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
async function main(args = process.argv.slice(2)) {
  let apply = false;
  let file = path.join(root, 'data', 'facens-catalog.json');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--data' && args[i + 1] && !args[i + 1].startsWith('--')) file = path.resolve(args[++i]);
    else throw new Error('Usage: node tools\\deploy-catalog.cjs [--data path] [--apply]');
  }
  const catalog = normalizeCatalog(JSON.parse(fs.readFileSync(file, 'utf8')));
  const issues = compatibilityIssues(catalog);
  console.log(`Validated ${catalog.courses.length} courses, ${catalog.courses.reduce((n, c) => n + c.subjects.length, 0)} curriculum entries; ${catalog.courses.filter(c => c.curriculum_status === 'unavailable').length} unavailable curricula.`);
  if (issues.length) {
    for (const issue of issues) console.error(`INCOMPATIBLE ${issue.course_id}: ${issue.field} has ${issue.length} characters: ${issue.name}`);
    throw new Error('Profile API supports courses up to 80 and subjects up to 256 characters. No names were truncated; deployment blocked.');
  }
  if (!apply) { console.log('Dry validation only. No database connection or changes. Use --apply explicitly to deploy.'); return; }
  const { client } = require(path.join(root, 'tests', 'backend-db.js'));
  try {
    const db = client();
    try { await db.connect(); await applyCatalog(db, catalog); }
    finally { await db.end(); }
  } catch {
    // Do not surface raw driver/configuration errors, which may contain connection details.
    const safe = new Error('Catalog database operation failed.');
    safe.code = 'DATABASE_ERROR';
    throw safe;
  }
  console.log('Catalog schema and verified snapshot committed atomically. Existing profiles/history preserved.');
}
if (require.main === module) main().catch(error => {
  // Connection errors can contain credentials/hosts; only print vetted local validation errors.
  console.error(error.code ? `Catalog operation failed (${error.code}); no partial deployment committed.` : error.message);
  process.exitCode = 1;
});
module.exports = { seedCatalog, migrationSql, applyCatalog, main };
