import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const host = process.env.DB_HOST || 'aws-0-eu-west-1.pooler.supabase.com';
const port = parseInt(process.env.DB_PORT || '6543', 10);
const user = process.env.DB_USER || 'postgres.jjosopujlxgkhrragumj';
const password = process.env.DB_PASS || 'cnzrd6YvE0N8tMOa';
const database = process.env.DB_NAME || 'postgres';

const client = new Client({
  host,
  port,
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false }
});

async function inspect() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL at', host);

    // 1. Total database size
    const dbSizeRes = await client.query(`
      SELECT datname as db_name, pg_size_pretty(pg_database_size(datname)) as pretty_size, pg_database_size(datname) as raw_size
      FROM pg_database WHERE datname = current_database();
    `);
    console.log('\n=== Total Database Size ===');
    console.table(dbSizeRes.rows);

    // 2. Size per schema
    const schemaSizeRes = await client.query(`
      SELECT 
        schemaname,
        pg_size_pretty(sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) as total_size,
        sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) as raw_size
      FROM pg_tables
      GROUP BY schemaname
      ORDER BY raw_size DESC;
    `);
    console.log('\n=== Size per Schema ===');
    console.table(schemaSizeRes.rows);

    // 3. Top 25 largest relations/tables (including TOAST and indexes)
    const tableSizeRes = await client.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) as total_size,
        pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) as table_size,
        pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) - pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) as index_toast_size,
        pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) as raw_size
      FROM pg_tables
      ORDER BY raw_size DESC
      LIMIT 25;
    `);
    console.log('\n=== Top 25 Tables by Total Size ===');
    console.table(tableSizeRes.rows);

    // 4. Check replication slots (often cause WAL to balloon to gigabytes!)
    try {
      const repSlots = await client.query(`
        SELECT slot_name, plugin, slot_type, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as wal_retained
        FROM pg_replication_slots;
      `);
      console.log('\n=== Replication Slots & Retained WAL ===');
      console.table(repSlots.rows);
    } catch (e) {
      console.log('Replication slots query error:', e.message);
    }

  } catch (err) {
    console.error('Inspection failed:', err);
  } finally {
    await client.end();
  }
}

inspect();
