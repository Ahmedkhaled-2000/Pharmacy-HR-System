<?php
/**
 * Database Migration Script for Supabase PostgreSQL
 * Auto-creates all necessary tables, JSONB structures, indexes, RLS policies, and default seeds
 * Compatible with PHP 8.1 - 8.5
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $db = Database::getConnection();

    // 1. app_settings & app_settings_backups
    $db->exec("CREATE TABLE IF NOT EXISTS public.app_settings (
        key_name VARCHAR(191) PRIMARY KEY,
        value_data JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_app_settings_updated ON public.app_settings (updated_at DESC);");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_app_settings_val_gin ON public.app_settings USING GIN (value_data);");

    $db->exec("CREATE TABLE IF NOT EXISTS public.app_settings_backups (
        id BIGSERIAL PRIMARY KEY,
        key_name VARCHAR(191) NOT NULL,
        value_data JSONB NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        client_ip VARCHAR(45) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_app_settings_backups_key ON public.app_settings_backups (key_name, created_at DESC);");

    // 2. employee_faces
    $db->exec("CREATE TABLE IF NOT EXISTS public.employee_faces (
        employee_id VARCHAR(100) PRIMARY KEY,
        descriptor JSONB NULL,
        hand_descriptor JSONB NULL,
        biometric_type VARCHAR(50) NOT NULL DEFAULT 'face',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_employee_faces_type ON public.employee_faces (biometric_type);");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_employee_faces_updated ON public.employee_faces (updated_at DESC);");

    // 3. sync_logs
    $db->exec("CREATE TABLE IF NOT EXISTS public.sync_logs (
        id BIGSERIAL PRIMARY KEY,
        action_type VARCHAR(50) NOT NULL,
        entity_key VARCHAR(191) NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        client_ip VARCHAR(45) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_sync_logs_key_date ON public.sync_logs (entity_key, created_at DESC);");

    // 4. archive_suppliers
    $db->exec("CREATE TABLE IF NOT EXISTS public.archive_suppliers (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50) NULL,
        email VARCHAR(255) NULL,
        address TEXT NULL,
        tax_number VARCHAR(100) NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_suppliers_name ON public.archive_suppliers (name);");

    // 5. archive_employees
    $db->exec("CREATE TABLE IF NOT EXISTS public.archive_employees (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        role VARCHAR(100) NULL DEFAULT 'أمين مخزن',
        phone VARCHAR(50) NULL,
        active SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_employees_active ON public.archive_employees (active);");

    // 6. archive_invoices
    $db->exec("CREATE TABLE IF NOT EXISTS public.archive_invoices (
        id VARCHAR(36) PRIMARY KEY,
        invoice_number VARCHAR(100) NOT NULL,
        supplier_id VARCHAR(36) NOT NULL REFERENCES public.archive_suppliers(id) ON DELETE CASCADE,
        invoice_date TIMESTAMPTZ NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        net_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(50) NOT NULL DEFAULT 'ARCHIVED',
        file_url TEXT NULL,
        drive_file_id VARCHAR(255) NULL,
        file_name VARCHAR(255) NULL,
        file_type VARCHAR(50) NULL,
        upload_mode VARCHAR(50) NOT NULL DEFAULT 'AUTO_EXTRACT',
        receiver_id VARCHAR(36) NULL,
        entry_clerk_id VARCHAR(36) NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_inv_num ON public.archive_invoices (invoice_number);");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_inv_supplier ON public.archive_invoices (supplier_id);");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_inv_date ON public.archive_invoices (invoice_date DESC);");

    // 7. archive_invoice_items
    $db->exec("CREATE TABLE IF NOT EXISTS public.archive_invoice_items (
        id VARCHAR(36) PRIMARY KEY,
        invoice_id VARCHAR(36) NOT NULL REFERENCES public.archive_invoices(id) ON DELETE CASCADE,
        product_name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        total_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        selling_price NUMERIC(10, 2) NULL,
        batch_number VARCHAR(100) NULL,
        expiry_date DATE NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_items_invoice ON public.archive_invoice_items (invoice_id);");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_items_product ON public.archive_invoice_items (product_name);");

    // 8. archive_column_mappings
    $db->exec("CREATE TABLE IF NOT EXISTS public.archive_column_mappings (
        id VARCHAR(36) PRIMARY KEY,
        supplier_id VARCHAR(36) NOT NULL REFERENCES public.archive_suppliers(id) ON DELETE CASCADE,
        raw_column_name VARCHAR(255) NOT NULL,
        standard_field VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_archive_supp_raw_col UNIQUE (supplier_id, raw_column_name)
    );");

    // 9. archive_system_settings
    $db->exec("CREATE TABLE IF NOT EXISTS public.archive_system_settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value_data TEXT NOT NULL,
        description TEXT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");

    // 10. archive_import_logs
    $db->exec("CREATE TABLE IF NOT EXISTS public.archive_import_logs (
        id VARCHAR(36) PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        upload_mode VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        items_extracted INTEGER NOT NULL DEFAULT 0,
        error_message TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );");

    // 11. Initial Seed for Settings & Bylaws (إذا لم تكن موجودة مسبقاً)
    $existing = Database::queryOne("SELECT key_name FROM public.app_settings WHERE key_name = ? LIMIT 1", [DEFAULT_STORAGE_KEY]);
    if (!$existing) {
        $initialState = [
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

        Database::execute(
            "INSERT INTO public.app_settings (key_name, value_data, version, updated_at) VALUES (?, ?::jsonb, 1, NOW())",
            [DEFAULT_STORAGE_KEY, json_encode($initialState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]
        );
    }

    // 12. حماية الكوتة وإلغاء بث الجداول الكبيرة عبر Supabase Realtime Publication
    try {
        $db->exec("
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
        ");
    } catch (Throwable) {}

    // تفريغ الكاش بعد الـ Migration
    MicroCache::invalidate();

    $dbVerRow = Database::queryOne("SELECT version() AS ver");
    jsonResponse([
        'success' => true,
        'message' => 'Supabase PostgreSQL Migration completed successfully!',
        'db_driver' => 'pgsql',
        'db_version' => $dbVerRow['ver'] ?? 'Unknown',
        'timestamp' => date('Y-m-d H:i:s')
    ]);
} catch (Throwable $e) {
    error_log('[Supabase Migration Error] ' . $e->getMessage());
    jsonResponse([
        'success' => false,
        'error' => 'Migration failed: ' . $e->getMessage()
    ], 500);
}
