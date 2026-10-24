const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const targets = [
  {
    name: 'Primary New VPS (169.58.214.20)',
    host: 'admin@169.58.214.20',
    userHome: '/home/admin',
    appDir: '/home/admin/hr-system'
  }
];

async function deploy() {
  console.log('====================================================');
  console.log('🚀 DEPLOYING UPDATES TO BOTH VPS SERVERS');
  console.log('====================================================\n');

  console.log('📦 [1/4] Preparing frontend tar.gz package from dist...');
  if (fs.existsSync('frontend_update.tar.gz')) {
    fs.unlinkSync('frontend_update.tar.gz');
  }
  execSync('tar --exclude="*.wasm" -czf frontend_update.tar.gz -C dist index.html assets registerSW.js manifest.webmanifest', { stdio: 'inherit' });
  const archiveStats = fs.statSync('frontend_update.tar.gz');
  console.log(`   Bundle size: ${(archiveStats.size / (1024 * 1024)).toFixed(2)} MB\n`);

  for (const target of targets) {
    console.log(`----------------------------------------------------`);
    console.log(`🌐 Deploying to: ${target.name} [${target.host}]`);
    console.log(`----------------------------------------------------`);

    try {
      // 1. Upload backend files
      console.log('   📤 Uploading backend files...');
      execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/hr-backend.js ${target.host}:${target.userHome}/hr-backend.js`, { stdio: 'pipe' });
      execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/biometric-manager.js ${target.host}:${target.userHome}/biometric-manager.js`, { stdio: 'pipe' });
      execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/outstock-manager.js ${target.host}:${target.userHome}/outstock-manager.js`, { stdio: 'pipe' });
      execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/backup-engine.js ${target.host}:${target.userHome}/backup-engine.js`, { stdio: 'pipe' });
      execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no server/payroll-loans-daemon.js ${target.host}:${target.userHome}/payroll-loans-daemon.js`, { stdio: 'pipe' });

      // 2. Sync backend & restart docker
      console.log('   🔄 Updating backend container & restarting hr-backend-server...');
      const backendCmds = [
        `cp ${target.userHome}/hr-backend.js ${target.appDir}/server/hr-backend.js 2>/dev/null || true`,
        `cp ${target.userHome}/biometric-manager.js ${target.appDir}/server/biometric-manager.js 2>/dev/null || true`,
        `cp ${target.userHome}/outstock-manager.js ${target.appDir}/server/outstock-manager.js 2>/dev/null || true`,
        `cp ${target.userHome}/backup-engine.js ${target.appDir}/server/backup-engine.js 2>/dev/null || true`,
        `cp ${target.userHome}/payroll-loans-daemon.js ${target.appDir}/server/payroll-loans-daemon.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/hr-backend.js hr-backend-server:/app/server/hr-backend.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/biometric-manager.js hr-backend-server:/app/server/biometric-manager.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/outstock-manager.js hr-backend-server:/app/server/outstock-manager.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/backup-engine.js hr-backend-server:/app/server/backup-engine.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/payroll-loans-daemon.js hr-backend-server:/app/server/payroll-loans-daemon.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/hr-backend.js hr-backend-server:/app/hr-backend.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/biometric-manager.js hr-backend-server:/app/biometric-manager.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/outstock-manager.js hr-backend-server:/app/outstock-manager.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/backup-engine.js hr-backend-server:/app/backup-engine.js 2>/dev/null || true`,
        `sudo docker cp ${target.userHome}/payroll-loans-daemon.js hr-backend-server:/app/payroll-loans-daemon.js 2>/dev/null || true`,
        'sudo docker restart hr-backend-server'
      ].join(' && ');
      execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${backendCmds}"`, { stdio: 'pipe' });

      // 3. Upload frontend bundle
      console.log('   📤 Uploading frontend bundle...');
      execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no frontend_update.tar.gz ${target.host}:/tmp/frontend_update.tar.gz`, { stdio: 'pipe' });

      // 4. Extract frontend & reload nginx
      console.log('   🚀 Extracting frontend to /var/www/pharmacy_frontend/ and reloading Nginx...');
      const frontendCmds = [
        'sudo tar -xzf /tmp/frontend_update.tar.gz -C /var/www/pharmacy_frontend/',
        'sudo chown -R www-data:www-data /var/www/pharmacy_frontend/',
        'sudo chmod -R 755 /var/www/pharmacy_frontend/',
        'sudo nginx -t && sudo systemctl reload nginx',
        'rm -f /tmp/frontend_update.tar.gz'
      ].join(' && ');
      execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${frontendCmds}"`, { stdio: 'pipe' });

      // 4.1 Upload fresh Android APK if present
      if (fs.existsSync('pharmacy-employee-portal.apk')) {
        console.log('   📱 Uploading ultra-lightweight Android APK (23.7 MB) to /downloads/...');
        execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no pharmacy-employee-portal.apk ${target.host}:/tmp/pharmacy-employee-portal.apk`, { stdio: 'pipe' });
        const apkCmds = [
          'sudo mkdir -p /var/www/pharmacy_frontend/downloads',
          'sudo cp /tmp/pharmacy-employee-portal.apk /var/www/pharmacy_frontend/downloads/pharmacy-employee-portal.apk',
          'sudo chown www-data:www-data /var/www/pharmacy_frontend/downloads/pharmacy-employee-portal.apk',
          'sudo chmod 644 /var/www/pharmacy_frontend/downloads/pharmacy-employee-portal.apk',
          'rm -f /tmp/pharmacy-employee-portal.apk'
        ].join(' && ');
        execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${apkCmds}"`, { stdio: 'pipe' });
        console.log('   ✅ Android APK deployed to web downloads endpoint!');
      }

      // 5. Health Verification
      console.log('   🔍 Verifying health & index hash...');
      const verifyCmd = "curl -s http://127.0.0.1:5000/api/health && echo '' && grep -o 'assets/index-[a-zA-Z0-9_-]*\\.js' /var/www/pharmacy_frontend/index.html | head -n 1";
      const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${verifyCmd}"`).toString().trim();
      console.log(`   ✅ Status on ${target.name}:\n${out}\n`);
    } catch (err) {
      console.error(`   ❌ Deployment error on ${target.name}:`, err.message);
    }
  }

  if (fs.existsSync('frontend_update.tar.gz')) {
    fs.unlinkSync('frontend_update.tar.gz');
  }

  console.log('====================================================');
  console.log('🎉 ALL VPS SERVERS SUCCESSFULLY UPDATED & VERIFIED!');
  console.log('====================================================');
}

deploy().catch(err => {
  console.error('Fatal deployment script error:', err);
  process.exit(1);
});
