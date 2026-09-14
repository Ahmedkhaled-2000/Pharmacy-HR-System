import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function analyzePayload() {
  await client.connect();
  const res = await client.query("SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data' LIMIT 1");
  const data = res.rows[0].value_data;
  console.log('Top-level keys and their approximate sizes:');
  const sizes = [];
  for (const key of Object.keys(data)) {
    const valStr = JSON.stringify(data[key]);
    sizes.push({
      key,
      sizeBytes: valStr ? valStr.length : 0,
      itemCount: Array.isArray(data[key]) ? data[key].length : (typeof data[key] === 'object' && data[key] !== null ? Object.keys(data[key]).length : 1)
    });
  }
  sizes.sort((a, b) => b.sizeBytes - a.sizeBytes);
  sizes.forEach(s => {
    console.log(`- ${s.key}: ${(s.sizeBytes / 1024).toFixed(1)} KB (count: ${s.itemCount})`);
  });

  // Let's inspect the largest items inside the biggest keys
  const topKey = sizes[0].key;
  console.log('\nTop key details for:', topKey);
  if (Array.isArray(data[topKey]) && data[topKey].length > 0) {
    const firstItem = data[topKey][0];
    for (const prop of Object.keys(firstItem)) {
      const propLen = JSON.stringify(firstItem[prop])?.length || 0;
      if (propLen > 500) {
        console.log(`  field '${prop}' in first item has size: ${(propLen / 1024).toFixed(1)} KB`);
      }
    }
  }

  // Let's also check second top key
  if (sizes.length > 1) {
    const secondKey = sizes[1].key;
    console.log('\nSecond key details for:', secondKey);
    if (Array.isArray(data[secondKey]) && data[secondKey].length > 0) {
      const firstItem = data[secondKey][0];
      for (const prop of Object.keys(firstItem)) {
        const propLen = JSON.stringify(firstItem[prop])?.length || 0;
        if (propLen > 500) {
          console.log(`  field '${prop}' in item has size: ${(propLen / 1024).toFixed(1)} KB`);
        }
      }
    }
  }

  await client.end();
}
analyzePayload().catch(console.error);
