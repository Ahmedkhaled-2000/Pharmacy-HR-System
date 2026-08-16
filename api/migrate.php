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

    jsonResponse([
        'success' => true,
        'message' => 'All MariaDB tables created/verified successfully!',
        'tables' => ['app_settings', 'employee_faces', 'sync_logs'],
        'php_version' => PHP_VERSION,
        'mariadb_version' => $db->server_info
    ]);

} catch (Throwable $e) {
    jsonResponse([
        'success' => false,
        'error' => 'Migration failed: ' . $e->getMessage()
    ], 500);
}
