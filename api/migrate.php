<?php
/**
 * Database Migration Script for MariaDB 10.11+
 * Auto-creates all necessary tables and indexes
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $db = Database::getConnection();
    
    // 1. جدول إعدادات وبيانات التطبيق الرئيسية
    $sqlSettings = "CREATE TABLE IF NOT EXISTS `app_settings` (
        `key_name` VARCHAR(191) NOT NULL,
        `value_data` LONGTEXT NOT NULL,
        `version` INT UNSIGNED NOT NULL DEFAULT 1,
        `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (`key_name`),
        INDEX `idx_updated_at` (`updated_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $db->query($sqlSettings);

    // 2. جدول البصمات الحيوية (بصمة الوجه وبصمة اليد)
    $sqlFaces = "CREATE TABLE IF NOT EXISTS `employee_faces` (
        `employee_id` VARCHAR(100) NOT NULL,
        `descriptor` LONGTEXT NULL,
        `hand_descriptor` LONGTEXT NULL,
        `biometric_type` VARCHAR(50) NOT NULL DEFAULT 'face',
        `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (`employee_id`),
        INDEX `idx_biometric_type` (`biometric_type`),
        INDEX `idx_face_updated` (`updated_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $db->query($sqlFaces);

    // 3. جدول سجلات المزامنة للتتبع بين الأجهزة المتعددة
    $sqlSync = "CREATE TABLE IF NOT EXISTS `sync_logs` (
        `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `action_type` VARCHAR(50) NOT NULL,
        `entity_key` VARCHAR(191) NOT NULL,
        `version` INT UNSIGNED NOT NULL DEFAULT 1,
        `client_ip` VARCHAR(45) NULL,
        `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX `idx_entity_key_created` (`entity_key`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    
    $db->query($sqlSync);

    // =========================================================================
    // جداول نظام أرشيف الصيدلية (Pharmacy Archive System Tables)
    // =========================================================================

    // 4. جدول الموردين (archive_suppliers)
    $sqlSuppliers = "CREATE TABLE IF NOT EXISTS `archive_suppliers` (
        `id` VARCHAR(36) NOT NULL PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL UNIQUE,
        `phone` VARCHAR(50) NULL,
        `email` VARCHAR(255) NULL,
        `address` TEXT NULL,
        `tax_number` VARCHAR(100) NULL,
        `notes` TEXT NULL,
        `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX `idx_archive_supplier_name` (`name`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $db->query($sqlSuppliers);

    // 5. جدول موظفي الأرشيف (archive_employees)
    $sqlArchiveEmployees = "CREATE TABLE IF NOT EXISTS `archive_employees` (
        `id` VARCHAR(36) NOT NULL PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL UNIQUE,
        `role` VARCHAR(100) NULL,
        `phone` VARCHAR(50) NULL,
        `active` TINYINT(1) NOT NULL DEFAULT 1,
        `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX `idx_archive_emp_active` (`active`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $db->query($sqlArchiveEmployees);

    // 6. جدول الفواتير الرئيسية (archive_invoices)
    $sqlInvoices = "CREATE TABLE IF NOT EXISTS `archive_invoices` (
        `id` VARCHAR(36) NOT NULL PRIMARY KEY,
        `invoice_number` VARCHAR(100) NOT NULL,
        `supplier_id` VARCHAR(36) NOT NULL,
        `invoice_date` DATETIME NOT NULL,
        `total_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        `net_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        `status` VARCHAR(50) NOT NULL DEFAULT 'ARCHIVED',
        `file_url` TEXT NULL,
        `drive_file_id` VARCHAR(255) NULL,
        `file_name` VARCHAR(255) NULL,
        `file_type` VARCHAR(50) NULL,
        `upload_mode` VARCHAR(50) NOT NULL DEFAULT 'AUTO_EXTRACT',
        `receiver_id` VARCHAR(36) NULL,
        `entry_clerk_id` VARCHAR(36) NULL,
        `notes` TEXT NULL,
        `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX `idx_archive_inv_num` (`invoice_number`),
        INDEX `idx_archive_inv_supplier` (`supplier_id`),
        INDEX `idx_archive_inv_date` (`invoice_date`),
        INDEX `idx_archive_inv_receiver` (`receiver_id`),
        INDEX `idx_archive_inv_clerk` (`entry_clerk_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $db->query($sqlInvoices);

    // 7. جدول بنود وأصناف الفواتير (archive_invoice_items)
    $sqlInvoiceItems = "CREATE TABLE IF NOT EXISTS `archive_invoice_items` (
        `id` VARCHAR(36) NOT NULL PRIMARY KEY,
        `invoice_id` VARCHAR(36) NOT NULL,
        `product_name` VARCHAR(255) NOT NULL,
        `quantity` INT NOT NULL DEFAULT 1,
        `unit_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        `total_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        `selling_price` DECIMAL(10, 2) NULL,
        `batch_number` VARCHAR(100) NULL,
        `expiry_date` DATE NULL,
        `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX `idx_archive_item_invoice` (`invoice_id`),
        INDEX `idx_archive_item_product` (`product_name`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $db->query($sqlInvoiceItems);

    // 8. جدول تعيين ومطابقة أعمدة الإكسل (archive_column_mappings)
    $sqlMappings = "CREATE TABLE IF NOT EXISTS `archive_column_mappings` (
        `id` VARCHAR(36) NOT NULL PRIMARY KEY,
        `supplier_id` VARCHAR(36) NOT NULL,
        `raw_column_name` VARCHAR(255) NOT NULL,
        `standard_field` VARCHAR(100) NOT NULL,
        `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY `uq_archive_supp_raw_col` (`supplier_id`, `raw_column_name`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $db->query($sqlMappings);

    // 9. جدول إعدادات نظام الأرشيف وبيانات تسجيل الدخول (archive_system_settings)
    $sqlArchiveSettings = "CREATE TABLE IF NOT EXISTS `archive_system_settings` (
        `key_name` VARCHAR(100) NOT NULL PRIMARY KEY,
        `value_data` LONGTEXT NOT NULL,
        `description` TEXT NULL,
        `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $db->query($sqlArchiveSettings);

    // 10. جدول سجلات الاستيراد والفحص (archive_import_logs)
    $sqlLogs = "CREATE TABLE IF NOT EXISTS `archive_import_logs` (
        `id` VARCHAR(36) NOT NULL PRIMARY KEY,
        `file_name` VARCHAR(255) NOT NULL,
        `file_type` VARCHAR(50) NOT NULL,
        `upload_mode` VARCHAR(50) NOT NULL,
        `status` VARCHAR(50) NOT NULL,
        `items_extracted` INT NOT NULL DEFAULT 0,
        `error_message` TEXT NULL,
        `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX `idx_archive_log_created` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $db->query($sqlLogs);

    // البذور الافتراضية لإعدادات الأرشيف
    $defaultArchiveSettings = [
        'ADMIN_USERNAME' => 'admin',
        'ADMIN_PASSWORD' => '123456',
        'PHARMACY_NAME' => 'صيدليات مداواة',
        'PHARMACY_LOGO' => '',
        'GEMINI_API_KEY' => '',
        'GROQ_API_KEY' => '',
        'GOOGLE_CLIENT_EMAIL' => '',
        'GOOGLE_PRIVATE_KEY' => '',
        'GOOGLE_DRIVE_PARENT_FOLDER_ID' => '',
        'AUTO_SCAN_FOLDER_PATH' => ''
    ];

    foreach ($defaultArchiveSettings as $key => $val) {
        $check = Database::queryOne("SELECT `key_name` FROM `archive_system_settings` WHERE `key_name` = ?", "s", [$key]);
        if (!$check) {
            Database::execute("INSERT INTO `archive_system_settings` (`key_name`, `value_data`) VALUES (?, ?)", "ss", [$key, $val]);
        }
    }

    jsonResponse([
        'success' => true,
        'message' => 'All MariaDB tables created/verified successfully!',
        'tables' => [
            'app_settings',
            'employee_faces',
            'sync_logs',
            'archive_suppliers',
            'archive_employees',
            'archive_invoices',
            'archive_invoice_items',
            'archive_column_mappings',
            'archive_system_settings',
            'archive_import_logs'
        ],
        'php_version' => PHP_VERSION,
        'mariadb_version' => $db->server_info
    ]);

} catch (Throwable $e) {
    jsonResponse([
        'success' => false,
        'error' => 'Migration failed: ' . $e->getMessage()
    ], 500);
}
