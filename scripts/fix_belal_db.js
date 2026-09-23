import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

async function run() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres?sslmode=disable'
  });
  const redis = new Redis({
    host: 'redis',
    port: 6379,
    lazyConnect: true
  });

  try {
    await redis.connect();
    console.log('Connected to PG & Redis');

    const res = await pool.query("SELECT value_data, version FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data'");
    if (res.rows.length === 0) {
      console.error('pharmacy-tracker-data not found!');
      return;
    }

    const state = res.rows[0].value_data;
    const oldVersion = parseInt(res.rows[0].version, 10) || 1;
    const newVersion = oldVersion + 1;
    const now = new Date().toISOString();

    console.log('Current _endedShiftEmpIds:', state._endedShiftEmpIds);
    console.log('Current activeShifts keys:', Object.keys(state.activeShifts || {}));

    // 1. Remove Belal from _endedShiftEmpIds
    if (Array.isArray(state._endedShiftEmpIds)) {
      state._endedShiftEmpIds = state._endedShiftEmpIds.filter(id => {
        const s = String(id);
        return s !== 'emp_1789240708342' && s !== '113';
      });
    }

    // 2. Find Belal's open shift from today
    const belalOpenShift = (state.shifts || []).find(s =>
      (s.employeeId === 'emp_1789240708342' || s.employeeCode === '113') &&
      s.date === '2026-09-23' &&
      (!s.timeOut || s.timeOut === '' || s.isLiveActive)
    );

    if (belalOpenShift) {
      console.log('Found open shift for Belal:', belalOpenShift.id, belalOpenShift.timeIn);
      const activeObj = {
        shiftId: belalOpenShift.id,
        branchId: belalOpenShift.branchId || 'branch_1789240173448',
        branchName: belalOpenShift.branchName || 'عماد القيم - المخزن',
        date: belalOpenShift.date || '2026-09-23',
        timeIn: belalOpenShift.timeIn || '13:01',
        startEpoch: belalOpenShift.createdAt ? new Date(belalOpenShift.createdAt).getTime() : 1790157682067,
        isPaused: false,
        isOnBreak: false,
        breakStartTime: null,
        pauseStartEpoch: null,
        accumulatedPauseMs: 0,
        updatedAt: Date.now()
      };
      if (!state.activeShifts) state.activeShifts = {};
      state.activeShifts['emp_1789240708342'] = activeObj;
      state.activeShifts['113'] = activeObj;
    } else {
      console.log('No open shift found in shifts array for Belal today');
    }

    const jsonString = JSON.stringify(state);

    // Save to PostgreSQL
    await pool.query(
      "UPDATE public.app_settings SET value_data = $1::jsonb, version = $2, updated_at = $3 WHERE key_name = 'pharmacy-tracker-data'",
      [jsonString, newVersion, now]
    );
    console.log('PostgreSQL updated! New version:', newVersion);

    // Save to Redis
    await redis.set('hr:settings:pharmacy-tracker-data', jsonString, 'EX', 86400 * 7);
    await redis.set('hr:version:pharmacy-tracker-data', JSON.stringify({ version: newVersion, updated_at: now }));
    console.log('Redis updated!');

    console.log('New _endedShiftEmpIds:', state._endedShiftEmpIds);
    console.log('New activeShifts keys:', Object.keys(state.activeShifts || {}));
  } catch (e) {
    console.error('Error running fix script:', e);
  } finally {
    await pool.end();
    redis.disconnect();
  }
}

run();
