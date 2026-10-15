const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

async function check() {
  try {
    const cached = await redis.get('hr:settings:pharmacy-tracker-data');
    if (!cached) {
      console.log('Redis key hr:settings:pharmacy-tracker-data does NOT exist');
      process.exit(0);
    }
    const data = JSON.parse(cached);
    const shifts = (data.shifts || []).filter(s => s.id === 'shift_bio_1791377813630_6arm');
    console.log('Redis Shift Count:', shifts.length);
    console.log('Redis Shift Detail:', JSON.stringify(shifts[0], null, 2));

    const activeShifts = data.activeShifts || {};
    console.log('Active shifts for Marwan:');
    if (Array.isArray(activeShifts)) {
      console.log(activeShifts.filter(s => s.employeeCode === '1146' || s.employeeId === 'emp_1789320128545_iz83s'));
    } else {
      console.log('by ID:', activeShifts['emp_1789320128545_iz83s']);
      console.log('by Code:', activeShifts['1146']);
    }

    const requests = (data.requests || []).filter(r => r.id === 'REQ-BIO-1791391859083');
    console.log('Redis Request REQ-BIO-1791391859083:', JSON.stringify(requests[0], null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
