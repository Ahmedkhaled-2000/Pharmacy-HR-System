-- ==========================================================
-- PostgreSQL 16+ / 18+ Schema for Pharmacy HR & Archive System
-- Target: Apex Thunder Hosting / PostgreSQL (127.0.0.1:5432)
-- Encoding: UTF8
-- ==========================================================

-- 1. جدول إعدادات وبيانات التطبيق الرئيسية (JSONB State Store)
CREATE TABLE IF NOT EXISTS app_settings (
    key_name VARCHAR(191) PRIMARY KEY,
    value_data JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_settings_updated ON app_settings (updated_at);
CREATE INDEX IF NOT EXISTS idx_app_settings_val_gin ON app_settings USING GIN (value_data);

-- 2. جدول البصمات الحيوية للموظفين (بصمة الوجه واليد)
CREATE TABLE IF NOT EXISTS employee_faces (
    employee_id VARCHAR(100) PRIMARY KEY,
    descriptor JSONB NULL,
    hand_descriptor JSONB NULL,
    biometric_type VARCHAR(50) NOT NULL DEFAULT 'face',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_faces_type ON employee_faces (biometric_type);
CREATE INDEX IF NOT EXISTS idx_employee_faces_updated ON employee_faces (updated_at);

-- 3. جدول سجلات المزامنة للتتبع بين الأجهزة المتعددة (Multi-Device Sync Logs)
CREATE TABLE IF NOT EXISTS sync_logs (
    id BIGSERIAL PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    entity_key VARCHAR(191) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    client_ip VARCHAR(45) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_key_date ON sync_logs (entity_key, created_at DESC);

-- ==========================================================
-- جداول نظام أرشيف الصيدلية (Pharmacy Archive System)
-- ==========================================================

-- 4. جدول الموردين (archive_suppliers)
CREATE TABLE IF NOT EXISTS archive_suppliers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50) NULL,
    email VARCHAR(255) NULL,
    address TEXT NULL,
    tax_number VARCHAR(100) NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archive_suppliers_name ON archive_suppliers (name);

-- 5. جدول موظفي الأرشيف والمخازن (archive_employees)
CREATE TABLE IF NOT EXISTS archive_employees (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(100) NULL DEFAULT 'أمين مخزن',
    phone VARCHAR(50) NULL,
    active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archive_employees_active ON archive_employees (active);

-- 6. جدول الفواتير المؤرشفة (archive_invoices)
CREATE TABLE IF NOT EXISTS archive_invoices (
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
);

CREATE INDEX IF NOT EXISTS idx_archive_inv_num ON archive_invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_archive_inv_supplier ON archive_invoices (supplier_id);
CREATE INDEX IF NOT EXISTS idx_archive_inv_date ON archive_invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_archive_inv_receiver ON archive_invoices (receiver_id);
CREATE INDEX IF NOT EXISTS idx_archive_inv_clerk ON archive_invoices (entry_clerk_id);

-- 7. جدول أصناف وبنود الفواتير (archive_invoice_items)
CREATE TABLE IF NOT EXISTS archive_invoice_items (
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
);

CREATE INDEX IF NOT EXISTS idx_archive_items_invoice ON archive_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_archive_items_product ON archive_invoice_items (product_name);

-- 8. جدول ربط وتطابق أعمدة الموردين (archive_column_mappings)
CREATE TABLE IF NOT EXISTS archive_column_mappings (
    id VARCHAR(36) PRIMARY KEY,
    supplier_id VARCHAR(36) NOT NULL,
    raw_column_name VARCHAR(255) NOT NULL,
    standard_field VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_archive_supp_raw_col UNIQUE (supplier_id, raw_column_name)
);

-- 9. جدول إعدادات نظام الأرشيف ومفاتيح الربط (archive_system_settings)
CREATE TABLE IF NOT EXISTS archive_system_settings (
    key_name VARCHAR(100) PRIMARY KEY,
    value_data TEXT NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. جدول سجلات الرفع والمعالجة (archive_import_logs)
CREATE TABLE IF NOT EXISTS archive_import_logs (
    id VARCHAR(36) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    upload_mode VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    items_extracted INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_archive_logs_created ON archive_import_logs (created_at DESC);
