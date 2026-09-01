/**
 * scripts/reset_supabase.js
 * تصفير ومسح قاعدة بيانات Supabase PostgreSQL وإلغاء كافة الجلسات النشطة
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const host = process.env.DB_HOST || 'aws-0-eu-west-1.pooler.supabase.com';
const port = parseInt(process.env.DB_PORT || '6543', 10);
const user = process.env.DB_USER || 'postgres.jjosopujlxgkhrragumj';
const password = process.env.DB_PASS || 'cnzrd6YvE0N8tMOa';
const database = process.env.DB_NAME || 'postgres';

console.log(`Connecting to Supabase PostgreSQL Pooler at ${host}:${port}...`);

const client = new Client({
  host,
  port,
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false }
});

async function runReset() {
  try {
    await client.connect();
    console.log('✅ Connected to Supabase PostgreSQL successfully.');

    // 1. تصفير جداول الأرشيف والعمليات
    const tables = [
      'public.archive_invoice_items',
      'public.archive_invoices',
      'public.archive_import_logs',
      'public.archive_column_mappings',
      'public.archive_employees',
      'public.archive_suppliers',
      'public.employee_faces',
      'public.app_settings_backups',
      'public.sync_logs'
    ];

    for (const tbl of tables) {
      try {
        await client.query(`TRUNCATE TABLE ${tbl} RESTART IDENTITY CASCADE;`);
        console.log(`🧹 Truncated table: ${tbl}`);
      } catch (err) {
        console.warn(`Table ${tbl} truncate notice: ${err.message}`);
      }
    }

    // 2. تجهيز الحالة الابتدائية النظيفة
    const cleanState = {
      orgSettings: {
        orgName: 'منظومة إدارة الموارد البشرية والرواتب',
        logoUrl: '',
        ownerUsername: 'owner',
        ownerPassword: 'owner123',
        adminUsername: 'admin',
        adminPassword: '123',
        payrollPayoutStartDay: 26,
        payrollPayoutEndDay: 25,
        payrollPayoutDay: 25,
        sessionInvalidationEpoch: Date.now(), // إلغاء كافة الجلسات السابقة
        ownerModificationLocks: {
          lockEditSalary: false,
          lockEditAllowances: false,
          lockApproveLoans: false,
          lockDirectBonusDeduction: false,
          lockEditCutoffRules: false,
          lockDeleteEmployee: true,
          lockTerminateEmployee: false,
          lockSuspendBiometric: false,
          lockDeleteShifts: true,
          lockEditPastShifts: false,
          lockManualShiftEntry: false,
          lockManageBranches: false,
          lockManageJobs: false,
          lockEditSystemPermissions: false,
          lockApproveRequests: false,
          lockApproveLeaves: false,
          lockApprovePermissions: false,
          lockApproveDisciplinaryPenalties: false,
          lockApproveShiftSwaps: false,
          lockApproveRosters: false,
          lockApproveManualPunches: false,
          lockApproveResignations: false,
          lockApproveBonuses: false,
          lockApproveComplaints: false,
          lockRejectRequests: false,
          lockDeleteRequests: false,
          lockEditEvaluations: false,
          lockDeletePenalties: false,
          lockFactoryReset: true,
          lockRestoreBackup: true,
          lockChangeAdminCredentials: true,
          lockEditOrgSettings: false
        },
        gmailConfig: {
          enabled: true,
          userEmail: '',
          appPassword: '',
          targetAdminEmail: '',
          serviceUrl: 'https://script.google.com/macros/s/AKfycbzAHjkD2l2MvE5G6XLLj3jNM3k3B5e4SJ_kXdJtD2L-rUVUnh9BWlDSC0wCIqAk5syO/exec',
          sendOnRequest: true,
          sendOnDecision: true,
          sendOnPenalty: true,
          sendDailyDigest: true
        }
      },
      jobs: [
        { id: 'job_pharmacist', title: 'صيدلي', type: 'medical', isManagement: false },
        { id: 'job_pharmacy_manager', title: 'مدير صيدلية', type: 'medical', isManagement: true },
        { id: 'job_assistant_pharmacist', title: 'مساعد صيدلي', type: 'medical', isManagement: false },
        { id: 'job_cashier', title: 'كاشير', type: 'administrative', isManagement: false },
        { id: 'job_inventory_manager', title: 'أمين مخزن', type: 'administrative', isManagement: false },
        { id: 'job_delivery', title: 'مسؤول توصيل (طيار)', type: 'operational', isManagement: false },
        { id: 'job_general_manager', title: 'المدير العام / المالك', type: 'management', isManagement: true },
        { id: 'job_hr_manager', title: 'مدير الموارد البشرية', type: 'management', isManagement: true },
        { id: 'job_accountant', title: 'محاسب مالي', type: 'administrative', isManagement: false },
        { id: 'job_worker', title: 'خدمات معاونة / عامل', type: 'operational', isManagement: false }
      ],
      branches: [],
      employees: [],
      shifts: [],
      requests: [],
      loans: [],
      logs: [],
      adjustments: [],
      rosters: [],
      shiftSwaps: [],
      leaveRequests: [],
      resignationRequests: [],
      evaluations: [],
      recruitmentApplications: [],
      bylaws: {
        gracePeriodMinutes: 15,
        resetPeriodDays: 30,
        latePenalties: [
          { occurrence: 1, action: 'تنبيه', deductionFraction: 0 },
          { occurrence: 2, action: 'إنذار كتابي', deductionFraction: 0 },
          { occurrence: 3, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
          { occurrence: 4, action: 'خصم ½ يوم', deductionFraction: 0.5 },
          { occurrence: 5, action: 'خصم يوم', deductionFraction: 1.0 }
        ],
        earlyExitPenalties: [
          { occurrence: 1, action: 'إنذار', deductionFraction: 0 },
          { occurrence: 2, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
          { occurrence: 3, action: 'خصم ½ يوم', deductionFraction: 0.5 },
          { occurrence: 4, action: 'خصم يوم', deductionFraction: 1.0 }
        ],
        deductionOptions: [
          { label: 'تنبيه / إنذار', value: 0 },
          { label: 'خصم ¼ يوم', value: 0.25 },
          { label: 'خصم ½ يوم', value: 0.5 },
          { label: 'خصم يوم كامل', value: 1.0 },
          { label: 'خصم يومين', value: 2.0 },
          { label: 'خصم ثلاث أيام', value: 3.0 }
        ]
      },
      approvalRules: [
        { id: 'rule_leave_over_3_days', requestType: 'long_leave', name: 'طلبات الإجازة أكثر من ثلاث أيام في الشهر', reqBranch: false, reqAdmin: true, requiresBranchManager: false, requiresSuperAdmin: true },
        { id: 'rule_salary_loan_high', requestType: 'loan', name: 'طلبات السلف المالية التي تتجاوز 50% من الراتب', reqBranch: false, reqAdmin: true, requiresBranchManager: false, requiresSuperAdmin: true },
        { id: 'rule_resignation_notice', requestType: 'resignation', name: 'طلبات الاستقالة وفسخ التعاقد', reqBranch: true, reqAdmin: true, requiresBranchManager: true, requiresSuperAdmin: true }
      ]
    };

    // 3. تحديث جدول app_settings
    await client.query(`
      INSERT INTO public.app_settings (key_name, value_data, version, updated_at)
      VALUES ('pharmacy-tracker-data', $1::jsonb, 1000, NOW())
      ON CONFLICT (key_name) DO UPDATE 
      SET value_data = EXCLUDED.value_data,
          version = public.app_settings.version + 1000,
          updated_at = NOW();
    `, [JSON.stringify(cleanState)]);

    console.log('✅ app_settings reset to clean state with elevated version.');

    // 4. حماية الكوتة وإلغاء بث الجداول الكبيرة عبر Supabase Realtime
    await client.query(`
      DO $$
      BEGIN
          IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
              BEGIN
                  ALTER PUBLICATION supabase_realtime DROP TABLE public.app_settings;
              EXCEPTION WHEN OTHERS THEN NULL;
              END;
              BEGIN
                  ALTER PUBLICATION supabase_realtime DROP TABLE public.app_settings_backups;
              EXCEPTION WHEN OTHERS THEN NULL;
              END;
          END IF;
      END $$;
    `);

    console.log('✅ Realtime Publication quota protection verified.');
    console.log('🎉 DATABASE RESET AND ALL SESSIONS INVALIDATED SUCCESSFULLY!');

  } catch (err) {
    console.error('❌ Reset failed:', err);
  } finally {
    await client.end();
  }
}

runReset();
