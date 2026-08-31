<?php
/**
 * Archive System API Handler for Pharmacy HR & Archive System
 * Handles Authentication, Invoices, Suppliers, Employees, Settings, Mappings, Excel Data, Drive Sync
 * Compatible with PHP 8.1 - 8.5 & PostgreSQL 16+/18+ (Default) / MySQL via PDO
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// مفتاح التوقيع لتوليد رموز المصادقة المستقلة للأرشيف
define('ARCHIVE_SECRET_KEY', 'pharmacy-archive-secret-key-2026-secure');

/**
 * دالة توليد معرف فريد UUID v4
 */
function generateUuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40); // version 4
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80); // variant
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/**
 * توليد رمز جلسة الأرشيف
 */
function createArchiveToken(string $username): string
{
    $payload = json_encode([
        'username' => $username,
        'scope' => 'pharmacy_archive',
        'exp' => time() + (30 * 24 * 60 * 60) // 30 days
    ]);
    $signature = hash_hmac('sha256', $payload, ARCHIVE_SECRET_KEY);
    return base64_encode($payload . '.' . $signature);
}

/**
 * التحقق من رمز جلسة الأرشيف
 */
function verifyArchiveToken(?string $token): ?array
{
    if (empty($token)) return null;
    $decoded = base64_decode($token);
    if (!$decoded) return null;

    $lastDot = strrpos($decoded, '.');
    if ($lastDot === false) return null;

    $payloadStr = substr($decoded, 0, $lastDot);
    $signature = substr($decoded, $lastDot + 1);

    $expectedSig = hash_hmac('sha256', $payloadStr, ARCHIVE_SECRET_KEY);
    if (!hash_equals($expectedSig, $signature)) return null;

    $data = json_decode($payloadStr, true);
    if (!$data || (isset($data['exp']) && $data['exp'] < time())) return null;

    return $data;
}

/**
 * التأكد التلقائي والترقية الذاتية لجداول الأرشيف في قاعدة البيانات
 */
