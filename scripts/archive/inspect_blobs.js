import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function inspectEmployees() {
  await client.connect();
  const res = await client.query("SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data' LIMIT 1");
  const data = res.rows[0].value_data;
  
  const employees = data.employees || [];
  console.log(`Inspecting ${employees.length} employees:`);
  let totalDocSize = 0;
  let totalFaceSize = 0;
  let totalPhotoSize = 0;

  employees.forEach((emp, i) => {
    const docSize = JSON.stringify(emp.documents || [])?.length || 0;
    const faceSize = JSON.stringify(emp.face_descriptor || emp.descriptor || [])?.length || 0;
    const photoSize = (emp.photoUrl || '')?.length || 0;
    totalDocSize += docSize;
    totalFaceSize += faceSize;
    totalPhotoSize += photoSize;
    if (docSize > 50000 || photoSize > 50000 || faceSize > 10000) {
      console.log(`Emp [${emp.name || emp.code}]: docs=${(docSize/1024).toFixed(1)}KB, photo=${(photoSize/1024).toFixed(1)}KB, face=${(faceSize/1024).toFixed(1)}KB`);
    }
  });

  console.log(`\nTotals for employees:`);
  console.log(`Total documents size: ${(totalDocSize / 1024).toFixed(1)} KB`);
  console.log(`Total photoUrl size: ${(totalPhotoSize / 1024).toFixed(1)} KB`);
  console.log(`Total face descriptor size: ${(totalFaceSize / 1024).toFixed(1)} KB`);

  const apps = data.recruitmentApplications || [];
  console.log(`\nInspecting ${apps.length} recruitment applications:`);
  let totalAppDocs = 0;
  apps.forEach(app => {
    const cvSize = (app.cvUrl || '')?.length || 0;
    const natIdSize = (app.nationalIdPhotoUrl || '')?.length || 0;
    const gradSize = (app.graduationCertUrl || '')?.length || 0;
    const licSize = (app.licensePhotoUrl || '')?.length || 0;
    const photoSize = (app.photoUrl || '')?.length || 0;
    const sum = cvSize + natIdSize + gradSize + licSize + photoSize;
    totalAppDocs += sum;
    if (sum > 50000) {
      console.log(`App [${app.name}]: cv=${(cvSize/1024).toFixed(1)}KB, natId=${(natIdSize/1024).toFixed(1)}KB, grad=${(gradSize/1024).toFixed(1)}KB, lic=${(licSize/1024).toFixed(1)}KB`);
    }
  });
  console.log(`Total recruitment attached images: ${(totalAppDocs / 1024).toFixed(1)} KB`);

  await client.end();
}
inspectEmployees().catch(console.error);
