/**
 * Database Diagnostic Script
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log('Database Diagnostics');
console.log('='.repeat(70));
console.log(`Supabase URL: ${supabaseUrl}`);
console.log('');

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTable(tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select('*', { count: 'exact' }).limit(1);

    if (error) {
      return { exists: false, error: error.message };
    }
    return { exists: true, count: data?.length || 0 };
  } catch (e) {
    return { exists: false, error: e.message };
  }
}

async function run() {
  // Test tables
  console.log('Checking required tables...\n');

  const tables = ['data_feeds', 'events', 'event_photos'];
  let allExist = true;

  for (const table of tables) {
    const result = await testTable(table);
    if (result.exists) {
      console.log(`  ✓ ${table} exists`);
    } else {
      console.log(`  ✗ ${table} missing - ${result.error}`);
      allExist = false;
    }
  }

  console.log('\n' + '='.repeat(70));

  if (!allExist) {
    console.log('\nSTATUS: ✗ Database schema is missing');
    console.log('\nACTION REQUIRED: Apply the database migration\n');
    console.log('Option 1: Using Supabase Dashboard');
    console.log('1. Open: ' + supabaseUrl);
    console.log('2. Go to SQL Editor');
    console.log('3. Create a new query');
    console.log('4. Copy the content from:');
    console.log('   supabase/migrations/20260818060000_create_events_schema.sql');
    console.log('5. Paste and execute\n');

    console.log('Option 2: Using Supabase CLI');
    console.log('  supabase db push\n');

    process.exit(1);
  } else {
    console.log('\nSTATUS: ✓ Database schema is ready for ingestion');
  }
}

await run();
