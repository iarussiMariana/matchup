'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

// Prefer environment credentials. Legacy fallback reads literals, never runs setup-supabase.js.
function connectionConfig() {
  if (process.env.SUPABASE_DB_URL) {
    return { connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } };
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'setup-supabase.js'), 'utf8');
  const config = {};
  for (const key of ['host', 'user', 'password', 'database']) {
    const match = source.match(new RegExp(`\\b${key}\\s*:\\s*(['"])(.*?)\\1`));
    if (!match) throw new Error(`Missing database configuration field: ${key}`);
    config[key] = match[2];
  }
  config.port = Number(source.match(/\bport\s*:\s*(\d+)/)?.[1] || 5432);
  config.ssl = { rejectUnauthorized: false };
  return config;
}

function client() {
  return new Client({ ...connectionConfig(), connectionTimeoutMillis: 15000, statement_timeout: 20000 });
}

module.exports = { client };
