#!/usr/bin/env node

/**
 * Apply Database Migration to Supabase
 *
 * This script provides instructions for applying the events schema migration
 * to your Supabase database.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

// Load environment
dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

async function applyMigration() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Event Ingestion Database Setup');
  console.log('='.repeat(80));

  if (!supabaseUrl) {
    console.error('\nError: Supabase URL not found in environment');
    process.exit(1);
  }

  console.log(`\nProject: ${supabaseUrl}`);

  // Read the migration file
  const migrationPath = path.join(
    projectRoot,
    'supabase/migrations/20260818060000_create_events_schema.sql',
  );

  let migrationSQL;
  try {
    migrationSQL = await fs.readFile(migrationPath, 'utf-8');
  } catch (error) {
    console.error(`\nError: Could not read migration file: ${error.message}`);
    process.exit(1);
  }

  // Extract just the SQL (remove comments)
  const sqlLines = migrationSQL.split('\n');
  const sqlStart = sqlLines.findIndex((line) => line.startsWith('CREATE TABLE'));

  if (sqlStart < 0) {
    console.error('\nError: Could not find CREATE TABLE statement in migration file');
    process.exit(1);
  }

  const sqlToExecute = sqlLines.slice(sqlStart).join('\n');

  console.log('\nSTEPS TO APPLY THE DATABASE SCHEMA:\n');

  console.log('1. Open your Supabase project');
  console.log(`   ${supabaseUrl}\n`);

  console.log('2. Go to the SQL Editor');
  console.log('   Click on "SQL Editor" in the left sidebar\n');

  console.log('3. Create a new query');
  console.log('   Click "New query" or the "+" button\n');

  console.log('4. Copy and paste the SQL below into the editor:\n');

  console.log('─'.repeat(80));
  console.log(sqlToExecute);
  console.log(`${'─'.repeat(80)}\n`);

  console.log('5. Execute the query');
  console.log('   Click the "Run" button (Cmd/Ctrl + Enter)\n');

  console.log('6. Verify success');
  console.log('   You should see tables created successfully\n');

  console.log('7. Run the ingestion job');
  console.log('   pnpm -F event-ingest start\n');

  console.log(`${'='.repeat(80)}\n`);
}

applyMigration().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
