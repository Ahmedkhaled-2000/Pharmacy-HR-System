<?php
/**
 * Database Migration Script for PostgreSQL 16+/18+, SQLite, and MariaDB/MySQL
 * Auto-creates all necessary tables, JSON/JSONB structures, and indexes
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $driver = Database::getDriver();
    $db = Database::getConnection();

    if ($driver === 'pgsql') {
        // =========================================================================
        // PostgreSQL DDL Migration
        // =========================================================================

        // 1. app_settings & app_settings_backups
        $db->exec("CREATE TABLE IF NOT EXISTS app_settings (
            key_name VARCHAR(191) PRIMARY KEY,
            value_data JSONB NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_app_settings_updated ON app_settings (updated_at);");

        $db->exec("CREATE TABLE IF NOT EXISTS app_settings_backups (
            id BIGSERIAL PRIMARY KEY,
            key_name VARCHAR(191) NOT NULL,
            value_data JSONB NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            client_ip VARCHAR(45) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_app_settings_backups_key ON app_settings_backups (key_name, created_at DESC);");

        // 2. employee_faces
        $db->exec("CREATE TABLE IF NOT EXISTS employee_faces (
            employee_id VARCHAR(100) PRIMARY KEY,
            descriptor JSONB NULL,
            hand_descriptor JSONB NULL,
            biometric_type VARCHAR(50) NOT NULL DEFAULT 'face',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_employee_faces_type ON employee_faces (biometric_type);");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_employee_faces_updated ON employee_faces (updated_at);");

        // 3. sync_logs
        $db->exec("CREATE TABLE IF NOT EXISTS sync_logs (
            id BIGSERIAL PRIMARY KEY,
            action_type VARCHAR(50) NOT NULL,
            entity_key VARCHAR(191) NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            client_ip VARCHAR(45) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_sync_logs_key_date ON sync_logs (entity_key, created_at DESC);");

        // 4. archive_suppliers
        $db->exec("CREATE TABLE IF NOT EXISTS archive_suppliers (
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
        $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_suppliers_name ON archive_suppliers (name);");

        // 5. archive_employees
        $db->exec("CREATE TABLE IF NOT EXISTS archive_employees (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            role VARCHAR(100) NULL DEFAULT 'أمين مخزن',
            phone VARCHAR(50) NULL,
            active SMALLINT NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_employees_active ON archive_employees (active);");

        // 6. archive_invoices
        $db->exec("CREATE TABLE IF NOT EXISTS archive_invoices (
            id VARCHAR(36) PRIMARY KEY,
            invoice_number VARCHAR(100) NOT NULL,
            supplier_id VARCHAR(36) NOT NULL,
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
        $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_inv_num ON archive_invoices (invoice_number);");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_inv_supplier ON archive_invoices (supplier_id);");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_inv_date ON archive_invoices (invoice_date DESC);");

        // 7. archive_invoice_items
        $db->exec("CREATE TABLE IF NOT EXISTS archive_invoice_items (
            id VARCHAR(36) PRIMARY KEY,
            invoice_id VARCHAR(36) NOT NULL,
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
        $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_items_invoice ON archive_invoice_items (invoice_id);");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_items_product ON archive_invoice_items (product_name);");

        // 8. archive_column_mappings
        $db->exec("CREATE TABLE IF NOT EXISTS archive_column_mappings (
            id VARCHAR(36) PRIMARY KEY,
            supplier_id VARCHAR(36) NOT NULL,
            raw_column_name VARCHAR(255) NOT NULL,
            standard_field VARCHAR(100) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_archive_supp_raw_col UNIQUE (supplier_id, raw_column_name)
        );");

        // 9. archive_system_settings
        $db->exec("CREATE TABLE IF NOT EXISTS archive_system_settings (
            key_name VARCHAR(100) PRIMARY KEY,
            value_data TEXT NOT NULL,
            description TEXT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );");

        // 10. archive_import_logs
        $db->exec("CREATE TABLE IF NOT EXISTS archive_import_logs (
            id VARCHAR(36) PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
            file_type VARCHAR(50) NOT NULL,
            upload_mode VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL,
            items_extracted INTEGER NOT NULL DEFAULT 0,
            error_message TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_archive_logs_created ON archive_import_logs (created_at DESC);");

    } elseif ($driver === 'sqlite') {
        // =========================================================================
        // SQLite DDL Migration
        // =========================================================================
        $db->exec("CREATE TABLE IF NOT EXISTS app_settings (
            key_name TEXT PRIMARY KEY,
            value_data TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS employee_faces (
            employee_id TEXT PRIMARY KEY,
            descriptor TEXT NULL,
            hand_descriptor TEXT NULL,
            biometric_type TEXT NOT NULL DEFAULT 'face',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            client_ip TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_suppliers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            phone TEXT NULL,
            email TEXT NULL,
            address TEXT NULL,
            tax_number TEXT NULL,
            notes TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_employees (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            role TEXT NULL DEFAULT 'أمين مخزن',
            phone TEXT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_invoices (
            id TEXT PRIMARY KEY,
            invoice_number TEXT NOT NULL,
            supplier_id TEXT NOT NULL,
            invoice_date DATETIME NOT NULL,
            total_amount REAL NOT NULL DEFAULT 0.00,
            discount REAL NOT NULL DEFAULT 0.00,
            net_amount REAL NOT NULL DEFAULT 0.00,
            status TEXT NOT NULL DEFAULT 'ARCHIVED',
            file_url TEXT NULL,
            drive_file_id TEXT NULL,
            file_name TEXT NULL,
            file_type TEXT NULL,
            upload_mode TEXT NOT NULL DEFAULT 'AUTO_EXTRACT',
            receiver_id TEXT NULL,
            entry_clerk_id TEXT NULL,
            notes TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_invoice_items (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            unit_price REAL NOT NULL DEFAULT 0.00,
            discount REAL NOT NULL DEFAULT 0.00,
            total_price REAL NOT NULL DEFAULT 0.00,
            selling_price REAL NULL,
            batch_number TEXT NULL,
            expiry_date TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_column_mappings (
            id TEXT PRIMARY KEY,
            supplier_id TEXT NOT NULL,
            raw_column_name TEXT NOT NULL,
            standard_field TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (supplier_id, raw_column_name)
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_system_settings (
            key_name TEXT PRIMARY KEY,
            value_data TEXT NOT NULL,
            description TEXT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_import_logs (
            id TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            upload_mode TEXT NOT NULL,
            status TEXT NOT NULL,
            items_extracted INTEGER NOT NULL DEFAULT 0,
            error_message TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );");

    } else {
        // =========================================================================
        // MySQL / MariaDB DDL Fallback
        // =========================================================================
        $db->exec("CREATE TABLE IF NOT EXISTS app_settings (
            key_name VARCHAR(191) NOT NULL PRIMARY KEY,
            value_data LONGTEXT NOT NULL,
            version INT UNSIGNED NOT NULL DEFAULT 1,
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX idx_updated_at (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS employee_faces (
            employee_id VARCHAR(100) NOT NULL PRIMARY KEY,
            descriptor LONGTEXT NULL,
            hand_descriptor LONGTEXT NULL,
            biometric_type VARCHAR(50) NOT NULL DEFAULT 'face',
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX idx_biometric_type (biometric_type),
            INDEX idx_face_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS sync_logs (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            action_type VARCHAR(50) NOT NULL,
            entity_key VARCHAR(191) NOT NULL,
            version INT UNSIGNED NOT NULL DEFAULT 1,
            client_ip VARCHAR(45) NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            INDEX idx_entity_key_created (entity_key, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_suppliers (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            phone VARCHAR(50) NULL,
            email VARCHAR(255) NULL,
            address TEXT NULL,
            tax_number VARCHAR(100) NULL,
            notes TEXT NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX idx_archive_supplier_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_employees (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            role VARCHAR(100) NULL DEFAULT 'أمين مخزن',
            phone VARCHAR(50) NULL,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            INDEX idx_archive_emp_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_invoices (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            invoice_number VARCHAR(100) NOT NULL,
            supplier_id VARCHAR(36) NOT NULL,
            invoice_date DATETIME NOT NULL,
            total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            net_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            status VARCHAR(50) NOT NULL DEFAULT 'ARCHIVED',
            file_url TEXT NULL,
            drive_file_id VARCHAR(255) NULL,
            file_name VARCHAR(255) NULL,
            file_type VARCHAR(50) NULL,
            upload_mode VARCHAR(50) NOT NULL DEFAULT 'AUTO_EXTRACT',
            receiver_id VARCHAR(36) NULL,
            entry_clerk_id VARCHAR(36) NULL,
            notes TEXT NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_invoice_items (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            invoice_id VARCHAR(36) NOT NULL,
            product_name VARCHAR(255) NOT NULL,
            quantity INT NOT NULL DEFAULT 1,
            unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            total_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            selling_price DECIMAL(10, 2) NULL,
            batch_number VARCHAR(100) NULL,
            expiry_date DATE NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_column_mappings (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            supplier_id VARCHAR(36) NOT NULL,
            raw_column_name VARCHAR(255) NOT NULL,
            standard_field VARCHAR(100) NOT NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
            UNIQUE KEY uq_archive_supp_raw_col (supplier_id, raw_column_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_system_settings (
            key_name VARCHAR(100) NOT NULL PRIMARY KEY,
            value_data LONGTEXT NOT NULL,
            description TEXT NULL,
            updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $db->exec("CREATE TABLE IF NOT EXISTS archive_import_logs (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
            file_type VARCHAR(50) NOT NULL,
            upload_mode VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL,
            items_extracted INT NOT NULL DEFAULT 0,
            error_message TEXT NULL,
            created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
    }

    // Default Seed Settings
    $defaults = [
        'ADMIN_USERNAME' => 'admin',
        'ADMIN_PASSWORD' => '123456',
        'PHARMACY_NAME' => 'صيدليات مداواة',
        'PHARMACY_LOGO' => '',
        'GEMINI_API_KEY' => '',
        'GROQ_API_KEY' => '',
        'GOOGLE_DRIVE_FOLDER_ID' => '',
        'AUTO_SCAN_FOLDER_PATH' => '',
        'AUTO_SCAN_INTERVAL_MINUTES' => '30'
    ];

    foreach ($defaults as $k => $v) {
        $existing = Database::queryOne("SELECT key_name FROM archive_system_settings WHERE key_name = ? LIMIT 1", [$k]);
        if (!$existing) {
            Database::execute("INSERT INTO archive_system_settings (key_name, value_data) VALUES (?, ?)", [$k, $v]);
        }
    }

    $dbVerRow = Database::queryOne($driver === 'pgsql' ? "SELECT version() AS ver" : ($driver === 'sqlite' ? "SELECT sqlite_version() AS ver" : "SELECT VERSION() AS ver"));

    jsonResponse([
        'success' => true,
        'message' => "All {$driver} tables created and verified successfully!",
        'driver' => $driver,
        'db_version' => $dbVerRow['ver'] ?? 'Unknown',
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
        ]
    ]);

} catch (Throwable $e) {
    jsonResponse([
        'success' => false,
        'error' => 'Migration failed: ' . $e->getMessage()
    ], 500);
}
