import json, subprocess

raw = subprocess.check_output(['sudo', 'docker', 'exec', 'hr-postgres', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', "SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data';"])
d = json.loads(raw)
act = d.get('activeShifts', {})
true_epoch = 1791320216000 # 2026-10-06 23:56:56 Egypt epoch

shift_data = {
    "date": "2026-10-06",
    "source": "biometric_device",
    "timeIn": "23:56",
    "shiftId": "shift_emp_1789242190413_1791320216000",
    "branchId": "branch_1789142992139",
    "isPaused": False,
    "isOnBreak": False,
    "updatedAt": true_epoch,
    "branchName": "منار الكومي-الحضره الجديده",
    "startEpoch": true_epoch,
    "verifyType": "FINGERPRINT",
    "punchSource": "biometric_device",
    "isCrossBranch": False,
    "isFloatingEmp": False,
    "actualBranchId": "branch_1789142992139",
    "isCoverageShift": False,
    "primaryBranchId": "branch_1789142992139",
    "actualBranchName": "منار الكومي-الحضره الجديده",
    "primaryBranchName": "منار الكومي-الحضره الجديده",
    "biometricDeviceName": "جهاز بصمة منار الكومي",
    "biometricDeviceSerial": "EUF7242701802"
}
act['emp_1789242190413'] = shift_data
act['115'] = shift_data
d['activeShifts'] = act

new_json = json.dumps(d, ensure_ascii=False)
with open('/tmp/state.json', 'w', encoding='utf-8') as f:
    f.write(new_json)

# Set in Redis
p = subprocess.Popen(['sudo', 'docker', 'exec', '-i', 'hr-redis', 'redis-cli', '-x', 'set', 'pharmacy-tracker-data'], stdin=open('/tmp/state.json', 'rb'))
p.communicate()

# Set in Postgres
subprocess.run(['sudo', 'docker', 'cp', '/tmp/state.json', 'hr-backend-server:/tmp/state.json'])
subprocess.run(['sudo', 'docker', 'exec', 'hr-backend-server', 'node', '-e', """
import('pg').then(async pg => {
  const fs = require('fs');
  const pool = new pg.Pool({ connectionString: 'postgres://postgres:postgres@hr-postgres:5432/postgres' });
  const data = JSON.parse(fs.readFileSync('/tmp/state.json', 'utf8'));
  await pool.query('UPDATE app_settings SET value_data = $1, updated_at = NOW() WHERE key_name = $2', [data, 'pharmacy-tracker-data']);
  console.log('✅ Postgres updated successfully');
  await pool.end();
});
"""])

print('✅ Employee 115 shift synchronized with true epoch.')
