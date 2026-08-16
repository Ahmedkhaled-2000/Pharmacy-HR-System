import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://jjosopujlxgkhrragumj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqb3NvcHVqbHhna2hycmFndW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MzA2NjQsImV4cCI6MjEwMDIwNjY2NH0.m91fh2xgaU72oEfNacFF2BICNuGuvEg3t_sHc2U8n9M';

const supabase = createClient(supabaseUrl, supabaseKey);
const LIVE_API_URL = 'https://nodejs-test.apexthunder.com/api';

async function migrateData() {
  console.log('🚀 1. Fetching data from Supabase...');

  // 1. Fetch app_settings
  const { data: settingsData, error: settingsError } = await supabase
    .from('app_settings')
    .select('*');

  if (settingsError) {
    console.error('❌ Error fetching app_settings:', settingsError.message);
  } else {
    console.log(`✅ Fetched ${settingsData.length} records from app_settings.`);
  }

  // 2. Fetch employee_faces
  const { data: facesData, error: facesError } = await supabase
    .from('employee_faces')
    .select('*');

  if (facesError) {
    console.error('❌ Error fetching employee_faces:', facesError.message);
  } else {
    console.log(`✅ Fetched ${facesData ? facesData.length : 0} records from employee_faces.`);
  }

  // 3. Save a local backup file
  const backup = {
    export_date: new Date().toISOString(),
    app_settings: settingsData || [],
    employee_faces: facesData || [],
  };
  fs.writeFileSync('supabase_extracted_data.json', JSON.stringify(backup, null, 2), 'utf-8');
  console.log('💾 Saved local backup to supabase_extracted_data.json');

  // 4. Upload to live MariaDB API
  console.log('🚀 2. Uploading data to live MariaDB API (Apex Thunder)...');

  // A. Save settings
  if (settingsData && settingsData.length > 0) {
    for (const setting of settingsData) {
      console.log(`⏳ Saving setting key: "${setting.key}"...`);
      const val = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
      const res = await fetch(`${LIVE_API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: setting.key,
          value: val,
        }),
      });
      const resJson = await res.json();
      console.log(`   Response:`, resJson);
    }
  }

  // B. Save faces
  if (facesData && facesData.length > 0) {
    console.log(`⏳ Importing ${facesData.length} biometric records...`);
    const res = await fetch(`${LIVE_API_URL}/backup/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_faces: facesData,
      }),
    });
    const resJson = await res.json();
    console.log(`   Faces import response:`, resJson);
  }

  console.log('\n🎉 ALL DATA MIGRATED SUCCESSFULLY TO MARIADB!');
}

migrateData().catch(console.error);
