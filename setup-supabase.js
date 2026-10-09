const { Client } = require('pg');

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('SUPABASE_DB_PASSWORD is required. This script changes the database; run only with explicit authorization.');
  }
  const client = new Client({
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.drvqiiddgcgvmbbnwdky',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');

  // Enable Realtime for messages, matches, notifications
  const tables = ['messages', 'matches', 'notifications'];
  for (const t of tables) {
    try {
      await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE ' + t);
      console.log('Realtime enabled for ' + t);
    } catch(e) {
      if (e.code === '42710') console.log('Table ' + t + ' already in publication');
      else console.log('Table ' + t + ': ' + e.message);
    }
  }

  // Create storage bucket for photos
  try {
    await client.query("INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('photos', 'photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']) ON CONFLICT (id) DO NOTHING");
    console.log('Storage bucket photos created');
  } catch(e) {
    console.log('Storage bucket: ' + e.message);
  }

  // Bucket RLS policies for storage
  try {
    await client.query("CREATE POLICY allow_authenticated_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'photos')");
    console.log('Storage insert policy created');
  } catch(e) {
    if (e.code === '42710') console.log('Storage insert policy already exists');
    else console.log('Storage insert policy: ' + e.message);
  }

  try {
    await client.query("CREATE POLICY allow_public_select ON storage.objects FOR SELECT USING (bucket_id = 'photos')");
    console.log('Storage select policy created');
  } catch(e) {
    if (e.code === '42710') console.log('Storage select policy already exists');
    else console.log('Storage select policy: ' + e.message);
  }

  // Add photos column (array of URLs from storage)
    try {
      await client.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT ARRAY[]::TEXT[]");
      console.log('photos column added/verified');
    } catch(e) { console.log('photos column: ' + e.message); }

    // Add interests column if not exists
    try {
      await client.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT ARRAY[]::TEXT[]");
      console.log('interests column added/verified');
    } catch(e) { console.log('interests column: ' + e.message); }

    // Verify final structure
    const { rows } = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' ORDER BY ordinal_position");
    console.log('Profiles columns:', rows.map(r => r.column_name).join(', '));

    await client.end();
    console.log('Setup complete!');
}

main().catch(e => { console.error(e); process.exit(1); });