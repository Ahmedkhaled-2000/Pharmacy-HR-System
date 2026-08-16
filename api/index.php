<?php
/**
 * Main API Router for Pharmacy HR System
 * Handles all REST endpoints with MariaDB 10.11 & PHP 8.1-8.5
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($requestUri, PHP_URL_PATH) ?? '';

// استخراج المسار بعد /api/ أو عبر query parameter ?endpoint=...
$endpoint = $_GET['endpoint'] ?? '';
if (empty($endpoint)) {
    if (preg_match('#/api(?:/index\.php)?/([^?]+)#', $path, $matches)) {
        $endpoint = trim($matches[1], '/');
    } elseif ($path === '/api' || $path === '/api/') {
        $endpoint = 'health';
    }
}

$clientIp = getClientIp();

try {
    switch ($endpoint) {
        // ==================================================================
        // 1. فحص سلامة الخادم وقاعدة البيانات (Health Check)
        // ==================================================================
        case 'health':
        case 'status':
            $db = Database::getConnection();
            jsonResponse([
                'success' => true,
                'status' => 'online',
                'service' => 'Pharmacy HR System API',
                'php_version' => PHP_VERSION,
                'mariadb_version' => $db->server_info,
                'server_time' => date('Y-m-d H:i:s'),
                'timezone' => date_default_timezone_get()
            ]);
            break;

        // ==================================================================
        // 2. تشغيل الـ Migrations
        // ==================================================================
        case 'migrate':
        case 'migrate.php':
            require __DIR__ . '/migrate.php';
            break;

        // ==================================================================
        // 3. إدارة إعدادات وبيانات التطبيق الرئيسية (App Settings / State)
        // ==================================================================
        case 'settings':
            $key = $_GET['key'] ?? DEFAULT_STORAGE_KEY;

            if ($method === 'GET') {
                $row = Database::queryOne(
                    "SELECT `key_name`, `value_data`, `version`, `updated_at` FROM `app_settings` WHERE `key_name` = ? LIMIT 1",
                    "s",
                    [$key]
                );

                if ($row) {
                    $decodedValue = json_decode($row['value_data'], true);
                    jsonResponse([
                        'success' => true,
                        'key' => $row['key_name'],
                        'value' => $decodedValue ?? $row['value_data'],
                        'version' => (int)$row['version'],
                        'updated_at' => $row['updated_at']
                    ]);
                } else {
                    jsonResponse([
                        'success' => true,
                        'key' => $key,
                        'value' => null,
                        'version' => 0,
                        'updated_at' => null
                    ]);
                }
            } elseif ($method === 'POST') {
                $payload = getRequestData();
                $targetKey = (string)($payload['key'] ?? $key);
                $value = $payload['value'] ?? null;

                if ($value === null) {
                    jsonResponse(['success' => false, 'error' => 'Missing "value" in request body'], 400);
                }

                $jsonString = is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

                // Upsert with version increment
                $sql = "INSERT INTO `app_settings` (`key_name`, `value_data`, `version`, `updated_at`)
                        VALUES (?, ?, 1, NOW(6))
                        ON DUPLICATE KEY UPDATE
                            `value_data` = VALUES(`value_data`),
                            `version` = `version` + 1,
                            `updated_at` = NOW(6)";

                Database::execute($sql, "ss", [$targetKey, $jsonString]);

                // تسجيل المزامنة في sync_logs
                $versionRow = Database::queryOne("SELECT `version`, `updated_at` FROM `app_settings` WHERE `key_name` = ?", "s", [$targetKey]);
                $currentVersion = (int)($versionRow['version'] ?? 1);
                $updatedAt = $versionRow['updated_at'] ?? date('Y-m-d H:i:s');

                Database::execute(
                    "INSERT INTO `sync_logs` (`action_type`, `entity_key`, `version`, `client_ip`, `created_at`) VALUES ('SAVE_STATE', ?, ?, ?, NOW(6))",
                    "sis",
                    [$targetKey, $currentVersion, $clientIp]
                );

                jsonResponse([
                    'success' => true,
                    'message' => 'State saved successfully',
                    'key' => $targetKey,
                    'version' => $currentVersion,
                    'updated_at' => $updatedAt
                ]);
            }
            break;

        // ==================================================================
        // 4. فحص رقم الإصدار للمزامنة الخفيفة (Ultra-Fast Smart Polling)
        // ==================================================================
        case 'sync/version':
        case 'version':
            $key = $_GET['key'] ?? DEFAULT_STORAGE_KEY;
            $row = Database::queryOne(
                "SELECT `version`, `updated_at` FROM `app_settings` WHERE `key_name` = ? LIMIT 1",
                "s",
                [$key]
            );

            jsonResponse([
                'success' => true,
                'key' => $key,
                'version' => (int)($row['version'] ?? 0),
                'updated_at' => $row['updated_at'] ?? null
            ]);
            break;

        // ==================================================================
        // 5. إدارة بصمات الوجه واليد الحيوية (Biometric Descriptors)
        // ==================================================================
        case 'faces':
        case 'biometrics':
            $empId = $_GET['employee_id'] ?? null;

            if ($method === 'GET') {
                if (!empty($empId)) {
                    $row = Database::queryOne(
                        "SELECT `employee_id`, `descriptor`, `hand_descriptor`, `biometric_type`, `updated_at` FROM `employee_faces` WHERE `employee_id` = ? LIMIT 1",
                        "s",
                        [(string)$empId]
                    );

                    if ($row) {
                        $row['descriptor'] = !empty($row['descriptor']) ? json_decode($row['descriptor'], true) : null;
                        $row['hand_descriptor'] = !empty($row['hand_descriptor']) ? json_decode($row['hand_descriptor'], true) : null;
                    }

                    jsonResponse(['success' => true, 'data' => $row]);
                } else {
                    $rows = Database::query("SELECT `employee_id`, `descriptor`, `hand_descriptor`, `biometric_type`, `updated_at` FROM `employee_faces`");
                    
                    foreach ($rows as &$r) {
                        $r['descriptor'] = !empty($r['descriptor']) ? json_decode($r['descriptor'], true) : null;
                        $r['hand_descriptor'] = !empty($r['hand_descriptor']) ? json_decode($r['hand_descriptor'], true) : null;
                    }
                    unset($r);

                    jsonResponse(['success' => true, 'data' => $rows]);
                }
            } elseif ($method === 'POST') {
                $payload = getRequestData();
                $employeeId = (string)($payload['employee_id'] ?? $empId ?? '');
                
                if (empty($employeeId)) {
                    jsonResponse(['success' => false, 'error' => 'Missing employee_id'], 400);
                }

                $descriptor = isset($payload['descriptor']) ? (is_string($payload['descriptor']) ? $payload['descriptor'] : json_encode($payload['descriptor'])) : null;
                $handDescriptor = isset($payload['hand_descriptor']) ? (is_string($payload['hand_descriptor']) ? $payload['hand_descriptor'] : json_encode($payload['hand_descriptor'])) : null;
                $biometricType = (string)($payload['biometric_type'] ?? 'face');

                $sql = "INSERT INTO `employee_faces` (`employee_id`, `descriptor`, `hand_descriptor`, `biometric_type`, `updated_at`)
                        VALUES (?, ?, ?, ?, NOW(6))
                        ON DUPLICATE KEY UPDATE
                            `descriptor` = COALESCE(VALUES(`descriptor`), `descriptor`),
                            `hand_descriptor` = COALESCE(VALUES(`hand_descriptor`), `hand_descriptor`),
                            `biometric_type` = VALUES(`biometric_type`),
                            `updated_at` = NOW(6)";

                Database::execute($sql, "ssss", [$employeeId, $descriptor, $handDescriptor, $biometricType]);

                jsonResponse([
                    'success' => true,
                    'message' => 'Biometric descriptor saved successfully',
                    'employee_id' => $employeeId
                ]);
            } elseif ($method === 'DELETE') {
                $deleteId = (string)($_GET['employee_id'] ?? getRequestData()['employee_id'] ?? '');
                if (empty($deleteId)) {
                    jsonResponse(['success' => false, 'error' => 'Missing employee_id for deletion'], 400);
                }

                Database::execute("DELETE FROM `employee_faces` WHERE `employee_id` = ?", "s", [$deleteId]);
                jsonResponse(['success' => true, 'message' => "Biometrics deleted for employee {$deleteId}"]);
            }
            break;

        // ==================================================================
        // 6. النسخ الاحتياطي والاستعادة الكاملة (Full Backup & Restore)
        // ==================================================================
        case 'backup/export':
            $settings = Database::query("SELECT * FROM `app_settings`");
            $faces = Database::query("SELECT * FROM `employee_faces`");

            foreach ($faces as &$f) {
                $f['descriptor'] = !empty($f['descriptor']) ? json_decode($f['descriptor'], true) : null;
                $f['hand_descriptor'] = !empty($f['hand_descriptor']) ? json_decode($f['hand_descriptor'], true) : null;
            }
            unset($f);

            jsonResponse([
                'success' => true,
                'timestamp' => date('c'),
                'export_version' => 2,
                'data' => [
                    'app_settings' => $settings,
                    'employee_faces' => $faces
                ]
            ]);
            break;

        case 'backup/import':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
            }

            $payload = getRequestData();
            $facesData = $payload['employee_faces'] ?? [];

            if (is_array($facesData)) {
                foreach ($facesData as $f) {
                    if (empty($f['employee_id'])) continue;
                    $empId = (string)$f['employee_id'];
                    $desc = isset($f['descriptor']) ? (is_string($f['descriptor']) ? $f['descriptor'] : json_encode($f['descriptor'])) : null;
                    $hand = isset($f['hand_descriptor']) ? (is_string($f['hand_descriptor']) ? $f['hand_descriptor'] : json_encode($f['hand_descriptor'])) : null;
                    $type = (string)($f['biometric_type'] ?? 'face');

                    Database::execute(
                        "INSERT INTO `employee_faces` (`employee_id`, `descriptor`, `hand_descriptor`, `biometric_type`, `updated_at`)
                         VALUES (?, ?, ?, ?, NOW(6))
                         ON DUPLICATE KEY UPDATE `descriptor` = VALUES(`descriptor`), `hand_descriptor` = VALUES(`hand_descriptor`), `biometric_type` = VALUES(`biometric_type`), `updated_at` = NOW(6)",
                        "ssss",
                        [$empId, $desc, $hand, $type]
                    );
                }
            }

            jsonResponse(['success' => true, 'message' => 'Backup restored successfully']);
            break;

        default:
            jsonResponse([
                'success' => false,
                'error' => "Unknown endpoint: {$endpoint}",
                'available_endpoints' => [
                    'GET/POST /api/settings',
                    'GET /api/sync/version',
                    'GET/POST/DELETE /api/faces',
                    'GET /api/health',
                    'GET /api/migrate',
                    'GET /api/backup/export',
                    'POST /api/backup/import'
                ]
            ], 404);
            break;
    }
} catch (Throwable $e) {
    error_log('[API Error] ' . $e->getMessage());
    jsonResponse([
        'success' => false,
        'error' => $e->getMessage()
    ], 500);
}
