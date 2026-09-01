<?php
/**
 * api/reset_db.php
 * سكريبت التصفير الشامل لقاعدة بيانات Supabase PostgreSQL وقفل كافة الجلسات النشطة
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// حماية السكريبت برمز أمان
$secret = $_GET['secret'] ?? $_POST['secret'] ?? '';
$isCli = (php_sapi_name() === 'cli');

if (!$isCli && $secret !== 'reset_pharmacy_2026') {
    jsonResponse([
        'success' => false,
        'error' => 'Access denied. Provide valid secret parameter ?secret=reset_pharmacy_2026'
    ], 403);
}

try {
    $db = Database::getConnection();

    // 1. تصفير جداول الأرشيف والعمليات
    $tablesToTruncate = [
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

    foreach ($tablesToTruncate as $tbl) {
        try {
            $db->exec("TRUNCATE TABLE {$tbl} RESTART IDENTITY CASCADE;");
        } catch (Throwable $e) {
            // في حال عدم وجود الجدول نتجاوزه
        }
    }

    // 2. تجهيز الحالة الابتدائية النظيفة (Zero Employees, Zero Branches, Clean State)
    $cleanState = [
        'orgSettings' => [
            'orgName' => 'منظومة إدارة الموارد البشرية والرواتب',
            'logoUrl' => '',
            'ownerUsername' => 'owner',
            'ownerPassword' => 'owner123',
            'adminUsername' => 'admin',
            'adminPassword' => '123',
            'payrollPayoutStartDay' => 26,
            'payrollPayoutEndDay' => 25,
            'payrollPayoutDay' => 25,
            'sessionInvalidationEpoch' => time(), // لإلغاء وإسقاط كافة الجلسات السابقة فوراً
            'ownerModificationLocks' => [
                'lockEditSalary' => false,
                'lockEditAllowances' => false,
                'lockApproveLoans' => false,
                'lockDirectBonusDeduction' => false,
                'lockEditCutoffRules' => false,
                'lockDeleteEmployee' => true,
                'lockTerminateEmployee' => false,
                'lockSuspendBiometric' => false,
                'lockDeleteShifts' => true,
                'lockEditPastShifts' => false,
                'lockManualShiftEntry' => false,
                'lockManageBranches' => false,
                'lockManageJobs' => false,
                'lockEditSystemPermissions' => false,
                'lockApproveRequests' => false,
                'lockApproveLeaves' => false,
                'lockApprovePermissions' => false,
                'lockApproveDisciplinaryPenalties' => false,
                'lockApproveShiftSwaps' => false,
                'lockApproveRosters' => false,
                'lockApproveManualPunches' => false,
                'lockApproveResignations' => false,
                'lockApproveBonuses' => false,
                'lockApproveComplaints' => false,
                'lockRejectRequests' => false,
                'lockDeleteRequests' => false,
                'lockEditEvaluations' => false,
                'lockDeletePenalties' => false,
                'lockFactoryReset' => true,
                'lockRestoreBackup' => true,
                'lockChangeAdminCredentials' => true,
                'lockEditOrgSettings' => false
            ],
            'gmailConfig' => [
                'enabled' => true,
                'userEmail' => '',
                'appPassword' => '',
                'targetAdminEmail' => '',
                'serviceUrl' => 'https://script.google.com/macros/s/AKfycbzAHjkD2l2MvE5G6XLLj3jNM3k3B5e4SJ_kXdJtD2L-rUVUnh9BWlDSC0wCIqAk5syO/exec',
                'sendOnRequest' => true,
                'sendOnDecision' => true,
                'sendOnPenalty' => true,
                'sendDailyDigest' => true
            ]
        ],
        'jobs' => [
            ['id' => 'job_pharmacist', 'title' => 'صيدلي', 'type' => 'medical', 'isManagement' => false],
            ['id' => 'job_pharmacy_manager', 'title' => 'مدير صيدلية', 'type' => 'medical', 'isManagement' => true],
            ['id' => 'job_assistant_pharmacist', 'title' => 'مساعد صيدلي', 'type' => 'medical', 'isManagement' => false],
            ['id' => 'job_cashier', 'title' => 'كاشير', 'type' => 'administrative', 'isManagement' => false],
            ['id' => 'job_inventory_manager', 'title' => 'أمين مخزن', 'type' => 'administrative', 'isManagement' => false],
            ['id' => 'job_delivery', 'title' => 'مسؤول توصيل (طيار)', 'type' => 'operational', 'isManagement' => false],
            ['id' => 'job_general_manager', 'title' => 'المدير العام / المالك', 'type' => 'management', 'isManagement' => true],
            ['id' => 'job_hr_manager', 'title' => 'مدير الموارد البشرية', 'type' => 'management', 'isManagement' => true],
            ['id' => 'job_accountant', 'title' => 'محاسب مالي', 'type' => 'administrative', 'isManagement' => false],
            ['id' => 'job_worker', 'title' => 'خدمات معاونة / عامل', 'type' => 'operational', 'isManagement' => false]
        ],
        'branches' => [],
        'employees' => [],
        'shifts' => [],
        'requests' => [],
        'loans' => [],
        'logs' => [],
        'adjustments' => [],
        'rosters' => [],
        'shiftSwaps' => [],
        'leaveRequests' => [],
        'resignationRequests' => [],
        'evaluations' => [],
        'recruitmentApplications' => [],
        'bylaws' => [
            'gracePeriodMinutes' => 15,
            'resetPeriodDays' => 30,
            'latePenalties' => [
                ['occurrence' => 1, 'action' => 'تنبيه', 'deductionFraction' => 0],
                ['occurrence' => 2, 'action' => 'إنذار كتابي', 'deductionFraction' => 0],
                ['occurrence' => 3, 'action' => 'خصم ¼ يوم', 'deductionFraction' => 0.25],
                ['occurrence' => 4, 'action' => 'خصم ½ يوم', 'deductionFraction' => 0.5],
                ['occurrence' => 5, 'action' => 'خصم يوم', 'deductionFraction' => 1.0]
            ],
            'earlyExitPenalties' => [
                ['occurrence' => 1, 'action' => 'إنذار', 'deductionFraction' => 0],
                ['occurrence' => 2, 'action' => 'خصم ¼ يوم', 'deductionFraction' => 0.25],
                ['occurrence' => 3, 'action' => 'خصم ½ يوم', 'deductionFraction' => 0.5],
                ['occurrence' => 4, 'action' => 'خصم يوم', 'deductionFraction' => 1.0]
            ],
            'deductionOptions' => [
                ['label' => 'تنبيه / إنذار', 'value' => 0],
                ['label' => 'خصم ¼ يوم', 'value' => 0.25],
                ['label' => 'خصم ½ يوم', 'value' => 0.5],
                ['label' => 'خصم يوم كامل', 'value' => 1.0],
                ['label' => 'خصم يومين', 'value' => 2.0],
                ['label' => 'خصم ثلاث أيام', 'value' => 3.0]
            ]
        ],
        'approvalRules' => [
            ['id' => 'rule_leave_over_3_days', 'requestType' => 'long_leave', 'name' => 'طلبات الإجازة أكثر من ثلاث أيام في الشهر', 'reqBranch' => false, 'reqAdmin' => true, 'requiresBranchManager' => false, 'requiresSuperAdmin' => true],
            ['id' => 'rule_salary_loan_high', 'requestType' => 'loan', 'name' => 'طلبات السلف المالية التي تتجاوز 50% من الراتب', 'reqBranch' => false, 'reqAdmin' => true, 'requiresBranchManager' => false, 'requiresSuperAdmin' => true],
            ['id' => 'rule_resignation_notice', 'requestType' => 'resignation', 'name' => 'طلبات الاستقالة وفسخ التعاقد', 'reqBranch' => true, 'reqAdmin' => true, 'requiresBranchManager' => true, 'requiresSuperAdmin' => true]
        ]
    ];

    $cleanJson = json_encode($cleanState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    // 3. تحديث جدول app_settings بحالة جديدة تماماً ورفع رقم الإصدار
    $db->exec("
        INSERT INTO public.app_settings (key_name, value_data, version, updated_at)
        VALUES ('pharmacy-tracker-data', '{$cleanJson}'::jsonb, 1000, NOW())
        ON CONFLICT (key_name) DO UPDATE 
        SET value_data = EXCLUDED.value_data,
            version = public.app_settings.version + 1000,
            updated_at = NOW();
    ");

    // 4. تفريغ كاش السيرفر فوراً
    MicroCache::invalidate();

    // حذف كافة ملفات الكاش من القرص
    $cacheDir = __DIR__ . '/cache';
    if (is_dir($cacheDir)) {
        $files = glob($cacheDir . '/*');
        foreach ($files as $file) {
            if (is_file($file)) @unlink($file);
        }
    }

    jsonResponse([
        'success' => true,
        'message' => 'تم تصفير ومسح قاعدة البيانات بالكامل بنجاح وإلغاء كافة الجلسات النشطة',
        'tables_cleared' => count($tablesToTruncate) + 1,
        'session_epoch' => time(),
        'timestamp' => date('Y-m-d H:i:s')
    ]);

} catch (Throwable $e) {
    error_log('[Reset Database Error] ' . $e->getMessage());
    jsonResponse([
        'success' => false,
        'error' => 'فشل تصفير قاعدة البيانات: ' . $e->getMessage()
    ], 500);
}
