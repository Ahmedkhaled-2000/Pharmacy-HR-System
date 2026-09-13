-- ==============================================================================
-- 🐬 سكريبت ترقية قاعدة بيانات MariaDB / MySQL (للاستضافات المشتركة أو cPanel)
-- منظومة إدارة ومزامنة الطلبات المتقدمة فائقة الخفة (Ultra-Low Quota Requests & Delta Sync)
-- ==============================================================================
-- التعليمات:
-- 1. افتح phpMyAdmin أو لوحة تحكم MySQL الخاصة بالاستضافة.
-- 2. اختر قاعدة بيانات المنظومة واضغط على تبويب "SQL".
-- 3. انسخ والصق هذا السكريبت بالكامل واضغط "Go / تنفيذ".
-- ==============================================================================

-- 1. جدول الطلبات العلائقي المركزي المنفصل
CREATE TABLE IF NOT EXISTS `requests` (
    `id` VARCHAR(100) NOT NULL PRIMARY KEY,
    `idempotency_key` VARCHAR(191) NOT NULL UNIQUE,
    `request_type` VARCHAR(100) NOT NULL,
    `employee_id` VARCHAR(100) NOT NULL,
    `employee_name` VARCHAR(255) NULL,
    `employee_code` VARCHAR(100) NULL,
    `branch_id` VARCHAR(100) NOT NULL,
    `department_id` VARCHAR(100) NULL,
    `target_role` VARCHAR(100) NOT NULL DEFAULT 'admin',
    `priority` VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
    `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    `payload` JSON NOT NULL,
    `change_sequence` BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
    `version` INT NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `queued_at` DATETIME NULL,
    `sent_at` DATETIME NULL,
    `delivered_at` DATETIME NULL,
    `received_at` DATETIME NULL,
    `read_at` DATETIME NULL,
    `acknowledged_at` DATETIME NULL,
    `completed_at` DATETIME NULL,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted_at` DATETIME NULL,
    `deleted_by` VARCHAR(100) NULL,
    INDEX `idx_requests_emp` (`employee_id`),
    INDEX `idx_requests_branch` (`branch_id`),
    INDEX `idx_requests_status` (`status`),
    INDEX `idx_requests_type` (`request_type`),
    INDEX `idx_requests_seq` (`change_sequence`),
    INDEX `idx_requests_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. جدول تاريخ وتتبع حركات وحالات الطلب (Audit Trail & State Machine)
CREATE TABLE IF NOT EXISTS `request_status_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `request_id` VARCHAR(100) NOT NULL,
    `from_status` VARCHAR(50) NULL,
    `to_status` VARCHAR(50) NOT NULL,
    `actor_id` VARCHAR(100) NOT NULL,
    `actor_name` VARCHAR(255) NULL,
    `actor_role` VARCHAR(100) NOT NULL,
    `comment` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_req_hist_req` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. جدول تأكيدات وإشعارات الاستلام والتسليم (Acknowledgements)
CREATE TABLE IF NOT EXISTS `request_acknowledgements` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `request_id` VARCHAR(100) NOT NULL,
    `user_id` VARCHAR(100) NOT NULL,
    `device_id` VARCHAR(100) NOT NULL,
    `ack_type` VARCHAR(50) NOT NULL,
    `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_req_ack_req_user` (`request_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. جدول تتبع التغييرات التزايدية (Monotonic Delta Change Log)
CREATE TABLE IF NOT EXISTS `change_log` (
    `sequence` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `entity_type` VARCHAR(50) NOT NULL,
    `entity_id` VARCHAR(100) NOT NULL,
    `branch_id` VARCHAR(100) NULL,
    `operation` VARCHAR(20) NOT NULL,
    `delta_payload` JSON NULL,
    `actor_id` VARCHAR(100) NULL,
    `correlation_id` VARCHAR(191) NULL,
    `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_change_log_seq` (`sequence`),
    INDEX `idx_change_log_branch_seq` (`branch_id`, `sequence`),
    INDEX `idx_change_log_entity` (`entity_type`, `entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. صندوق استلام السيرفر لمنع التكرار (Server Inbox & Deduplication)
CREATE TABLE IF NOT EXISTS `server_inbox` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `client_operation_id` VARCHAR(100) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL UNIQUE,
    `device_id` VARCHAR(100) NOT NULL,
    `user_id` VARCHAR(100) NOT NULL,
    `operation_type` VARCHAR(50) NOT NULL,
    `payload` JSON NOT NULL,
    `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `processed_at` DATETIME NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'PROCESSED',
    `error_message` TEXT NULL,
    INDEX `idx_server_inbox_idemp` (`idempotency_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. جدول حالة ومؤشر مزامنة الأجهزة (Sync State per Device)
CREATE TABLE IF NOT EXISTS `sync_state` (
    `device_id` VARCHAR(100) NOT NULL,
    `user_id` VARCHAR(100) NOT NULL,
    `branch_id` VARCHAR(100) NULL,
    `last_server_cursor` BIGINT NOT NULL DEFAULT 0,
    `last_successful_sync` DATETIME NULL,
    `last_attempted_sync` DATETIME NULL,
    `sync_status` VARCHAR(30) NOT NULL DEFAULT 'IDLE',
    `error_count` INT NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`device_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. صندوق العمليات الميتة (Dead Letter Queue)
CREATE TABLE IF NOT EXISTS `dead_letter_operations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `idempotency_key` VARCHAR(191) NOT NULL UNIQUE,
    `device_id` VARCHAR(100) NULL,
    `branch_id` VARCHAR(100) NULL,
    `operation_type` VARCHAR(50) NOT NULL,
    `payload` JSON NOT NULL,
    `error_code` VARCHAR(50) NOT NULL,
    `error_message` TEXT NOT NULL,
    `retry_count` INT NOT NULL DEFAULT 0,
    `first_attempt_at` DATETIME NOT NULL,
    `failed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `resolved` TINYINT(1) NOT NULL DEFAULT 0,
    `resolution_notes` TEXT NULL,
    INDEX `idx_dlq_resolved` (`resolved`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Trigger آلي لتسجيل التغييرات في جدول change_log تلقائياً
DELIMITER $$

DROP TRIGGER IF EXISTS `trg_requests_insert_changelog`$$
CREATE TRIGGER `trg_requests_insert_changelog`
AFTER INSERT ON `requests`
FOR EACH ROW
BEGIN
    INSERT INTO `change_log` (`entity_type`, `entity_id`, `branch_id`, `operation`, `delta_payload`, `correlation_id`, `timestamp`)
    VALUES ('request', NEW.id, NEW.branch_id, 'INSERT', NEW.payload, NEW.idempotency_key, NOW());
END$$

DROP TRIGGER IF EXISTS `trg_requests_update_changelog`$$
CREATE TRIGGER `trg_requests_update_changelog`
AFTER UPDATE ON `requests`
FOR EACH ROW
BEGIN
    INSERT INTO `change_log` (`entity_type`, `entity_id`, `branch_id`, `operation`, `delta_payload`, `correlation_id`, `timestamp`)
    VALUES ('request', NEW.id, NEW.branch_id, 'UPDATE', NEW.payload, NEW.idempotency_key, NOW());
END$$

DROP TRIGGER IF EXISTS `trg_requests_delete_changelog`$$
CREATE TRIGGER `trg_requests_delete_changelog`
AFTER DELETE ON `requests`
FOR EACH ROW
BEGIN
    INSERT INTO `change_log` (`entity_type`, `entity_id`, `branch_id`, `operation`, `delta_payload`, `correlation_id`, `timestamp`)
    VALUES ('request', OLD.id, OLD.branch_id, 'DELETE', JSON_OBJECT('id', OLD.id, 'status', 'deleted'), OLD.idempotency_key, NOW());
END$$

DELIMITER ;
