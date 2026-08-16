-- ==========================================================
-- MariaDB 10.11.18 Schema for Pharmacy HR System
-- Target: Apex Thunder Hosting / MariaDB 10.11+
-- Character Set: utf8mb4_unicode_ci
-- ==========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. جدول إعدادات وبيانات التطبيق الرئيسية (Key-Value / Document Store)
CREATE TABLE IF NOT EXISTS `app_settings` (
    `key_name` VARCHAR(191) NOT NULL,
    `value_data` LONGTEXT NOT NULL,
    `version` INT UNSIGNED NOT NULL DEFAULT 1,
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`key_name`),
    INDEX `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. جدول البصمات الحيوية للموظفين (بصمة الوجه واليد)
CREATE TABLE IF NOT EXISTS `employee_faces` (
    `employee_id` VARCHAR(100) NOT NULL,
    `descriptor` LONGTEXT NULL,
    `hand_descriptor` LONGTEXT NULL,
    `biometric_type` VARCHAR(50) NOT NULL DEFAULT 'face',
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`employee_id`),
    INDEX `idx_biometric_type` (`biometric_type`),
    INDEX `idx_face_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. جدول سجلات المزامنة للتتبع بين الأجهزة (Multi-Device Sync Logs)
CREATE TABLE IF NOT EXISTS `sync_logs` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `action_type` VARCHAR(50) NOT NULL,
    `entity_key` VARCHAR(191) NOT NULL,
    `version` INT UNSIGNED NOT NULL DEFAULT 1,
    `client_ip` VARCHAR(45) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX `idx_entity_key_created` (`entity_key`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
