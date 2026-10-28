#!/usr/bin/env node

/**
 * Biometric Devices Health Watchdog
 * Checks devices that haven't sent a heartbeat for >= 15 minutes.
 */

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres_hr_2026_super_secure',
  ssl: false
});

async function runHealthCheck() {
  try {
    await client.connect();
    const query = `
      SELECT 
        id, 
        device_name, 
        serial_number, 
        ip_address, 
        status, 
        last_heartbeat,
        ROUND(EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) / 60) AS minutes_offline
      FROM biometric_devices
      WHERE last_heartbeat < NOW() - INTERVAL '15 minutes'
         OR last_heartbeat IS NULL;
    `;
    const res = await client.query(query);

    if (res.rows.length === 0) {
      console.log(`[${new Date().toISOString()}] ✅ All biometric devices are ONLINE & HEALTHY.`);
    } else {
      console.warn(`[${new Date().toISOString()}] ⚠️ ALERT: ${res.rows.length} device(s) offline > 15 minutes:`);
      for (const dev of res.rows) {
        console.warn(` - Device: "${dev.device_name}" (SN: ${dev.serial_number}) at ${dev.ip_address || 'unknown'} has been offline for ${dev.minutes_offline || 'N/A'} mins!`);
      }
    }
  } catch (err) {
    console.error('Error during biometric health watchdog check:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

runHealthCheck();
