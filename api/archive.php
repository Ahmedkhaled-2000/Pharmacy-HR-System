<?php
/**
 * Archive System API Handler for Pharmacy HR System
 * Handles Authentication, Invoices, Suppliers, Employees, Settings, Mappings
 * MariaDB 10.11+ via mysqli with Prepared Statements
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
        'exp' => time() + (14 * 24 * 60 * 60) // 14 days
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
 * جلب قيمة من إعدادات الأرشيف
 */
function getArchiveSetting(string $key, string $default = ''): string
{
    $row = Database::queryOne("SELECT `value_data` FROM `archive_system_settings` WHERE `key_name` = ? LIMIT 1", "s", [$key]);
    return $row ? (string)$row['value_data'] : $default;
}

/**
 * حفظ قيمة في إعدادات الأرشيف
 */
function setArchiveSetting(string $key, string $value): void
{
    $sql = "INSERT INTO `archive_system_settings` (`key_name`, `value_data`, `updated_at`)
            VALUES (?, ?, NOW(6))
            ON DUPLICATE KEY UPDATE `value_data` = VALUES(`value_data`), `updated_at` = NOW(6)";
    Database::execute($sql, "ss", [$key, $value]);
}

/**
 * المعالج الرئيسي لطلبات الأرشيف
 */
