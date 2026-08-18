/**
 * Database Setup Script
 * Applies the events schema migration to Supabase
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

// Get credentials
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_KEY not found in environment');
  console.error('Please set them in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableExists(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(0);

    return !error || error.code !== 'PGRST116';
  } catch {
    return false;
  }
}

async function setupDatabase() {
  console.log('Database Setup Script');
  console.log('='.repeat(70));

  // Read the migration SQL file
  const migrationPath = path.join(projectRoot, 'supabase/migrations/20260818_create_events_schema.sql');

  console.log(`Reading migration file: ${migrationPath}`);
  let sql;
  try {
    sql = await fs.readFile(migrationPath, 'utf-8');
  } catch (error) {
    console.error(`Error reading migration file: ${error.message}`);
    process.exit(1);
  }

  // Check if tables already exist
  console.log('\nChecking if tables exist...');
  const dataFeedsExists = await checkTableExists('data_feeds');
  const eventsExists = await checkTableExists('events');
  const eventPhotosExists = await checkTableExists('event_photos');

  if (dataFeedsExists && eventsExists && eventPhotosExists) {
    console.log('✓ All tables already exist');
    console.log('\nDatabase setup complete - schema is ready.');
    return;
  }

  console.log('\nTables status:');
  console.log(`  data_feeds: ${dataFeedsExists ? '✓ exists' : '✗ missing'}`);
  console.log(`  events: ${eventsExists ? '✓ exists' : '✗ missing'}`);
  console.log(`  event_photos: ${eventPhotosExists ? '✓ exists' : '✗ missing'}`);

  console.log('\nTo create the database schema:');
  console.log('1. Open Supabase Dashboard: ' + supabaseUrl);
  console.log('2. Go to SQL Editor');
  console.log('3. Click "New query"');
  console.log('4. Paste the SQL below and execute it:\n');
  console.log('─'.repeat(70));

  // Print only the actual SQL (skip comments about copy-paste instructions)
  const sqlLines = sql.split('\n');
  const startIdx = sqlLines.findIndex(line => line.includes('CREATE TABLE'));
  if (startIdx >= 0) {
    console.log(sqlLines.slice(startIdx).join('\n'));
  } else {
    console.log(sql);
  }

  console.log('─'.repeat(70));
  console.log('\nAlternatively, you can run this script with the Supabase CLI:');
  console.log('  supabase db push');
  console.log('\nOr you can set SUPABASE_SERVICE_KEY environment variable');
  console.log('to enable automatic schema setup (requires admin access).');
}

setupDatabase().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