function ensureArchiveTablesExist(): void
{
    static $initialized = false;
    if ($initialized) return;
    $initialized = true;

    try {
        $driver = Database::getDriver();
        $db = Database::getConnection();

        if (in_array($driver, ['pgsql', 'sqlite'], true)) {
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

            $db->exec("CREATE TABLE IF NOT EXISTS archive_employees (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                role VARCHAR(100) NULL DEFAULT 'أمين مخزن',
                phone VARCHAR(50) NULL,
                active SMALLINT NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );");

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

            $db->exec("CREATE TABLE IF NOT EXISTS archive_column_mappings (
                id VARCHAR(36) PRIMARY KEY,
                supplier_id VARCHAR(36) NOT NULL,
                raw_column_name VARCHAR(255) NOT NULL,
                standard_field VARCHAR(100) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_archive_supp_raw_col UNIQUE (supplier_id, raw_column_name)
            );");

            $db->exec("CREATE TABLE IF NOT EXISTS archive_system_settings (
                key_name VARCHAR(100) PRIMARY KEY,
                value_data TEXT NOT NULL,
                description TEXT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );");

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
        } else {
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

        // Default seeds for settings
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

    } catch (Throwable $e) {
        error_log('[Archive DB Init Error] ' . $e->getMessage());
    }
}

function getArchiveSetting(string $key, string $default = ''): string
{
    $row = Database::queryOne("SELECT value_data FROM archive_system_settings WHERE key_name = ? LIMIT 1", [$key]);
    return $row ? (string)$row['value_data'] : $default;
}

function setArchiveSetting(string $key, string $value): void
{
    $driver = Database::getDriver();
    if (in_array($driver, ['pgsql', 'sqlite'], true)) {
        Database::execute(
            "INSERT INTO archive_system_settings (key_name, value_data, updated_at) VALUES (?, ?, NOW())
             ON CONFLICT (key_name) DO UPDATE SET value_data = EXCLUDED.value_data, updated_at = NOW()",
            [$key, $value]
        );
    } else {
        Database::execute(
            "INSERT INTO archive_system_settings (key_name, value_data, updated_at) VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE value_data = VALUES(value_data), updated_at = NOW()",
            [$key, $value]
        );
    }
}

/**
 * المعالج الرئيسي لجميع مسارات الأرشيف
 */
function handleArchiveApi(string $subPath, string $method): void
{
    ensureArchiveTablesExist();

    $rawInput = file_get_contents('php://input');
    $requestData = !empty($rawInput) ? json_decode($rawInput, true) : [];
    if (!is_array($requestData)) $requestData = [];

    $driver = Database::getDriver();

    // Parse subPath segments
    $segments = array_values(array_filter(explode('/', trim($subPath, '/'))));
    $rootResource = $segments[0] ?? '';
    $action = $segments[1] ?? '';
    $subAction = $segments[2] ?? '';

    try {
        switch ($rootResource) {
            // =================================================================
            // 1. المصادقة والأمان (Auth Endpoints)
            // =================================================================
            case 'auth':
                if ($action === 'login' && $method === 'POST') {
                    $username = trim((string)($requestData['username'] ?? ''));
                    $password = (string)($requestData['password'] ?? '');

                    $savedUser = getArchiveSetting('ADMIN_USERNAME', 'admin');
                    $savedPass = getArchiveSetting('ADMIN_PASSWORD', '123456');

                    if ($username === $savedUser && $password === $savedPass) {
                        $token = createArchiveToken($username);
                        jsonResponse([
                            'success' => true,
                            'message' => 'تم تسجيل الدخول بنجاح',
                            'token' => $token,
                            'username' => $username,
                            'user' => [
                                'username' => $username,
                                'role' => 'archive_admin',
                                'pharmacyName' => getArchiveSetting('PHARMACY_NAME', 'صيدليات مداواة')
                            ]
                        ]);
                    } else {
                        jsonResponse(['success' => false, 'error' => 'اسم المستخدم أو كلمة المرور غير صحيحة'], 401);
                    }
                } elseif ($action === 'session' && $method === 'GET') {
                    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
                    $token = '';
                    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                        $token = trim($matches[1]);
                    }

                    $userData = verifyArchiveToken($token);
                    if ($userData) {
                        jsonResponse([
                            'success' => true,
                            'authenticated' => true,
                            'username' => $userData['username'],
                            'user' => [
                                'username' => $userData['username'],
                                'role' => 'archive_admin',
                                'pharmacyName' => getArchiveSetting('PHARMACY_NAME', 'صيدليات مداواة')
                            ]
                        ]);
                    } else {
                        jsonResponse(['success' => false, 'authenticated' => false], 401);
                    }
                } elseif ($action === 'change-credentials' && $method === 'POST') {
                    $currPass = (string)($requestData['currentPassword'] ?? '');
                    $newPass = (string)($requestData['newPassword'] ?? '');
                    $newUser = trim((string)($requestData['newUsername'] ?? ''));

                    $savedPass = getArchiveSetting('ADMIN_PASSWORD', '123456');

                    if ($currPass !== $savedPass) {
                        jsonResponse(['success' => false, 'error' => 'كلمة المرور الحالية غير صحيحة'], 400);
                    }

                    if (!empty($newUser)) setArchiveSetting('ADMIN_USERNAME', $newUser);
                    if (!empty($newPass)) setArchiveSetting('ADMIN_PASSWORD', $newPass);

                    jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الدخول بنجاح']);
                }
                break;

            // =================================================================
            // 2. الفواتير والبنود (Invoices & Items Endpoints)
            // =================================================================
            case 'invoices':
                if (!empty($action) && $action !== 'batch' && !empty($subAction)) {
                    $invoiceId = $action;

                    // 2.1 Excel Data Sub-route: /invoices/[id]/excel-data
                    if ($subAction === 'excel-data' && $method === 'GET') {
                        $inv = Database::queryOne("SELECT file_url, drive_file_id, file_name, file_type FROM archive_invoices WHERE id = ? LIMIT 1", [$invoiceId]);
                        if (!$inv) jsonResponse(['success' => false, 'error' => 'الفاتورة غير موجودة'], 404);

                        $fileUrl = (string)($inv['file_url'] ?? '');
                        if (str_starts_with($fileUrl, 'data:')) {
                            jsonResponse(['success' => true, 'fileUrl' => $fileUrl, 'fileName' => $inv['file_name']]);
                        } else {
                            jsonResponse(['success' => true, 'fileUrl' => $fileUrl, 'driveFileId' => $inv['drive_file_id'], 'fileName' => $inv['file_name']]);
                        }
                    }

                    // 2.2 Attach Document Sub-route: /invoices/[id]/attach
                    if ($subAction === 'attach') {
                        if ($method === 'POST') {
                            $fileUrl = (string)($requestData['fileUrl'] ?? '');
                            $driveFileId = (string)($requestData['driveFileId'] ?? '');
                            $fileName = (string)($requestData['fileName'] ?? '');
                            $fileType = (string)($requestData['fileType'] ?? '');

                            Database::execute(
                                "UPDATE archive_invoices SET file_url = ?, drive_file_id = ?, file_name = ?, file_type = ?, updated_at = NOW() WHERE id = ?",
                                [$fileUrl, $driveFileId, $fileName, $fileType, $invoiceId]
                            );
                            jsonResponse(['success' => true, 'message' => 'تم إرفاق المستند بنجاح']);
                        } elseif ($method === 'DELETE') {
                            Database::execute(
                                "UPDATE archive_invoices SET file_url = NULL, drive_file_id = NULL, file_name = NULL, file_type = NULL, updated_at = NOW() WHERE id = ?",
                                [$invoiceId]
                            );
                            jsonResponse(['success' => true, 'message' => 'تم إزالة المستند بنجاح']);
                        }
                    }
                }

                // Batch Invoices Saving: /invoices/batch
                if ($action === 'batch' && $method === 'POST') {
                    $invoicesList = is_array($requestData['invoices'] ?? null) ? $requestData['invoices'] : (is_array($requestData) ? $requestData : []);
                    if (empty($invoicesList)) jsonResponse(['success' => false, 'error' => 'لا توجد فواتير للحفظ'], 400);

                    $savedInvoices = [];
                    Database::beginTransaction();

                    try {
                        foreach ($invoicesList as $singleInv) {
                            $invId = !empty($singleInv['id']) ? (string)$singleInv['id'] : generateUuid();
                            $invNumber = trim((string)($singleInv['invoiceNumber'] ?? $singleInv['invoice_number'] ?? ''));
                            if (empty($invNumber)) $invNumber = 'INV-' . strtoupper(substr(md5(uniqid()), 0, 6));

                            $suppId = trim((string)($singleInv['supplierId'] ?? $singleInv['supplier_id'] ?? ''));
                            $suppName = trim((string)($singleInv['supplierName'] ?? $singleInv['supplier_name'] ?? ''));

                            if (empty($suppId) && !empty($suppName)) {
                                $existingSup = Database::queryOne("SELECT id FROM archive_suppliers WHERE name = ? LIMIT 1", [$suppName]);
                                if ($existingSup) {
                                    $suppId = $existingSup['id'];
                                } else {
                                    $suppId = generateUuid();
                                    Database::execute("INSERT INTO archive_suppliers (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())", [$suppId, $suppName]);
                                }
                            } elseif (empty($suppId)) {
                                $defaultSup = Database::queryOne("SELECT id FROM archive_suppliers LIMIT 1");
                                if ($defaultSup) {
                                    $suppId = $defaultSup['id'];
                                } else {
                                    $suppId = generateUuid();
                                    Database::execute("INSERT INTO archive_suppliers (id, name, created_at, updated_at) VALUES (?, 'مورد عام', NOW(), NOW())", [$suppId]);
                                }
                            }

                            $invDate = !empty($singleInv['invoiceDate']) ? (string)$singleInv['invoiceDate'] : (!empty($singleInv['invoice_date']) ? (string)$singleInv['invoice_date'] : date('Y-m-d H:i:s'));
                            $totAmt = (float)($singleInv['totalAmount'] ?? $singleInv['total_amount'] ?? $singleInv['totalGross'] ?? 0);
                            $disc = (float)($singleInv['discount'] ?? $singleInv['totalDiscount'] ?? $singleInv['total_discount'] ?? 0);
                            $netAmt = (float)($singleInv['netAmount'] ?? $singleInv['net_amount'] ?? $singleInv['totalNet'] ?? ($totAmt - $disc));
                            $stat = (string)($singleInv['status'] ?? 'ARCHIVED');
                            $fUrl = (string)($singleInv['fileUrl'] ?? $singleInv['file_url'] ?? $singleInv['driveViewLink'] ?? '');
                            $dId = (string)($singleInv['driveFileId'] ?? $singleInv['drive_file_id'] ?? '');
                            $fName = (string)($singleInv['fileName'] ?? $singleInv['file_name'] ?? '');
                            $fType = (string)($singleInv['fileType'] ?? $singleInv['file_type'] ?? '');
                            $uMode = (string)($singleInv['uploadMode'] ?? $singleInv['upload_mode'] ?? 'AUTO_EXTRACT');
                            $recId = !empty($singleInv['receiverId']) ? (string)$singleInv['receiverId'] : (!empty($singleInv['receiver_id']) ? (string)$singleInv['receiver_id'] : null);
                            $entId = !empty($singleInv['entryClerkId']) ? (string)$singleInv['entryClerkId'] : (!empty($singleInv['entry_clerk_id']) ? (string)$singleInv['entry_clerk_id'] : null);
                            $nts = (string)($singleInv['notes'] ?? '');
                            $itms = is_array($singleInv['items'] ?? null) ? $singleInv['items'] : [];

                            $sqlInv = "INSERT INTO archive_invoices (
                                id, invoice_number, supplier_id, invoice_date, total_amount, discount, net_amount,
                                status, file_url, drive_file_id, file_name, file_type, upload_mode,
                                receiver_id, entry_clerk_id, notes, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";

                            Database::execute($sqlInv, [
                                $invId, $invNumber, $suppId, $invDate, $totAmt, $disc, $netAmt,
                                $stat, $fUrl, $dId, $fName, $fType, $uMode,
                                $recId, $entId, $nts
                            ]);

                            if (!empty($itms)) {
                                $sqlItem = "INSERT INTO archive_invoice_items (
                                    id, invoice_id, product_name, quantity, unit_price, discount,
                                    total_price, selling_price, batch_number, expiry_date, created_at, updated_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";

                                foreach ($itms as $item) {
                                    $itemId = !empty($item['id']) && !str_starts_with((string)$item['id'], 'item_') ? (string)$item['id'] : generateUuid();
                                    $prodName = trim((string)($item['productName'] ?? $item['product_name'] ?? $item['item_name'] ?? 'منتج'));
                                    $qty = (int)($item['quantity'] ?? 1);
                                    $unitPrice = (float)($item['unitPrice'] ?? $item['unit_price'] ?? 0);
                                    $itemDisc = (float)($item['discount'] ?? 0);
                                    $totalPrice = (float)($item['totalPrice'] ?? $item['total_price'] ?? ($qty * $unitPrice - $itemDisc));
                                    $sellingPrice = isset($item['sellingPrice']) && $item['sellingPrice'] !== '' ? (float)$item['sellingPrice'] : (isset($item['selling_price']) && $item['selling_price'] !== '' ? (float)$item['selling_price'] : null);
                                    $batchNum = (string)($item['batchNumber'] ?? $item['batch_number'] ?? '');
                                    $expiry = !empty($item['expiryDate']) ? (string)$item['expiryDate'] : (!empty($item['expiry_date']) ? (string)$item['expiry_date'] : null);

                                    Database::execute($sqlItem, [
                                        $itemId, $invId, $prodName, $qty, $unitPrice, $itemDisc,
                                        $totalPrice, $sellingPrice, $batchNum, $expiry
                                    ]);
                                }
                            }
                            $savedInvoices[] = $invId;
                        }

                        Database::commit();
                        jsonResponse(['success' => true, 'message' => "تم حفظ " . count($savedInvoices) . " فاتورة بنجاح", 'ids' => $savedInvoices]);
                    } catch (Throwable $e) {
                        Database::rollback();
                        jsonResponse(['success' => false, 'error' => 'فشل حفظ دفعة الفواتير: ' . $e->getMessage()], 500);
                    }
                }

                // Standard Invoices CRUD
                if ($method === 'GET') {
                    $invoiceId = trim((string)($_GET['id'] ?? $action ?? ''));

                    // Single Invoice details
                    if (!empty($invoiceId) && $invoiceId !== 'invoices') {
                        $inv = Database::queryOne(
                            "SELECT i.*, 
                                    s.name AS supplier_name,
                                    s.phone AS supplier_phone,
                                    r.name AS receiver_name,
                                    c.name AS entry_clerk_name
                             FROM archive_invoices i
                             LEFT JOIN archive_suppliers s ON i.supplier_id = s.id
                             LEFT JOIN archive_employees r ON i.receiver_id = r.id
                             LEFT JOIN archive_employees c ON i.entry_clerk_id = c.id
                             WHERE i.id = ? LIMIT 1",
                            [$invoiceId]
                        );

                        if ($inv) {
                            $items = Database::query("SELECT * FROM archive_invoice_items WHERE invoice_id = ? ORDER BY created_at ASC", [$invoiceId]);
                            
                            $formattedItems = array_map(function($it) {
                                return [
                                    'id' => $it['id'],
                                    'invoiceId' => $it['invoice_id'],
                                    'productName' => $it['product_name'],
                                    'quantity' => (int)$it['quantity'],
                                    'unitPrice' => (float)$it['unit_price'],
                                    'discount' => (float)$it['discount'],
                                    'totalPrice' => (float)$it['total_price'],
                                    'sellingPrice' => $it['selling_price'] !== null ? (float)$it['selling_price'] : null,
                                    'batchNumber' => $it['batch_number'] ?? '',
                                    'expiryDate' => $it['expiry_date'] ?? null
                                ];
                            }, $items);

                            $inv['items'] = $formattedItems;
                            $inv['invoiceNumber'] = $inv['invoice_number'];
                            $inv['supplierId'] = $inv['supplier_id'];
                            $inv['invoiceDate'] = $inv['invoice_date'];
                            $inv['totalAmount'] = (float)$inv['total_amount'];
                            $inv['discount'] = (float)$inv['discount'];
                            $inv['netAmount'] = (float)$inv['net_amount'];
                            $inv['fileUrl'] = $inv['file_url'];
                            $inv['driveFileId'] = $inv['drive_file_id'];
                            $inv['fileName'] = $inv['file_name'];
                            $inv['fileType'] = $inv['file_type'];
                            $inv['uploadMode'] = $inv['upload_mode'];
                            $inv['receiverId'] = $inv['receiver_id'];
                            $inv['entryClerkId'] = $inv['entry_clerk_id'];
                            $inv['supplier'] = [
                                'id' => $inv['supplier_id'],
                                'name' => $inv['supplier_name'] ?? 'مورد غير محدد',
                                'phone' => $inv['supplier_phone'] ?? ''
                            ];
                            $inv['receiver'] = $inv['receiver_id'] ? ['id' => $inv['receiver_id'], 'name' => $inv['receiver_name']] : null;
                            $inv['entryClerk'] = $inv['entry_clerk_id'] ? ['id' => $inv['entry_clerk_id'], 'name' => $inv['entry_clerk_name']] : null;

                            jsonResponse(['success' => true, 'invoice' => $inv]);
                        } else {
                            jsonResponse(['success' => false, 'error' => 'الفاتورة غير موجودة'], 404);
                        }
                    }

                    // Invoices List with filters
                    $supplierFilter = trim((string)($_GET['supplierId'] ?? $_GET['supplier_id'] ?? ''));
                    $receiverFilter = trim((string)($_GET['receiverId'] ?? $_GET['receiver_id'] ?? ''));
                    $clerkFilter = trim((string)($_GET['entryClerkId'] ?? $_GET['entry_clerk_id'] ?? ''));
                    $searchFilter = trim((string)($_GET['search'] ?? ''));
                    $startDate = trim((string)($_GET['startDate'] ?? ''));
                    $endDate = trim((string)($_GET['endDate'] ?? ''));

                    $where = ["1=1"];
                    $params = [];

                    if (!empty($supplierFilter)) {
                        $where[] = "i.supplier_id = ?";
                        $params[] = $supplierFilter;
                    }
                    if (!empty($receiverFilter)) {
                        $where[] = "i.receiver_id = ?";
                        $params[] = $receiverFilter;
                    }
                    if (!empty($clerkFilter)) {
                        $where[] = "i.entry_clerk_id = ?";
                        $params[] = $clerkFilter;
                    }
                    if (!empty($startDate)) {
                        $where[] = "i.invoice_date >= ?";
                        $params[] = $startDate . ' 00:00:00';
                    }
                    if (!empty($endDate)) {
                        $where[] = "i.invoice_date <= ?";
                        $params[] = $endDate . ' 23:59:59';
                    }
                    if (!empty($searchFilter)) {
                        $where[] = "(LOWER(i.invoice_number) LIKE LOWER(?) OR LOWER(s.name) LIKE LOWER(?) OR LOWER(COALESCE(i.notes, '')) LIKE LOWER(?))";
                        $searchTerm = "%{$searchFilter}%";
                        $params[] = $searchTerm;
                        $params[] = $searchTerm;
                        $params[] = $searchTerm;
                    }

                    $sql = "SELECT i.*, 
                                   s.name AS supplier_name,
                                   s.phone AS supplier_phone,
                                   r.name AS receiver_name,
                                   c.name AS entry_clerk_name,
                                   (SELECT COUNT(*) FROM archive_invoice_items WHERE invoice_id = i.id) AS items_count
                            FROM archive_invoices i
                            LEFT JOIN archive_suppliers s ON i.supplier_id = s.id
                            LEFT JOIN archive_employees r ON i.receiver_id = r.id
                            LEFT JOIN archive_employees c ON i.entry_clerk_id = c.id
                            WHERE " . implode(" AND ", $where) . "
                            ORDER BY i.invoice_date DESC, i.created_at DESC";

                    $invoices = Database::query($sql, $params);

                    // Attach items & standardize props
                    foreach ($invoices as &$inv) {
                        $invId = $inv['id'];
                        $items = Database::query("SELECT * FROM archive_invoice_items WHERE invoice_id = ? ORDER BY created_at ASC", [$invId]);
                        
                        $inv['items'] = array_map(function($it) {
                            return [
                                'id' => $it['id'],
                                'invoiceId' => $it['invoice_id'],
                                'productName' => $it['product_name'],
                                'quantity' => (int)$it['quantity'],
                                'unitPrice' => (float)$it['unit_price'],
                                'discount' => (float)$it['discount'],
                                'totalPrice' => (float)$it['total_price'],
                                'sellingPrice' => $it['selling_price'] !== null ? (float)$it['selling_price'] : null,
                                'batchNumber' => $it['batch_number'] ?? '',
                                'expiryDate' => $it['expiry_date'] ?? null
                            ];
                        }, $items);

                        $inv['invoiceNumber'] = $inv['invoice_number'];
                        $inv['supplierId'] = $inv['supplier_id'];
                        $inv['invoiceDate'] = $inv['invoice_date'];
                        $inv['totalAmount'] = (float)$inv['total_amount'];
                        $inv['discount'] = (float)$inv['discount'];
                        $inv['netAmount'] = (float)$inv['net_amount'];
                        $inv['fileUrl'] = $inv['file_url'];
                        $inv['driveFileId'] = $inv['drive_file_id'];
                        $inv['fileName'] = $inv['file_name'];
                        $inv['fileType'] = $inv['file_type'];
                        $inv['uploadMode'] = $inv['upload_mode'];
                        $inv['receiverId'] = $inv['receiver_id'];
                        $inv['entryClerkId'] = $inv['entry_clerk_id'];
                        $inv['itemsCount'] = (int)($inv['items_count'] ?? count($inv['items']));
                        $inv['supplier'] = [
                            'id' => $inv['supplier_id'],
                            'name' => $inv['supplier_name'] ?? 'مورد غير محدد',
                            'phone' => $inv['supplier_phone'] ?? ''
                        ];
                        $inv['receiver'] = $inv['receiver_id'] ? ['id' => $inv['receiver_id'], 'name' => $inv['receiver_name']] : null;
                        $inv['entryClerk'] = $inv['entry_clerk_id'] ? ['id' => $inv['entry_clerk_id'], 'name' => $inv['entry_clerk_name']] : null;
                    }

                    jsonResponse(['success' => true, 'invoices' => $invoices, 'count' => count($invoices)]);

                } elseif ($method === 'POST') {
                    // Single invoice save
                    $invoiceId = !empty($requestData['id']) ? (string)$requestData['id'] : generateUuid();
                    $invoiceNumber = trim((string)($requestData['invoiceNumber'] ?? $requestData['invoice_number'] ?? ''));
                    if (empty($invoiceNumber)) $invoiceNumber = 'INV-' . strtoupper(substr(md5(uniqid()), 0, 6));

                    $supplierId = trim((string)($requestData['supplierId'] ?? $requestData['supplier_id'] ?? ''));
                    $supplierName = trim((string)($requestData['supplierName'] ?? $requestData['supplier_name'] ?? ''));

                    if (empty($supplierId) && !empty($supplierName)) {
                        $existingSup = Database::queryOne("SELECT id FROM archive_suppliers WHERE name = ? LIMIT 1", [$supplierName]);
                        if ($existingSup) {
                            $supplierId = $existingSup['id'];
                        } else {
                            $supplierId = generateUuid();
                            Database::execute("INSERT INTO archive_suppliers (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())", [$supplierId, $supplierName]);
                        }
                    } elseif (empty($supplierId)) {
                        $defaultSup = Database::queryOne("SELECT id FROM archive_suppliers LIMIT 1");
                        if ($defaultSup) {
                            $supplierId = $defaultSup['id'];
                        } else {
                            $supplierId = generateUuid();
                            Database::execute("INSERT INTO archive_suppliers (id, name, created_at, updated_at) VALUES (?, 'مورد عام', NOW(), NOW())", [$supplierId]);
                        }
                    }

                    $invoiceDate = !empty($requestData['invoiceDate']) ? (string)$requestData['invoiceDate'] : (!empty($requestData['invoice_date']) ? (string)$requestData['invoice_date'] : date('Y-m-d H:i:s'));
                    $totalAmount = (float)($requestData['totalAmount'] ?? $requestData['total_amount'] ?? $requestData['totalGross'] ?? 0);
                    $discount = (float)($requestData['discount'] ?? $requestData['totalDiscount'] ?? $requestData['total_discount'] ?? 0);
                    $netAmount = (float)($requestData['netAmount'] ?? $requestData['net_amount'] ?? $requestData['totalNet'] ?? ($totalAmount - $discount));
                    $status = (string)($requestData['status'] ?? 'ARCHIVED');
                    $fileUrl = (string)($requestData['fileUrl'] ?? $requestData['file_url'] ?? $requestData['driveViewLink'] ?? '');
                    $driveFileId = (string)($requestData['driveFileId'] ?? $requestData['drive_file_id'] ?? '');
                    $fileName = (string)($requestData['fileName'] ?? $requestData['file_name'] ?? '');
                    $fileType = (string)($requestData['fileType'] ?? $requestData['file_type'] ?? '');
                    $uploadMode = (string)($requestData['uploadMode'] ?? $requestData['upload_mode'] ?? 'AUTO_EXTRACT');
                    $receiverId = !empty($requestData['receiverId']) ? (string)$requestData['receiverId'] : (!empty($requestData['receiver_id']) ? (string)$requestData['receiver_id'] : null);
                    $entryClerkId = !empty($requestData['entryClerkId']) ? (string)$requestData['entryClerkId'] : (!empty($requestData['entry_clerk_id']) ? (string)$requestData['entry_clerk_id'] : null);
                    $notes = (string)($requestData['notes'] ?? '');
                    $items = is_array($requestData['items'] ?? null) ? $requestData['items'] : [];

                    Database::beginTransaction();

                    try {
                        $sqlInv = "INSERT INTO archive_invoices (
                            id, invoice_number, supplier_id, invoice_date, total_amount, discount, net_amount,
                            status, file_url, drive_file_id, file_name, file_type, upload_mode,
                            receiver_id, entry_clerk_id, notes, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";

                        Database::execute($sqlInv, [
                            $invoiceId, $invoiceNumber, $supplierId, $invoiceDate, $totalAmount, $discount, $netAmount,
                            $status, $fileUrl, $driveFileId, $fileName, $fileType, $uploadMode,
                            $receiverId, $entryClerkId, $notes
                        ]);

                        if (!empty($items)) {
                            $sqlItem = "INSERT INTO archive_invoice_items (
                                id, invoice_id, product_name, quantity, unit_price, discount,
                                total_price, selling_price, batch_number, expiry_date, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";

                            foreach ($items as $item) {
                                $itemId = !empty($item['id']) && !str_starts_with((string)$item['id'], 'item_') ? (string)$item['id'] : generateUuid();
                                $prodName = trim((string)($item['productName'] ?? $item['product_name'] ?? $item['item_name'] ?? 'منتج'));
                                $qty = (int)($item['quantity'] ?? 1);
                                $unitPrice = (float)($item['unitPrice'] ?? $item['unit_price'] ?? 0);
                                $itemDisc = (float)($item['discount'] ?? 0);
                                $totalPrice = (float)($item['totalPrice'] ?? $item['total_price'] ?? ($qty * $unitPrice - $itemDisc));
                                $sellingPrice = isset($item['sellingPrice']) && $item['sellingPrice'] !== '' ? (float)$item['sellingPrice'] : (isset($item['selling_price']) && $item['selling_price'] !== '' ? (float)$item['selling_price'] : null);
                                $batchNum = (string)($item['batchNumber'] ?? $item['batch_number'] ?? '');
                                $expiry = !empty($item['expiryDate']) ? (string)$item['expiryDate'] : (!empty($item['expiry_date']) ? (string)$item['expiry_date'] : null);

                                Database::execute($sqlItem, [
                                    $itemId, $invoiceId, $prodName, $qty, $unitPrice, $itemDisc,
                                    $totalPrice, $sellingPrice, $batchNum, $expiry
                                ]);
                            }
                        }

                        Database::commit();
                        jsonResponse(['success' => true, 'message' => 'تم حفظ الفاتورة بنجاح', 'id' => $invoiceId, 'invoice' => ['id' => $invoiceId, 'invoiceNumber' => $invoiceNumber]]);
                    } catch (Throwable $e) {
                        Database::rollback();
                        jsonResponse(['success' => false, 'error' => 'فشل حفظ الفاتورة: ' . $e->getMessage()], 500);
                    }

                } elseif ($method === 'PUT') {
                    // Update invoice
                    $invoiceId = trim((string)($requestData['id'] ?? $action ?? ''));
                    if (empty($invoiceId)) jsonResponse(['success' => false, 'error' => 'Missing invoice ID'], 400);

                    $invoiceNumber = trim((string)($requestData['invoiceNumber'] ?? $requestData['invoice_number'] ?? ''));
                    $supplierId = trim((string)($requestData['supplierId'] ?? $requestData['supplier_id'] ?? ''));
                    $supplierName = trim((string)($requestData['supplierName'] ?? $requestData['supplier_name'] ?? ''));

                    if (empty($supplierId) && !empty($supplierName)) {
                        $existingSup = Database::queryOne("SELECT id FROM archive_suppliers WHERE name = ? LIMIT 1", [$supplierName]);
                        if ($existingSup) {
                            $supplierId = $existingSup['id'];
                        } else {
                            $supplierId = generateUuid();
                            Database::execute("INSERT INTO archive_suppliers (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())", [$supplierId, $supplierName]);
                        }
                    }

                    $invoiceDate = (string)($requestData['invoiceDate'] ?? $requestData['invoice_date'] ?? date('Y-m-d H:i:s'));
                    $totalAmount = (float)($requestData['totalAmount'] ?? $requestData['total_amount'] ?? $requestData['totalGross'] ?? 0);
                    $discount = (float)($requestData['discount'] ?? $requestData['totalDiscount'] ?? $requestData['total_discount'] ?? 0);
                    $netAmount = (float)($requestData['netAmount'] ?? $requestData['net_amount'] ?? $requestData['totalNet'] ?? ($totalAmount - $discount));
                    $status = (string)($requestData['status'] ?? 'ARCHIVED');
                    $receiverId = !empty($requestData['receiverId']) ? (string)$requestData['receiverId'] : (!empty($requestData['receiver_id']) ? (string)$requestData['receiver_id'] : null);
                    $entryClerkId = !empty($requestData['entryClerkId']) ? (string)$requestData['entryClerkId'] : (!empty($requestData['entry_clerk_id']) ? (string)$requestData['entry_clerk_id'] : null);
                    $notes = (string)($requestData['notes'] ?? '');
                    $items = is_array($requestData['items'] ?? null) ? $requestData['items'] : null;

                    Database::beginTransaction();

                    try {
                        $sql = "UPDATE archive_invoices SET
                                invoice_number = ?,
                                supplier_id = ?,
                                invoice_date = ?,
                                total_amount = ?,
                                discount = ?,
                                net_amount = ?,
                                status = ?,
                                receiver_id = ?,
                                entry_clerk_id = ?,
                                notes = ?,
                                updated_at = NOW()
                                WHERE id = ?";

                        Database::execute($sql, [
                            $invoiceNumber, $supplierId, $invoiceDate, $totalAmount, $discount, $netAmount,
                            $status, $receiverId, $entryClerkId, $notes, $invoiceId
                        ]);

                        if ($items !== null) {
                            Database::execute("DELETE FROM archive_invoice_items WHERE invoice_id = ?", [$invoiceId]);

                            $sqlItem = "INSERT INTO archive_invoice_items (
                                id, invoice_id, product_name, quantity, unit_price, discount,
                                total_price, selling_price, batch_number, expiry_date, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";

                            foreach ($items as $item) {
                                $itemId = !empty($item['id']) && !str_starts_with((string)$item['id'], 'item_') ? (string)$item['id'] : generateUuid();
                                $prodName = trim((string)($item['productName'] ?? $item['product_name'] ?? $item['item_name'] ?? 'منتج'));
                                $qty = (int)($item['quantity'] ?? 1);
                                $unitPrice = (float)($item['unitPrice'] ?? $item['unit_price'] ?? 0);
                                $itemDisc = (float)($item['discount'] ?? 0);
                                $totalPrice = (float)($item['totalPrice'] ?? $item['total_price'] ?? ($qty * $unitPrice - $itemDisc));
                                $sellingPrice = isset($item['sellingPrice']) && $item['sellingPrice'] !== '' ? (float)$item['sellingPrice'] : (isset($item['selling_price']) && $item['selling_price'] !== '' ? (float)$item['selling_price'] : null);
                                $batchNum = (string)($item['batchNumber'] ?? $item['batch_number'] ?? '');
                                $expiry = !empty($item['expiryDate']) ? (string)$item['expiryDate'] : (!empty($item['expiry_date']) ? (string)$item['expiry_date'] : null);

                                Database::execute($sqlItem, [
                                    $itemId, $invoiceId, $prodName, $qty, $unitPrice, $itemDisc,
                                    $totalPrice, $sellingPrice, $batchNum, $expiry
                                ]);
                            }
                        }

                        Database::commit();
                        jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الفاتورة بنجاح']);
                    } catch (Throwable $e) {
                        Database::rollback();
                        jsonResponse(['success' => false, 'error' => 'فشل تحديث الفاتورة: ' . $e->getMessage()], 500);
                    }

                } elseif ($method === 'DELETE') {
                    $deleteId = trim((string)($_GET['id'] ?? $action ?? $requestData['id'] ?? ''));
                    if (empty($deleteId)) jsonResponse(['success' => false, 'error' => 'Missing invoice ID'], 400);

                    Database::execute("DELETE FROM archive_invoice_items WHERE invoice_id = ?", [$deleteId]);
                    Database::execute("DELETE FROM archive_invoices WHERE id = ?", [$deleteId]);

                    jsonResponse(['success' => true, 'message' => 'تم حذف الفاتورة بنجاح']);
                }
                break;

            // =================================================================
            // 3. الموردين وتعيين الأعمدة (Suppliers & Column Mappings)
            // =================================================================
            case 'suppliers':
                if ($action === 'mappings') {
                    if ($method === 'GET') {
                        $supplierId = trim((string)($_GET['supplierId'] ?? $_GET['supplier_id'] ?? ''));
                        if (empty($supplierId)) jsonResponse(['success' => false, 'error' => 'Missing supplier ID'], 400);

                        $mappings = Database::query("SELECT * FROM archive_column_mappings WHERE supplier_id = ?", [$supplierId]);
                        
                        $formatted = array_map(function($m) {
                            return [
                                'id' => $m['id'],
                                'supplierId' => $m['supplier_id'],
                                'rawColumnName' => $m['raw_column_name'],
                                'standardField' => $m['standard_field']
                            ];
                        }, $mappings);

                        jsonResponse(['success' => true, 'mappings' => $formatted]);

                    } elseif ($method === 'POST') {
                        $supplierId = trim((string)($requestData['supplierId'] ?? $requestData['supplier_id'] ?? ''));
                        $mappings = is_array($requestData['mappings'] ?? null) ? $requestData['mappings'] : [];

                        if (empty($supplierId)) jsonResponse(['success' => false, 'error' => 'Missing supplier ID'], 400);

                        Database::execute("DELETE FROM archive_column_mappings WHERE supplier_id = ?", [$supplierId]);

                        $sql = "INSERT INTO archive_column_mappings (id, supplier_id, raw_column_name, standard_field, created_at, updated_at)
                                VALUES (?, ?, ?, ?, NOW(), NOW())";

                        foreach ($mappings as $m) {
                            $raw = trim((string)($m['rawColumnName'] ?? $m['raw_column_name'] ?? ''));
                            $std = trim((string)($m['standardField'] ?? $m['standard_field'] ?? ''));
                            if (!empty($raw) && !empty($std)) {
                                $mapId = generateUuid();
                                Database::execute($sql, [$mapId, $supplierId, $raw, $std]);
                            }
                        }

                        jsonResponse(['success' => true, 'message' => 'تم حفظ تعيين ومطابقة الأعمدة بنجاح']);
                    }
                    break;
                }

                if ($method === 'GET') {
                    $supplierId = trim((string)($_GET['id'] ?? $action ?? ''));

                    if (!empty($supplierId) && $supplierId !== 'suppliers') {
                        $supplier = Database::queryOne("SELECT * FROM archive_suppliers WHERE id = ? LIMIT 1", [$supplierId]);
                        if ($supplier) {
                            $mappings = Database::query("SELECT * FROM archive_column_mappings WHERE supplier_id = ?", [$supplierId]);
                            $invoices = Database::query("SELECT * FROM archive_invoices WHERE supplier_id = ? ORDER BY invoice_date DESC", [$supplierId]);
                            
                            $supplier['columnMappings'] = array_map(function($m) {
                                return [
                                    'id' => $m['id'],
                                    'supplierId' => $m['supplier_id'],
                                    'rawColumnName' => $m['raw_column_name'],
                                    'standardField' => $m['standard_field']
                                ];
                            }, $mappings);

                            $supplier['invoices'] = array_map(function($inv) {
                                return [
                                    'id' => $inv['id'],
                                    'invoiceNumber' => $inv['invoice_number'],
                                    'invoiceDate' => $inv['invoice_date'],
                                    'totalAmount' => (float)$inv['total_amount'],
                                    'discount' => (float)$inv['discount'],
                                    'netAmount' => (float)$inv['net_amount'],
                                    'status' => $inv['status'],
                                    'fileUrl' => $inv['file_url']
                                ];
                            }, $invoices);

                            $supplier['metrics'] = [
                                'totalInvoicesCount' => count($invoices),
                                'totalSpending' => array_reduce($invoices, fn($acc, $i) => $acc + (float)$i['net_amount'], 0)
                            ];

                            jsonResponse(['success' => true, 'supplier' => $supplier]);
                        } else {
                            jsonResponse(['success' => false, 'error' => 'المورد غير موجود'], 404);
                        }
                    }

                    $suppliers = Database::query(
                        "SELECT s.*, 
                                (SELECT COUNT(*) FROM archive_invoices WHERE supplier_id = s.id) AS invoices_count,
                                (SELECT COALESCE(SUM(net_amount), 0) FROM archive_invoices WHERE supplier_id = s.id) AS total_invoiced
                         FROM archive_suppliers s
                         ORDER BY s.name ASC"
                    );

                    jsonResponse(['success' => true, 'suppliers' => $suppliers]);

                } elseif ($method === 'POST') {
                    $id = !empty($requestData['id']) ? (string)$requestData['id'] : generateUuid();
                    $name = trim((string)($requestData['name'] ?? ''));
                    $phone = (string)($requestData['phone'] ?? '');
                    $email = (string)($requestData['email'] ?? '');
                    $address = (string)($requestData['address'] ?? '');
                    $taxNumber = (string)($requestData['taxNumber'] ?? $requestData['tax_number'] ?? '');
                    $notes = (string)($requestData['notes'] ?? '');

                    if (empty($name)) jsonResponse(['success' => false, 'error' => 'اسم المورد مطلوب'], 400);

                    if (in_array($driver, ['pgsql', 'sqlite'], true)) {
                        $sql = "INSERT INTO archive_suppliers (id, name, phone, email, address, tax_number, notes, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                                ON CONFLICT (name) DO UPDATE 
                                SET phone = EXCLUDED.phone, 
                                    email = EXCLUDED.email, 
                                    address = EXCLUDED.address, 
                                    tax_number = EXCLUDED.tax_number, 
                                    notes = EXCLUDED.notes, 
                                    updated_at = NOW()";
                    } else {
                        $sql = "INSERT INTO archive_suppliers (id, name, phone, email, address, tax_number, notes, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                                ON DUPLICATE KEY UPDATE 
                                    phone = VALUES(phone), 
                                    email = VALUES(email), 
                                    address = VALUES(address), 
                                    tax_number = VALUES(tax_number), 
                                    notes = VALUES(notes), 
                                    updated_at = NOW()";
                    }

                    Database::execute($sql, [$id, $name, $phone, $email, $address, $taxNumber, $notes]);

                    jsonResponse(['success' => true, 'message' => 'تم حفظ المورد بنجاح', 'id' => $id, 'supplier' => ['id' => $id, 'name' => $name]]);

                } elseif ($method === 'PUT') {
                    $id = trim((string)($requestData['id'] ?? $action ?? ''));
                    $name = trim((string)($requestData['name'] ?? ''));
                    $phone = (string)($requestData['phone'] ?? '');
                    $email = (string)($requestData['email'] ?? '');
                    $address = (string)($requestData['address'] ?? '');
                    $taxNumber = (string)($requestData['taxNumber'] ?? $requestData['tax_number'] ?? '');
                    $notes = (string)($requestData['notes'] ?? '');

                    if (empty($id) || empty($name)) jsonResponse(['success' => false, 'error' => 'البيانات غير مكتملة'], 400);

                    $sql = "UPDATE archive_suppliers SET name = ?, phone = ?, email = ?, address = ?, tax_number = ?, notes = ?, updated_at = NOW() WHERE id = ?";
                    Database::execute($sql, [$name, $phone, $email, $address, $taxNumber, $notes, $id]);

                    jsonResponse(['success' => true, 'message' => 'تم تعديل بيانات المورد بنجاح']);

                } elseif ($method === 'DELETE') {
                    $id = trim((string)($_GET['id'] ?? $action ?? $requestData['id'] ?? ''));
                    if (empty($id)) jsonResponse(['success' => false, 'error' => 'Missing ID'], 400);

                    Database::execute("DELETE FROM archive_column_mappings WHERE supplier_id = ?", [$id]);
                    Database::execute("DELETE FROM archive_suppliers WHERE id = ?", [$id]);
                    jsonResponse(['success' => true, 'message' => 'تم حذف المورد بنجاح']);
                }
                break;

            // =================================================================
            // 4. موظفو الأرشيف (Employees Endpoints)
            // =================================================================
            case 'employees':
                if (!empty($action) && $subAction === 'invoices' && $method === 'GET') {
                    $empId = $action;
                    $received = Database::query("SELECT * FROM archive_invoices WHERE receiver_id = ? ORDER BY invoice_date DESC", [$empId]);
                    $entered = Database::query("SELECT * FROM archive_invoices WHERE entry_clerk_id = ? ORDER BY invoice_date DESC", [$empId]);

                    jsonResponse([
                        'success' => true,
                        'receivedInvoices' => $received,
                        'enteredInvoices' => $entered
                    ]);
                }

                if ($method === 'GET') {
                    $employees = Database::query(
                        "SELECT e.*,
                                (SELECT COUNT(*) FROM archive_invoices WHERE receiver_id = e.id) AS received_count,
                                (SELECT COUNT(*) FROM archive_invoices WHERE entry_clerk_id = e.id) AS entered_count
                         FROM archive_employees e
                         ORDER BY e.name ASC"
                    );
                    jsonResponse(['success' => true, 'employees' => $employees]);

                } elseif ($method === 'POST') {
                    $id = !empty($requestData['id']) ? (string)$requestData['id'] : generateUuid();
                    $name = trim((string)($requestData['name'] ?? ''));
                    $role = (string)($requestData['role'] ?? 'أمين مخزن');
                    $phone = (string)($requestData['phone'] ?? '');
                    $active = isset($requestData['active']) ? (int)(bool)$requestData['active'] : 1;

                    if (empty($name)) jsonResponse(['success' => false, 'error' => 'اسم الموظف مطلوب'], 400);

                    if (in_array($driver, ['pgsql', 'sqlite'], true)) {
                        $sql = "INSERT INTO archive_employees (id, name, role, phone, active, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, NOW(), NOW())
                                ON CONFLICT (name) DO UPDATE 
                                SET role = EXCLUDED.role, 
                                    phone = EXCLUDED.phone, 
                                    active = EXCLUDED.active, 
                                    updated_at = NOW()";
                    } else {
                        $sql = "INSERT INTO archive_employees (id, name, role, phone, active, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, NOW(), NOW())
                                ON DUPLICATE KEY UPDATE 
                                    role = VALUES(role), 
                                    phone = VALUES(phone), 
                                    active = VALUES(active), 
                                    updated_at = NOW()";
                    }

                    Database::execute($sql, [$id, $name, $role, $phone, $active]);
                    jsonResponse(['success' => true, 'message' => 'تم حفظ الموظف بنجاح', 'id' => $id]);

                } elseif ($method === 'PUT') {
                    $id = trim((string)($requestData['id'] ?? $action ?? ''));
                    $name = trim((string)($requestData['name'] ?? ''));
                    $role = (string)($requestData['role'] ?? 'أمين مخزن');
                    $phone = (string)($requestData['phone'] ?? '');
                    $active = isset($requestData['active']) ? (int)(bool)$requestData['active'] : 1;

                    if (empty($id) || empty($name)) jsonResponse(['success' => false, 'error' => 'البيانات غير مكتملة'], 400);

                    $sql = "UPDATE archive_employees SET name = ?, role = ?, phone = ?, active = ?, updated_at = NOW() WHERE id = ?";
                    Database::execute($sql, [$name, $role, $phone, $active, $id]);

                    jsonResponse(['success' => true, 'message' => 'تم تحديث الموظف بنجاح']);

                } elseif ($method === 'DELETE') {
                    $id = trim((string)($_GET['id'] ?? $action ?? $requestData['id'] ?? ''));
                    if (empty($id)) jsonResponse(['success' => false, 'error' => 'Missing ID'], 400);

                    Database::execute("DELETE FROM archive_employees WHERE id = ?", [$id]);
                    jsonResponse(['success' => true, 'message' => 'تم حذف الموظف بنجاح']);
                }
                break;

            // =================================================================
            // 5. الإعدادات وتكامل Google Drive (Settings)
            // =================================================================
            case 'settings':
                if ($action === 'google-status' && $method === 'GET') {
                    $folderId = getArchiveSetting('GOOGLE_DRIVE_FOLDER_ID', '');
                    jsonResponse([
                        'success' => true,
                        'connected' => !empty($folderId),
                        'folderId' => $folderId
                    ]);
                }

                if ($method === 'GET') {
                    $rows = Database::query("SELECT key_name, value_data FROM archive_system_settings");
                    $settings = [];
                    foreach ($rows as $r) {
                        $settings[$r['key_name']] = $r['value_data'];
                    }

                    if (isset($settings['ADMIN_PASSWORD'])) {
                        $settings['ADMIN_PASSWORD_SET'] = !empty($settings['ADMIN_PASSWORD']);
                        unset($settings['ADMIN_PASSWORD']);
                    }

                    jsonResponse(['success' => true, 'settings' => $settings]);

                } elseif ($method === 'POST') {
                    foreach ($requestData as $key => $val) {
                        if ($key === 'ADMIN_PASSWORD' && empty($val)) continue;
                        setArchiveSetting((string)$key, (string)$val);
                    }

                    jsonResponse(['success' => true, 'message' => 'تم حفظ الإعدادات بنجاح']);
                }
                break;

            // =================================================================
            // 6. رفع الملفات التخزينية المباشرة (File Upload)
            // =================================================================
            case 'upload':
                if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);

                $uploadDir = __DIR__ . '/../uploads/archive/';
                if (!is_dir($uploadDir)) {
                    @mkdir($uploadDir, 0755, true);
                }

                // إنشاء ملف .htaccess لحماية مجلد الرفع من تنفيذ أي نصوص برمجية
                $htaccessPath = $uploadDir . '.htaccess';
                if (!file_exists($htaccessPath)) {
                    @file_put_contents($htaccessPath, "<FilesMatch \"(?i)\\.(php|phtml|php3|php4|php5|php7|php8|phar|inc|pl|py|cgi|sh|bash|exe|bat|cmd|dll|htc|shtml)$\">\n    Order Allow,Deny\n    Deny from all\n</FilesMatch>\n<IfModule mod_php.c>\n    php_flag engine off\n</IfModule>\n<IfModule mod_php7.c>\n    php_flag engine off\n</IfModule>\n<IfModule mod_php8.c>\n    php_flag engine off\n</IfModule>\nOptions -ExecCGI\n");
                }

                $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'xlsx', 'xls', 'csv', 'txt'];
                $maxSizeBytes = 25 * 1024 * 1024; // 25 MB

                if (!empty($_FILES['file'])) {
                    $file = $_FILES['file'];
                    if ($file['error'] !== UPLOAD_ERR_OK) {
                        jsonResponse(['success' => false, 'error' => 'فشل رفع الملف'], 400);
                    }

                    if ($file['size'] > $maxSizeBytes) {
                        jsonResponse(['success' => false, 'error' => 'حجم الملف يتجاوز الحد المسموح (25 ميجابايت)'], 400);
                    }

                    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                    if (!in_array($ext, $allowedExtensions, true)) {
                        jsonResponse(['success' => false, 'error' => 'نوع الملف غير مدعوم أو غير آمن. يسمح فقط بالصور والمستندات (PDF, Excel, Images)'], 400);
                    }

                    $safeName = 'inv_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
                    $target = $uploadDir . $safeName;

                    if (move_uploaded_file($file['tmp_name'], $target)) {
                        $fileUrl = '/uploads/archive/' . $safeName;
                        jsonResponse([
                            'success' => true,
                            'fileUrl' => $fileUrl,
                            'fileName' => htmlspecialchars($file['name'], ENT_QUOTES, 'UTF-8'),
                            'fileType' => $file['type']
                        ]);
                    } else {
                        jsonResponse(['success' => false, 'error' => 'فشل حفظ الملف على الخادم'], 500);
                    }
                }

                if (!empty($requestData['base64'])) {
                    $base64 = (string)$requestData['base64'];
                    $fileName = (string)($requestData['fileName'] ?? 'invoice_' . time() . '.png');
                    $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION) ?: 'png');

                    if (!in_array($ext, $allowedExtensions, true)) {
                        jsonResponse(['success' => false, 'error' => 'نوع الملف المرفوع عبر Base64 غير مسموح'], 400);
                    }

                    $safeName = 'inv_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
                    $target = $uploadDir . $safeName;

                    $data = preg_replace('#^data:[^;]+;base64,#i', '', $base64);
                    $data = base64_decode($data, true);

                    if ($data === false) {
                        jsonResponse(['success' => false, 'error' => 'ترميز ملف Base64 غير صالح'], 400);
                    }

                    if (strlen($data) > $maxSizeBytes) {
                        jsonResponse(['success' => false, 'error' => 'حجم الملف يتجاوز الحد المسموح (25 ميجابايت)'], 400);
                    }

                    if (file_put_contents($target, $data)) {
                        $fileUrl = '/uploads/archive/' . $safeName;
                        jsonResponse([
                            'success' => true,
                            'fileUrl' => $fileUrl,
                            'fileName' => htmlspecialchars($fileName, ENT_QUOTES, 'UTF-8')
                        ]);
                    }
                }

                jsonResponse(['success' => false, 'error' => 'لا يوجد ملف مرفوع'], 400);
                break;

            default:
                jsonResponse(['success' => false, 'error' => "Unknown archive endpoint: {$subPath}"], 404);
                break;
        }
    } catch (Throwable $e) {
        error_log('[Archive API Error] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
        jsonResponse([
            'success' => false,
            'error' => 'حدث خطأ أثناء معالجة الطلب في خادم الأرشيف'
        ], 500);
    }
}

// استدعاء المعالج إذا تم استدعاؤه كملف مستقل مباشرة وليس عبر index.php
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'archive.php') {
    require_once __DIR__ . '/config.php';
    require_once __DIR__ . '/db.php';
    $reqEndpoint = $_GET['endpoint'] ?? '';
    if (empty($reqEndpoint)) {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '';
        if (preg_match('#/archive(?:/archive\.php)?/([^?]+)#', $path, $matches)) {
            $reqEndpoint = 'archive/' . trim($matches[1], '/');
        }
    }
    $sub = str_starts_with($reqEndpoint, 'archive/') ? substr($reqEndpoint, 8) : $reqEndpoint;
    handleArchiveApi($sub, $_SERVER['REQUEST_METHOD'] ?? 'GET');
}