function handleArchiveApi(string $subPath, string $method): void
{
    $requestData = getRequestData();

    switch ($subPath) {
        // =====================================================================
        // 1. المصادقة وتسجيل الدخول المستقل (Authentication)
        // =====================================================================
        case 'auth/login':
            if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);

            $username = trim((string)($requestData['username'] ?? ''));
            $password = trim((string)($requestData['password'] ?? ''));

            $dbUser = getArchiveSetting('ADMIN_USERNAME', 'admin');
            $dbPass = getArchiveSetting('ADMIN_PASSWORD', '123456');

            if ($username === $dbUser && $password === $dbPass) {
                $token = createArchiveToken($username);
                jsonResponse([
                    'success' => true,
                    'message' => 'تم تسجيل الدخول بنجاح إلى أرشيف الصيدلية',
                    'token' => $token,
                    'username' => $username,
                    'pharmacyName' => getArchiveSetting('PHARMACY_NAME', 'صيدليات مداواة')
                ]);
            } else {
                jsonResponse(['success' => false, 'error' => 'اسم المستخدم أو كلمة المرور غير صحيحة'], 401);
            }
            break;

        case 'auth/session':
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
            $token = '';
            if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                $token = $matches[1];
            } elseif (!empty($_GET['token'])) {
                $token = (string)$_GET['token'];
            }

            $session = verifyArchiveToken($token);
            if ($session) {
                jsonResponse([
                    'success' => true,
                    'authenticated' => true,
                    'username' => $session['username'],
                    'pharmacyName' => getArchiveSetting('PHARMACY_NAME', 'صيدليات مداواة')
                ]);
            } else {
                jsonResponse(['success' => false, 'authenticated' => false, 'error' => 'انتهت صلاحية الجلسة'], 401);
            }
            break;

        case 'auth/change-credentials':
            if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);

            $currentPass = (string)($requestData['currentPassword'] ?? '');
            $newUsername = trim((string)($requestData['newUsername'] ?? ''));
            $newPassword = trim((string)($requestData['newPassword'] ?? ''));

            $dbPass = getArchiveSetting('ADMIN_PASSWORD', '123456');
            if ($currentPass !== $dbPass) {
                jsonResponse(['success' => false, 'error' => 'كلمة المرور الحالية غير صحيحة'], 400);
            }

            if (!empty($newUsername)) setArchiveSetting('ADMIN_USERNAME', $newUsername);
            if (!empty($newPassword)) setArchiveSetting('ADMIN_PASSWORD', $newPassword);

            jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الدخول بنجاح']);
            break;

        // =====================================================================
        // 2. الفواتير والبنود (Invoices & Items)
        // =====================================================================
        case 'invoices':
            if ($method === 'GET') {
                $query = trim((string)($_GET['q'] ?? ''));
                $supplierId = trim((string)($_GET['supplierId'] ?? ''));
                $receiverId = trim((string)($_GET['receiverId'] ?? ''));
                $entryClerkId = trim((string)($_GET['entryClerkId'] ?? ''));
                $startDate = trim((string)($_GET['startDate'] ?? ''));
                $endDate = trim((string)($_GET['endDate'] ?? ''));
                $invoiceId = trim((string)($_GET['id'] ?? ''));

                // جلب فاتورة واحدة تفصيلية إذا تم تمرير id
                if (!empty($invoiceId)) {
                    $inv = Database::queryOne(
                        "SELECT inv.*, 
                                s.name AS supplier_name, s.phone AS supplier_phone,
                                r.name AS receiver_name,
                                c.name AS entry_clerk_name
                         FROM `archive_invoices` inv
                         LEFT JOIN `archive_suppliers` s ON inv.supplier_id = s.id
                         LEFT JOIN `archive_employees` r ON inv.receiver_id = r.id
                         LEFT JOIN `archive_employees` c ON inv.entry_clerk_id = c.id
                         WHERE inv.id = ? LIMIT 1",
                        "s",
                        [$invoiceId]
                    );

                    if ($inv) {
                        $items = Database::query(
                            "SELECT * FROM `archive_invoice_items` WHERE `invoice_id` = ? ORDER BY `created_at` ASC",
                            "s",
                            [$invoiceId]
                        );
                        $inv['items'] = $items;
                        $inv['supplier'] = ['id' => $inv['supplier_id'], 'name' => $inv['supplier_name'], 'phone' => $inv['supplier_phone']];
                        $inv['receiver'] = $inv['receiver_id'] ? ['id' => $inv['receiver_id'], 'name' => $inv['receiver_name']] : null;
                        $inv['entryClerk'] = $inv['entry_clerk_id'] ? ['id' => $inv['entry_clerk_id'], 'name' => $inv['entry_clerk_name']] : null;
                        jsonResponse(['success' => true, 'invoice' => $inv]);
                    } else {
                        jsonResponse(['success' => false, 'error' => 'الفاتورة غير موجودة'], 404);
                    }
                }

                // جلب جميع الفواتير
                $sql = "SELECT inv.*, 
                               s.name AS supplier_name, s.phone AS supplier_phone,
                               r.name AS receiver_name,
                               c.name AS entry_clerk_name,
                               (SELECT COUNT(*) FROM `archive_invoice_items` WHERE `invoice_id` = inv.id) AS items_count
                        FROM `archive_invoices` inv
                        LEFT JOIN `archive_suppliers` s ON inv.supplier_id = s.id
                        LEFT JOIN `archive_employees` r ON inv.receiver_id = r.id
                        LEFT JOIN `archive_employees` c ON inv.entry_clerk_id = c.id
                        WHERE 1=1";
                $types = "";
                $params = [];

                if (!empty($supplierId)) {
                    $sql .= " AND inv.supplier_id = ?";
                    $types .= "s";
                    $params[] = $supplierId;
                }
                if (!empty($receiverId)) {
                    $sql .= " AND inv.receiver_id = ?";
                    $types .= "s";
                    $params[] = $receiverId;
                }
                if (!empty($entryClerkId)) {
                    $sql .= " AND inv.entry_clerk_id = ?";
                    $types .= "s";
                    $params[] = $entryClerkId;
                }
                if (!empty($startDate)) {
                    $sql .= " AND inv.invoice_date >= ?";
                    $types .= "s";
                    $params[] = $startDate . " 00:00:00";
                }
                if (!empty($endDate)) {
                    $sql .= " AND inv.invoice_date <= ?";
                    $types .= "s";
                    $params[] = $endDate . " 23:59:59";
                }

                $sql .= " ORDER BY inv.invoice_date DESC, inv.created_at DESC";

                $invoices = Database::query($sql, $types, $params);

                // جلب كافة البنود دفعة واحدة لتسريع استعراض الفواتير والبحث
                $allInvoiceIds = array_column($invoices, 'id');
                $itemsByInvoice = [];
                if (!empty($allInvoiceIds)) {
                    $placeholders = implode(',', array_fill(0, count($allInvoiceIds), '?'));
                    $itemTypes = str_repeat('s', count($allInvoiceIds));
                    $allItems = Database::query(
                        "SELECT * FROM `archive_invoice_items` WHERE `invoice_id` IN ($placeholders)",
                        $itemTypes,
                        $allInvoiceIds
                    );
                    foreach ($allItems as $it) {
                        $itemsByInvoice[$it['invoice_id']][] = $it;
                    }
                }

                foreach ($invoices as &$inv) {
                    $inv['items'] = $itemsByInvoice[$inv['id']] ?? [];
                    $inv['supplier'] = ['id' => $inv['supplier_id'], 'name' => $inv['supplier_name'], 'phone' => $inv['supplier_phone']];
                    $inv['receiver'] = $inv['receiver_id'] ? ['id' => $inv['receiver_id'], 'name' => $inv['receiver_name']] : null;
                    $inv['entryClerk'] = $inv['entry_clerk_id'] ? ['id' => $inv['entry_clerk_id'], 'name' => $inv['entry_clerk_name']] : null;
                    $inv['totalAmount'] = (float)$inv['total_amount'];
                    $inv['discount'] = (float)$inv['discount'];
                    $inv['netAmount'] = (float)$inv['net_amount'];
                    $inv['invoiceNumber'] = $inv['invoice_number'];
                    $inv['invoiceDate'] = $inv['invoice_date'];
                    $inv['supplierId'] = $inv['supplier_id'];
                    $inv['receiverId'] = $inv['receiver_id'];
                    $inv['entryClerkId'] = $inv['entry_clerk_id'];
                    $inv['fileUrl'] = $inv['file_url'];
                    $inv['fileName'] = $inv['file_name'];
                    $inv['fileType'] = $inv['file_type'];
                    $inv['uploadMode'] = $inv['upload_mode'];
                }
                unset($inv);

                // فلترة البحث اللحظي
                if (!empty($query)) {
                    $q = mb_strtolower($query, 'UTF-8');
                    $invoices = array_values(array_filter($invoices, function($inv) use ($q) {
                        if (stripos($inv['invoice_number'] ?? '', $q) !== false) return true;
                        if (stripos($inv['supplier_name'] ?? '', $q) !== false) return true;
                        if (stripos($inv['notes'] ?? '', $q) !== false) return true;
                        if (!empty($inv['items'])) {
                            foreach ($inv['items'] as $item) {
                                if (stripos($item['product_name'] ?? '', $q) !== false) return true;
                                if (stripos($item['batch_number'] ?? '', $q) !== false) return true;
                            }
                        }
                        return false;
                    }));
                }

                jsonResponse(['success' => true, 'invoices' => $invoices, 'count' => count($invoices)]);

            } elseif ($method === 'POST') {
                // حفظ فاتورة جديدة
                $invoiceId = !empty($requestData['id']) ? (string)$requestData['id'] : generateUuid();
                $invoiceNumber = trim((string)($requestData['invoiceNumber'] ?? ''));
                $supplierId = trim((string)($requestData['supplierId'] ?? ''));
                $supplierName = trim((string)($requestData['supplierName'] ?? ''));
                $invoiceDate = !empty($requestData['invoiceDate']) ? (string)$requestData['invoiceDate'] : date('Y-m-d H:i:s');
                $totalAmount = (float)($requestData['totalAmount'] ?? 0);
                $discount = (float)($requestData['discount'] ?? 0);
                $netAmount = (float)($requestData['netAmount'] ?? ($totalAmount - $discount));
                $status = (string)($requestData['status'] ?? 'ARCHIVED');
                $fileUrl = (string)($requestData['fileUrl'] ?? '');
                $driveFileId = (string)($requestData['driveFileId'] ?? '');
                $fileName = (string)($requestData['fileName'] ?? '');
                $fileType = (string)($requestData['fileType'] ?? '');
                $uploadMode = (string)($requestData['uploadMode'] ?? 'AUTO_EXTRACT');
                $receiverId = !empty($requestData['receiverId']) ? (string)$requestData['receiverId'] : null;
                $entryClerkId = !empty($requestData['entryClerkId']) ? (string)$requestData['entryClerkId'] : null;
                $notes = (string)($requestData['notes'] ?? '');
                $items = is_array($requestData['items'] ?? null) ? $requestData['items'] : [];

                if (empty($invoiceNumber)) {
                    $invoiceNumber = 'INV-' . strtoupper(substr(md5(uniqid()), 0, 6));
                }

                // التحقق من المورد أو إنشائه تلقائياً
                if (empty($supplierId) && !empty($supplierName)) {
                    $existingSup = Database::queryOne("SELECT `id` FROM `archive_suppliers` WHERE `name` = ? LIMIT 1", "s", [$supplierName]);
                    if ($existingSup) {
                        $supplierId = $existingSup['id'];
                    } else {
                        $supplierId = generateUuid();
                        Database::execute("INSERT INTO `archive_suppliers` (`id`, `name`) VALUES (?, ?)", "ss", [$supplierId, $supplierName]);
                    }
                } elseif (empty($supplierId)) {
                    $defaultSup = Database::queryOne("SELECT `id` FROM `archive_suppliers` LIMIT 1");
                    if ($defaultSup) {
                        $supplierId = $defaultSup['id'];
                    } else {
                        $supplierId = generateUuid();
                        Database::execute("INSERT INTO `archive_suppliers` (`id`, `name`) VALUES (?, 'مورد عام')", "s", [$supplierId]);
                    }
                }

                $db = Database::getConnection();
                $db->begin_transaction();

                try {
                    $sqlInv = "INSERT INTO `archive_invoices` (
                        `id`, `invoice_number`, `supplier_id`, `invoice_date`, `total_amount`, `discount`, `net_amount`,
                        `status`, `file_url`, `drive_file_id`, `file_name`, `file_type`, `upload_mode`,
                        `receiver_id`, `entry_clerk_id`, `notes`, `created_at`, `updated_at`
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))";

                    Database::execute($sqlInv, "ssssdddsssssssss", [
                        $invoiceId, $invoiceNumber, $supplierId, $invoiceDate, $totalAmount, $discount, $netAmount,
                        $status, $fileUrl, $driveFileId, $fileName, $fileType, $uploadMode,
                        $receiverId, $entryClerkId, $notes
                    ]);

                    if (!empty($items)) {
                        $sqlItem = "INSERT INTO `archive_invoice_items` (
                            `id`, `invoice_id`, `product_name`, `quantity`, `unit_price`, `discount`,
                            `total_price`, `selling_price`, `batch_number`, `expiry_date`, `created_at`, `updated_at`
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))";

                        foreach ($items as $item) {
                            $itemId = !empty($item['id']) ? (string)$item['id'] : generateUuid();
                            $prodName = trim((string)($item['productName'] ?? $item['product_name'] ?? 'منتج'));
                            $qty = (int)($item['quantity'] ?? 1);
                            $unitPrice = (float)($item['unitPrice'] ?? $item['unit_price'] ?? 0);
                            $itemDisc = (float)($item['discount'] ?? 0);
                            $totalPrice = (float)($item['totalPrice'] ?? $item['total_price'] ?? ($qty * $unitPrice - $itemDisc));
                            $sellingPrice = isset($item['sellingPrice']) && $item['sellingPrice'] !== '' ? (float)$item['sellingPrice'] : (isset($item['selling_price']) ? (float)$item['selling_price'] : null);
                            $batchNum = (string)($item['batchNumber'] ?? $item['batch_number'] ?? '');
                            $expiry = !empty($item['expiryDate']) ? (string)$item['expiryDate'] : (!empty($item['expiry_date']) ? (string)$item['expiry_date'] : null);

                            Database::execute($sqlItem, "sssiddssdss", [
                                $itemId, $invoiceId, $prodName, $qty, $unitPrice, $itemDisc,
                                $totalPrice, $sellingPrice, $batchNum, $expiry
                            ]);
                        }
                    }

                    $db->commit();
                    jsonResponse(['success' => true, 'message' => 'تم حفظ الفاتورة بنجاح', 'id' => $invoiceId]);
                } catch (Throwable $e) {
                    $db->rollback();
                    jsonResponse(['success' => false, 'error' => 'فشل حفظ الفاتورة: ' . $e->getMessage()], 500);
                }

            } elseif ($method === 'PUT') {
                $invoiceId = trim((string)($requestData['id'] ?? ''));
                if (empty($invoiceId)) jsonResponse(['success' => false, 'error' => 'Missing invoice ID'], 400);

                $invoiceNumber = trim((string)($requestData['invoiceNumber'] ?? ''));
                $supplierId = trim((string)($requestData['supplierId'] ?? ''));
                $invoiceDate = (string)($requestData['invoiceDate'] ?? date('Y-m-d H:i:s'));
                $totalAmount = (float)($requestData['totalAmount'] ?? 0);
                $discount = (float)($requestData['discount'] ?? 0);
                $netAmount = (float)($requestData['netAmount'] ?? ($totalAmount - $discount));
                $status = (string)($requestData['status'] ?? 'ARCHIVED');
                $receiverId = !empty($requestData['receiverId']) ? (string)$requestData['receiverId'] : null;
                $entryClerkId = !empty($requestData['entryClerkId']) ? (string)$requestData['entryClerkId'] : null;
                $notes = (string)($requestData['notes'] ?? '');
                $items = is_array($requestData['items'] ?? null) ? $requestData['items'] : null;

                $db = Database::getConnection();
                $db->begin_transaction();

                try {
                    $sql = "UPDATE `archive_invoices` SET
                            `invoice_number` = ?,
                            `supplier_id` = ?,
                            `invoice_date` = ?,
                            `total_amount` = ?,
                            `discount` = ?,
                            `net_amount` = ?,
                            `status` = ?,
                            `receiver_id` = ?,
                            `entry_clerk_id` = ?,
                            `notes` = ?,
                            `updated_at` = NOW(6)
                            WHERE `id` = ?";

                    Database::execute($sql, "sssdddsssss", [
                        $invoiceNumber, $supplierId, $invoiceDate, $totalAmount, $discount, $netAmount,
                        $status, $receiverId, $entryClerkId, $notes, $invoiceId
                    ]);

                    if ($items !== null) {
                        Database::execute("DELETE FROM `archive_invoice_items` WHERE `invoice_id` = ?", "s", [$invoiceId]);

                        $sqlItem = "INSERT INTO `archive_invoice_items` (
                            `id`, `invoice_id`, `product_name`, `quantity`, `unit_price`, `discount`,
                            `total_price`, `selling_price`, `batch_number`, `expiry_date`, `created_at`, `updated_at`
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))";

                        foreach ($items as $item) {
                            $itemId = !empty($item['id']) ? (string)$item['id'] : generateUuid();
                            $prodName = trim((string)($item['productName'] ?? $item['product_name'] ?? 'منتج'));
                            $qty = (int)($item['quantity'] ?? 1);
                            $unitPrice = (float)($item['unitPrice'] ?? $item['unit_price'] ?? 0);
                            $itemDisc = (float)($item['discount'] ?? 0);
                            $totalPrice = (float)($item['totalPrice'] ?? $item['total_price'] ?? ($qty * $unitPrice - $itemDisc));
                            $sellingPrice = isset($item['sellingPrice']) && $item['sellingPrice'] !== '' ? (float)$item['sellingPrice'] : (isset($item['selling_price']) ? (float)$item['selling_price'] : null);
                            $batchNum = (string)($item['batchNumber'] ?? $item['batch_number'] ?? '');
                            $expiry = !empty($item['expiryDate']) ? (string)$item['expiryDate'] : (!empty($item['expiry_date']) ? (string)$item['expiry_date'] : null);

                            Database::execute($sqlItem, "sssiddssdss", [
                                $itemId, $invoiceId, $prodName, $qty, $unitPrice, $itemDisc,
                                $totalPrice, $sellingPrice, $batchNum, $expiry
                            ]);
                        }
                    }

                    $db->commit();
                    jsonResponse(['success' => true, 'message' => 'تم تحديث بيانات الفاتورة بنجاح']);
                } catch (Throwable $e) {
                    $db->rollback();
                    jsonResponse(['success' => false, 'error' => 'فشل تحديث الفاتورة: ' . $e->getMessage()], 500);
                }

            } elseif ($method === 'DELETE') {
                $deleteId = trim((string)($_GET['id'] ?? $requestData['id'] ?? ''));
                if (empty($deleteId)) jsonResponse(['success' => false, 'error' => 'Missing invoice ID'], 400);

                Database::execute("DELETE FROM `archive_invoice_items` WHERE `invoice_id` = ?", "s", [$deleteId]);
                Database::execute("DELETE FROM `archive_invoices` WHERE `id` = ?", "s", [$deleteId]);

                jsonResponse(['success' => true, 'message' => 'تم حذف الفاتورة بنجاح']);
            }
            break;

        // =====================================================================
        // 3. الموردين وتعيين الأعمدة (Suppliers & Mappings)
        // =====================================================================
        case 'suppliers':
            if ($method === 'GET') {
                $supplierId = trim((string)($_GET['id'] ?? ''));

                if (!empty($supplierId)) {
                    $supplier = Database::queryOne("SELECT * FROM `archive_suppliers` WHERE `id` = ? LIMIT 1", "s", [$supplierId]);
                    if ($supplier) {
                        $mappings = Database::query("SELECT * FROM `archive_column_mappings` WHERE `supplier_id` = ?", "s", [$supplierId]);
                        $supplier['columnMappings'] = $mappings;
                        jsonResponse(['success' => true, 'supplier' => $supplier]);
                    } else {
                        jsonResponse(['success' => false, 'error' => 'المورد غير موجود'], 404);
                    }
                }

                $suppliers = Database::query(
                    "SELECT s.*, 
                            (SELECT COUNT(*) FROM `archive_invoices` WHERE `supplier_id` = s.id) AS invoices_count,
                            (SELECT COALESCE(SUM(`net_amount`), 0) FROM `archive_invoices` WHERE `supplier_id` = s.id) AS total_invoiced
                     FROM `archive_suppliers` s
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

                $sql = "INSERT INTO `archive_suppliers` (`id`, `name`, `phone`, `email`, `address`, `tax_number`, `notes`, `created_at`, `updated_at`)
                        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
                        ON DUPLICATE KEY UPDATE `phone` = VALUES(`phone`), `email` = VALUES(`email`), `address` = VALUES(`address`), `tax_number` = VALUES(`tax_number`), `notes` = VALUES(`notes`), `updated_at` = NOW(6)";

                Database::execute($sql, "sssssss", [$id, $name, $phone, $email, $address, $taxNumber, $notes]);

                jsonResponse(['success' => true, 'message' => 'تم حفظ المورد بنجاح', 'id' => $id]);

            } elseif ($method === 'PUT') {
                $id = trim((string)($requestData['id'] ?? ''));
                $name = trim((string)($requestData['name'] ?? ''));
                $phone = (string)($requestData['phone'] ?? '');
                $email = (string)($requestData['email'] ?? '');
                $address = (string)($requestData['address'] ?? '');
                $taxNumber = (string)($requestData['taxNumber'] ?? $requestData['tax_number'] ?? '');
                $notes = (string)($requestData['notes'] ?? '');

                if (empty($id) || empty($name)) jsonResponse(['success' => false, 'error' => 'البيانات غير مكتملة'], 400);

                $sql = "UPDATE `archive_suppliers` SET `name` = ?, `phone` = ?, `email` = ?, `address` = ?, `tax_number` = ?, `notes` = ?, `updated_at` = NOW(6) WHERE `id` = ?";
                Database::execute($sql, "sssssss", [$name, $phone, $email, $address, $taxNumber, $notes, $id]);

                jsonResponse(['success' => true, 'message' => 'تم تعديل بيانات المورد بنجاح']);

            } elseif ($method === 'DELETE') {
                $id = trim((string)($_GET['id'] ?? $requestData['id'] ?? ''));
                if (empty($id)) jsonResponse(['success' => false, 'error' => 'Missing ID'], 400);

                Database::execute("DELETE FROM `archive_suppliers` WHERE `id` = ?", "s", [$id]);
                jsonResponse(['success' => true, 'message' => 'تم حذف المورد بنجاح']);
            }
            break;

        case 'suppliers/mappings':
            if ($method === 'GET') {
                $supplierId = trim((string)($_GET['supplierId'] ?? ''));
                if (empty($supplierId)) jsonResponse(['success' => false, 'error' => 'Missing supplier ID'], 400);

                $mappings = Database::query("SELECT * FROM `archive_column_mappings` WHERE `supplier_id` = ?", "s", [$supplierId]);
                jsonResponse(['success' => true, 'mappings' => $mappings]);

            } elseif ($method === 'POST') {
                $supplierId = trim((string)($requestData['supplierId'] ?? ''));
                $mappings = is_array($requestData['mappings'] ?? null) ? $requestData['mappings'] : [];

                if (empty($supplierId)) jsonResponse(['success' => false, 'error' => 'Missing supplier ID'], 400);

                Database::execute("DELETE FROM `archive_column_mappings` WHERE `supplier_id` = ?", "s", [$supplierId]);

                $sql = "INSERT INTO `archive_column_mappings` (`id`, `supplier_id`, `raw_column_name`, `standard_field`, `created_at`, `updated_at`)
                        VALUES (?, ?, ?, ?, NOW(6), NOW(6))";

                foreach ($mappings as $m) {
                    $raw = trim((string)($m['rawColumnName'] ?? $m['raw_column_name'] ?? ''));
                    $std = trim((string)($m['standardField'] ?? $m['standard_field'] ?? ''));
                    if (!empty($raw) && !empty($std)) {
                        $mapId = generateUuid();
                        Database::execute($sql, "ssss", [$mapId, $supplierId, $raw, $std]);
                    }
                }

                jsonResponse(['success' => true, 'message' => 'تم حفظ تعيين الأعمدة بنجاح']);
            }
            break;

        // =====================================================================
        // 4. موظفو الأرشيف (Employees)
        // =====================================================================
        case 'employees':
            if ($method === 'GET') {
                $employees = Database::query(
                    "SELECT e.*,
                            (SELECT COUNT(*) FROM `archive_invoices` WHERE `receiver_id` = e.id) AS received_count,
                            (SELECT COUNT(*) FROM `archive_invoices` WHERE `entry_clerk_id` = e.id) AS entered_count
                     FROM `archive_employees` e
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

                $sql = "INSERT INTO `archive_employees` (`id`, `name`, `role`, `phone`, `active`, `created_at`, `updated_at`)
                        VALUES (?, ?, ?, ?, ?, NOW(6), NOW(6))
                        ON DUPLICATE KEY UPDATE `role` = VALUES(`role`), `phone` = VALUES(`phone`), `active` = VALUES(`active`), `updated_at` = NOW(6)";

                Database::execute($sql, "ssssi", [$id, $name, $role, $phone, $active]);
                jsonResponse(['success' => true, 'message' => 'تم حفظ الموظف بنجاح', 'id' => $id]);

            } elseif ($method === 'PUT') {
                $id = trim((string)($requestData['id'] ?? ''));
                $name = trim((string)($requestData['name'] ?? ''));
                $role = (string)($requestData['role'] ?? 'أمين مخزن');
                $phone = (string)($requestData['phone'] ?? '');
                $active = isset($requestData['active']) ? (int)(bool)$requestData['active'] : 1;

                if (empty($id) || empty($name)) jsonResponse(['success' => false, 'error' => 'البيانات غير مكتملة'], 400);

                $sql = "UPDATE `archive_employees` SET `name` = ?, `role` = ?, `phone` = ?, `active` = ?, `updated_at` = NOW(6) WHERE `id` = ?";
                Database::execute($sql, "sssii", [$name, $role, $phone, $active, $id]);

                jsonResponse(['success' => true, 'message' => 'تم تحديث الموظف بنجاح']);

            } elseif ($method === 'DELETE') {
                $id = trim((string)($_GET['id'] ?? $requestData['id'] ?? ''));
                if (empty($id)) jsonResponse(['success' => false, 'error' => 'Missing ID'], 400);

                Database::execute("DELETE FROM `archive_employees` WHERE `id` = ?", "s", [$id]);
                jsonResponse(['success' => true, 'message' => 'تم حذف الموظف بنجاح']);
            }
            break;

        // =====================================================================
        // 5. الإعدادات (System Settings)
        // =====================================================================
        case 'settings':
            if ($method === 'GET') {
                $rows = Database::query("SELECT `key_name`, `value_data` FROM `archive_system_settings`");
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

        // =====================================================================
        // 6. رفع الملفات التخزينية (File Upload)
        // =====================================================================
        case 'upload':
            if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);

            $uploadDir = __DIR__ . '/../uploads/archive/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            if (!empty($_FILES['file'])) {
                $file = $_FILES['file'];
                if ($file['error'] !== UPLOAD_ERR_OK) {
                    jsonResponse(['success' => false, 'error' => 'فشل رفع الملف'], 400);
                }

                $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
                $safeName = 'inv_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
                $target = $uploadDir . $safeName;

                if (move_uploaded_file($file['tmp_name'], $target)) {
                    $fileUrl = '/uploads/archive/' . $safeName;
                    jsonResponse([
                        'success' => true,
                        'fileUrl' => $fileUrl,
                        'fileName' => $file['name'],
                        'fileType' => $file['type']
                    ]);
                } else {
                    jsonResponse(['success' => false, 'error' => 'فشل حفظ الملف على الخادم'], 500);
                }
            }

            if (!empty($requestData['base64'])) {
                $base64 = (string)$requestData['base64'];
                $fileName = (string)($requestData['fileName'] ?? 'invoice_' . time() . '.png');
                $ext = pathinfo($fileName, PATHINFO_EXTENSION) ?: 'png';
                $safeName = 'inv_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
                $target = $uploadDir . $safeName;

                $data = preg_replace('#^data:image/\w+;base64,#i', '', $base64);
                $data = base64_decode($data);

                if (file_put_contents($target, $data)) {
                    $fileUrl = '/uploads/archive/' . $safeName;
                    jsonResponse([
                        'success' => true,
                        'fileUrl' => $fileUrl,
                        'fileName' => $fileName
                    ]);
                }
            }

            jsonResponse(['success' => false, 'error' => 'لا يوجد ملف مرفوع'], 400);
            break;

        default:
            jsonResponse(['success' => false, 'error' => "Unknown archive endpoint: {$subPath}"], 404);
            break;
    }
}

// استدعاء المعالج إذا تم استدعاؤه مباشرة
$reqEndpoint = $_GET['endpoint'] ?? '';
if (str_starts_with($reqEndpoint, 'archive/')) {
    $sub = substr($reqEndpoint, 8);
    handleArchiveApi($sub, $_SERVER['REQUEST_METHOD'] ?? 'GET');
}
