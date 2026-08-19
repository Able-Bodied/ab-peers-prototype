/**
 * Check and Configure Data Feeds
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase credentials not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFeeds() {
  console.log('Checking Data Feeds');
  console.log('='.repeat(70));

  // Check existing feeds
  const { data: feeds, error } = await supabase
    .from('data_feeds')
    .select('id, name, feed_url, is_active, last_fetched_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`Error querying feeds: ${error.message}`);
    process.exit(1);
  }

  if (!feeds || feeds.length === 0) {
    console.log('\n✗ No data feeds configured\n');
    console.log('Inserting NorCal SCI Events feed...\n');

    const { data: newFeed, error: insertError } = await supabase
      .from('data_feeds')
      .insert([
        {
          name: 'NorCal CI',
          feed_url: 'https://norcalsci.org/events',
          feed_type: 'squarespace',
          is_active: true,
        },
      ])
      .select();

    if (insertError) {
      console.error(`Error inserting feed: ${insertError.message}`);
      process.exit(1);
    }

    console.log('✓ Feed inserted successfully');
    console.log(`  ID: ${newFeed[0].id}`);
    console.log(`  Name: ${newFeed[0].name}`);
    console.log(`  URL: ${newFeed[0].feed_url}`);
    console.log(`  Type: ${newFeed[0].feed_type}`);
    return newFeed[0];
  }

  console.log(`\n✓ Found ${feeds.length} data feed(s):\n`);
  feeds.forEach((feed, i) => {
    console.log(`  ${i + 1}. ${feed.name}`);
    console.log(`     ID: ${feed.id}`);
    console.log(`     URL: ${feed.feed_url}`);
    console.log(`     Active: ${feed.is_active ? 'yes' : 'no'}`);
    console.log(`     Last fetched: ${feed.last_fetched_at || 'never'}`);
    console.log('');
  });

  return feeds[0];
}

await checkFeeds();
