import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  host: process.env.DB_HOST || '63.183.147.199',
  port: parseInt(process.env.DB_PORT || '5000', 10),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres_hr_2026_super_secure',
  ssl: false,
  connectionTimeoutMillis: 10000
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data'");
  if (res.rows.length > 0) {
    let state = res.rows[0].value_data;
    if (typeof state === 'string') state = JSON.parse(state);
    
    // Find employee 107
    const emp = (state.employees || []).find(e => String(e.code) === '107' || e.name?.includes('عبد الرحمن حسام'));
    console.log('Employee found:', {
      id: emp?.id,
      code: emp?.code,
      name: emp?.name,
      branchId: emp?.branchId,
      branchName: emp?.branchName,
      branchesDetails: emp?.branchesDetails,
      workHours: emp?.workHours,
      workHoursPerDay: emp?.workHoursPerDay,
      hourlyRate: emp?.hourlyRate,
      noMonthlySchedule: emp?.noMonthlySchedule
    });

    if (emp) {
      const empShifts = (state.shifts || []).filter(s => 
        String(s.employeeId) === String(emp.id) || String(s.employeeCode) === String(emp.code)
      );
      console.log('Total shifts for emp:', empShifts.length);
      empShifts.forEach(s => {
        console.log('Shift:', {
          id: s.id,
          date: s.date,
          timeIn: s.timeIn,
          timeOut: s.timeOut,
          branchId: s.branchId,
          branchName: s.branchName,
          hours: s.hours,
          workHours: s.workHours,
          netHours: s.netHours,
          actualWorkedHours: s.actualWorkedHours,
          regularHours: s.regularHours,
          overtimeHours: s.overtimeHours,
          scheduledStart: s.scheduledStart,
          scheduledEnd: s.scheduledEnd,
          breakHours: s.breakHours,
          notes: s.notes,
          isOfflineSynced: s.isOfflineSynced,
          syncedAt: s.syncedAt,
          _baseRawHours: s._baseRawHours,
          deviationStatus: s.deviationStatus
        });
      });

      // Also check roster for 2026-09 or 2026-10
      const rosters = (state.rosters || []).filter(r => 
        String(r.employeeId) === String(emp.id) || String(r.employeeCode) === String(emp.code)
      );
      console.log('Rosters found:', rosters.length);
      rosters.forEach(r => {
        console.log('Roster:', { id: r.id, month: r.month, branchId: r.branchId, schedule: r.schedule });
      });

      // Also check branches
      console.log('Branches in system:');
      (state.branches || []).forEach(b => {
        console.log('Branch:', { id: b.id, name: b.name });
      });
    }
  }
  await client.end();
}
run().catch(console.error);
