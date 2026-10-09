'use strict';

// Pure validation: no network, database access, or guessed/truncated official names.
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be nonempty, trimmed text without control characters`);
  }
  return value;
}
function url(value, label) {
  text(value, label);
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError(`${label} must be an HTTPS URL`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new TypeError(`${label} must be an HTTPS URL without credentials`);
  return value;
}
const compare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function normalizeCatalog(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Catalog must be an object');
  const institution = text(input.institution, 'institution');
  if (typeof input.checked_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.checked_at)
    || !Number.isFinite(Date.parse(input.checked_at)) || new Date(input.checked_at).toISOString().slice(0, 10) !== input.checked_at) {
    throw new TypeError('checked_at must be a real ISO date (YYYY-MM-DD)');
  }
  const source_url = url(input.source_url, 'source_url');
  if (!Array.isArray(input.courses) || input.courses.length === 0) throw new TypeError('courses must be a nonempty array');
  const ids = new Set();
  const courses = input.courses.map((course, i) => {
    const label = `courses[${i}]`;
    if (!course || typeof course !== 'object' || Array.isArray(course)) throw new TypeError(`${label} must be an object`);
    const id = text(course.id, `${label}.id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) throw new TypeError(`${label}.id must be a unique stable slug`);
    ids.add(id);
    const name = text(course.name, `${label}.name`);
    const degree = text(course.degree, `${label}.degree`);
    const modality = text(course.modality, `${label}.modality`);
    const courseSource = url(course.source_url, `${label}.source_url`);
    const curriculum_source_url = course.curriculum_source_url === null ? null : url(course.curriculum_source_url, `${label}.curriculum_source_url`);
    const curriculum_version = course.curriculum_version === null ? null : text(course.curriculum_version, `${label}.curriculum_version`);
    const curriculum_status = course.curriculum_status;
    if (!['complete', 'partial', 'unavailable'].includes(curriculum_status)) throw new TypeError(`${label}.curriculum_status is invalid`);
    if (!Array.isArray(course.subjects)) throw new TypeError(`${label}.subjects must be an array`);
    if (curriculum_status === 'unavailable' && course.subjects.length) throw new TypeError(`${label}: unavailable curricula must not contain subjects`);
    if (curriculum_status !== 'unavailable' && (!course.subjects.length || !curriculum_source_url)) throw new TypeError(`${label}: verified curricula need subjects and a curriculum source`);
    const seen = new Set();
    const subjects = course.subjects.map((subject, j) => {
      if (!subject || typeof subject !== 'object' || Array.isArray(subject)) throw new TypeError(`${label}.subjects[${j}] must be an object`);
      const name = text(subject.name, `${label}.subjects[${j}].name`);
      const semester = subject.semester;
      if (semester !== null && (!Number.isInteger(semester) || semester < 1 || semester > 20)) throw new TypeError(`${label}.subjects[${j}].semester must be null or 1–20`);
      const key = JSON.stringify([name, semester]);
      if (seen.has(key)) throw new TypeError(`${label}: duplicate subject and semester`);
      seen.add(key);
      return { name, semester };
    }).sort((a, b) => (a.semester || 0) - (b.semester || 0) || compare(a.name, b.name));
    return { id, name, degree, modality, source_url: courseSource, curriculum_source_url, curriculum_version, curriculum_status, subjects };
  }).sort((a, b) => compare(a.id, b.id));
  return { institution, checked_at: input.checked_at, source_url, courses };
}
function compatibilityIssues(catalog) {
  const issues = [];
  for (const course of catalog.courses) {
    if ([...course.name].length > 80) issues.push({ course_id: course.id, field: 'course', name: course.name, length: [...course.name].length });
    for (const subject of course.subjects) {
      if ([...subject.name].length > 256) issues.push({ course_id: course.id, field: 'subject', name: subject.name, length: [...subject.name].length });
    }
  }
  return issues;
}
module.exports = { normalizeCatalog, compatibilityIssues };
