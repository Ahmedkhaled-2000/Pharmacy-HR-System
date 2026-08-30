<?php
/**
 * Main API Router for Pharmacy HR & Archive System
 * Compatible with PHP 8.1 - 8.5 & PostgreSQL 16+/18+ (Default) / MySQL
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

// توجيه مسارات نظام أرشيف الصيدلية
if (str_starts_with($endpoint, 'archive/') || $endpoint === 'archive') {
    require_once __DIR__ . '/archive.php';
    $sub = str_starts_with($endpoint, 'archive/') ? substr($endpoint, 8) : '';
    handleArchiveApi($sub, $method);
    exit();
}

$driver = Database::getDriver();

try {
    switch ($endpoint) {
        // ==================================================================
        // 1. فحص سلامة الخادم وقاعدة البيانات (Health Check)
        // ==================================================================
        case 'health':
        case 'status':
            $db = Database::getConnection();
            $dbVersion = 'Unknown';
            try {
                $vRow = Database::queryOne($driver === 'pgsql' ? "SELECT version() AS ver" : "SELECT VERSION() AS ver");
                $dbVersion = $vRow['ver'] ?? 'Unknown';
            } catch (Throwable) {}

            jsonResponse([
                'success' => true,
                'status' => 'online',
                'service' => 'Pharmacy HR System API',
                'php_version' => PHP_VERSION,
                'db_driver' => $driver,
                'db_version' => $dbVersion,
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
                    "SELECT key_name, value_data, version, updated_at FROM app_settings WHERE key_name = ? LIMIT 1",
                    [$key]
                );

                if ($row) {
                    $rawVal = $row['value_data'];
                    // إذا كانت القيمة مخزنة كنص JSON جاهز، يتم إرسالها فوراً دون استهلاك الذاكرة في json_decode/json_encode
                    if (is_string($rawVal) && (str_starts_with(trim($rawVal), '{') || str_starts_with(trim($rawVal), '['))) {
                        header('Content-Type: application/json; charset=utf-8');
                        header('Cache-Control: no-cache, no-store, must-revalidate');
                        echo '{"success":true,"key":' . json_encode($row['key_name']) . ',"value":' . trim($rawVal) . ',"version":' . (int)$row['version'] . ',"updated_at":' . json_encode($row['updated_at']) . '}';
                        Database::resetConnection();
                        exit();
                    }

                    $decodedValue = is_string($rawVal) ? json_decode($rawVal, true) : $rawVal;
                    jsonResponse([
                        'success' => true,
                        'key' => $row['key_name'],
                        'value' => $decodedValue ?? $rawVal,
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

                $decodedIncoming = is_string($value) ? json_decode($value, true) : $value;

                // Server-side Smart Merge: جلب الحالة الحالية من السيرفر ودمجها لحماية الطلبات من المسح
                $finalValueData = $value;
                if (is_array($decodedIncoming)) {
                    $existingRow = Database::queryOne(
                        "SELECT value_data FROM app_settings WHERE key_name = ? LIMIT 1",
                        [$targetKey]
                    );

                    if ($existingRow && !empty($existingRow['value_data'])) {
                        $existingDecoded = is_string($existingRow['value_data'])
                            ? json_decode($existingRow['value_data'], true)
                            : $existingRow['value_data'];

                        if (is_array($existingDecoded)) {
                            // دمج ذكي يحافظ على جميع الطلبات والكيانات المستلمة من كافة الأجهزة
                            $mergedState = mergeServerState($existingDecoded, $decodedIncoming);
                            $finalValueData = $mergedState;
                        }
                    }
                }

                $jsonString = is_string($finalValueData)
                    ? $finalValueData
                    : json_encode($finalValueData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

                // Upsert with version increment (PostgreSQL vs MySQL)
                if ($driver === 'pgsql') {
                    $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                            VALUES (?, ?::jsonb, 1, NOW())
                            ON CONFLICT (key_name) DO UPDATE
                            SET value_data = EXCLUDED.value_data,
                                version = app_settings.version + 1,
                                updated_at = NOW()";
                } else {
                    $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                            VALUES (?, ?, 1, NOW())
                            ON DUPLICATE KEY UPDATE
                                value_data = VALUES(value_data),
                                version = version + 1,
                                updated_at = NOW()";
                }

                Database::execute($sql, [$targetKey, $jsonString]);

                // تسجيل المزامنة في sync_logs
                $versionRow = Database::queryOne("SELECT version, updated_at FROM app_settings WHERE key_name = ?", [$targetKey]);
                $currentVersion = (int)($versionRow['version'] ?? 1);
                $updatedAt = $versionRow['updated_at'] ?? date('Y-m-d H:i:s');
                $clientIp = getClientIp();

                Database::execute(
                    "INSERT INTO sync_logs (action_type, entity_key, version, client_ip, created_at) VALUES ('SAVE_STATE', ?, ?, ?, NOW())",
                    [$targetKey, $currentVersion, $clientIp]
                );

                jsonResponse([
                    'success' => true,
                    'message' => 'State saved and merged successfully',
                    'key' => $targetKey,
                    'version' => $currentVersion,
                    'updated_at' => $updatedAt,
                    'value' => is_array($finalValueData) ? $finalValueData : null
                ]);
            }
            break;

        // ==================================================================
        // 4. البث الحي اللحظي للأحداث والتحديثات (Server-Sent Events / SSE)
        // ==================================================================
        case 'stream':
        case 'events':
            @ini_set('zlib.output_compression', '0');
            @ini_set('output_buffering', '0');

            header('Content-Type: text/event-stream; charset=utf-8');
            header('Cache-Control: no-cache, no-transform, no-store, must-revalidate');
            header('Connection: close');
            header('X-Accel-Buffering: no');
            header('Pragma: no-cache');
            header('Expires: 0');

            $key = $_GET['key'] ?? DEFAULT_STORAGE_KEY;

            try {
                $row = Database::queryOne(
                    "SELECT version, updated_at FROM app_settings WHERE key_name = ? LIMIT 1",
                    [$key]
                );
                $curVer = (int)($row['version'] ?? 0);

                echo "event: version_change\n";
                echo "data: " . json_encode([
                    'version' => $curVer,
                    'updated_at' => $row['updated_at'] ?? null,
                    'key' => $key
                ]) . "\n\n";
            } catch (Throwable) {
                echo ": ping\n\n";
            }

            Database::resetConnection();
            exit();
            break;

        // ==================================================================
        // 5. فحص رقم الإصدار للمزامنة الخفيفة (Ultra-Fast Smart Polling)
        // ==================================================================
        case 'sync/version':
        case 'version':
            $key = $_GET['key'] ?? DEFAULT_STORAGE_KEY;
            $row = Database::queryOne(
                "SELECT version, updated_at FROM app_settings WHERE key_name = ? LIMIT 1",
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
                        "SELECT employee_id, descriptor, hand_descriptor, biometric_type, updated_at FROM employee_faces WHERE employee_id = ? LIMIT 1",
                        [(string)$empId]
                    );

                    if ($row) {
                        $row['descriptor'] = !empty($row['descriptor']) ? (is_string($row['descriptor']) ? json_decode($row['descriptor'], true) : $row['descriptor']) : null;
                        $row['hand_descriptor'] = !empty($row['hand_descriptor']) ? (is_string($row['hand_descriptor']) ? json_decode($row['hand_descriptor'], true) : $row['hand_descriptor']) : null;
                    }

                    jsonResponse(['success' => true, 'data' => $row]);
                } else {
                    $rows = Database::query("SELECT employee_id, descriptor, hand_descriptor, biometric_type, updated_at FROM employee_faces");
                    
                    foreach ($rows as &$r) {
                        $r['descriptor'] = !empty($r['descriptor']) ? (is_string($r['descriptor']) ? json_decode($r['descriptor'], true) : $r['descriptor']) : null;
                        $r['hand_descriptor'] = !empty($r['hand_descriptor']) ? (is_string($r['hand_descriptor']) ? json_decode($r['hand_descriptor'], true) : $r['hand_descriptor']) : null;
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

                if ($driver === 'pgsql') {
                    $sql = "INSERT INTO employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
                            VALUES (?, ?::jsonb, ?::jsonb, ?, NOW())
                            ON CONFLICT (employee_id) DO UPDATE
                            SET descriptor = COALESCE(EXCLUDED.descriptor, employee_faces.descriptor),
                                hand_descriptor = COALESCE(EXCLUDED.hand_descriptor, employee_faces.hand_descriptor),
                                biometric_type = EXCLUDED.biometric_type,
                                updated_at = NOW()";
                } else {
                    $sql = "INSERT INTO employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
                            VALUES (?, ?, ?, ?, NOW())
                            ON DUPLICATE KEY UPDATE
                                descriptor = COALESCE(VALUES(descriptor), descriptor),
                                hand_descriptor = COALESCE(VALUES(hand_descriptor), hand_descriptor),
                                biometric_type = VALUES(biometric_type),
                                updated_at = NOW()";
                }

                Database::execute($sql, [$employeeId, $descriptor, $handDescriptor, $biometricType]);

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

                Database::execute("DELETE FROM employee_faces WHERE employee_id = ?", [$deleteId]);
                jsonResponse(['success' => true, 'message' => "Biometrics deleted for employee {$deleteId}"]);
            }
            break;

        // ==================================================================
        // 6. النسخ الاحتياطي والاستعادة الكاملة (Full Backup & Restore)
        // ==================================================================
        case 'backup/export':
            $settings = Database::query("SELECT * FROM app_settings");
            $faces = Database::query("SELECT * FROM employee_faces");

            foreach ($faces as &$f) {
                $f['descriptor'] = !empty($f['descriptor']) ? (is_string($f['descriptor']) ? json_decode($f['descriptor'], true) : $f['descriptor']) : null;
                $f['hand_descriptor'] = !empty($f['hand_descriptor']) ? (is_string($f['hand_descriptor']) ? json_decode($f['hand_descriptor'], true) : $f['hand_descriptor']) : null;
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

                    if ($driver === 'pgsql') {
                        Database::execute(
                            "INSERT INTO employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
                             VALUES (?, ?::jsonb, ?::jsonb, ?, NOW())
                             ON CONFLICT (employee_id) DO UPDATE 
                             SET descriptor = EXCLUDED.descriptor, 
                                 hand_descriptor = EXCLUDED.hand_descriptor, 
                                 biometric_type = EXCLUDED.biometric_type, 
                                 updated_at = NOW()",
                            [$empId, $desc, $hand, $type]
                        );
                    } else {
                        Database::execute(
                            "INSERT INTO employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
                             VALUES (?, ?, ?, ?, NOW())
                             ON DUPLICATE KEY UPDATE 
                             descriptor = VALUES(descriptor), 
                             hand_descriptor = VALUES(hand_descriptor), 
                             biometric_type = VALUES(biometric_type), 
                             updated_at = NOW()",
                            [$empId, $desc, $hand, $type]
                        );
                    }
                }
            }

            jsonResponse(['success' => true, 'message' => 'Backup restored successfully']);
            break;

        // ==================================================================
        // 7. تصفير ومسح قاعدة البيانات بالكامل (Full Server Factory Reset)
        // ==================================================================
        case 'system/reset':
        case 'reset':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
            }

            $payload = getRequestData();
            $targetKey = (string)($payload['key'] ?? DEFAULT_STORAGE_KEY);
            $wipedState = $payload['state'] ?? null;

            // 1. مسح جدول البصمات الحيوية بالكامل
            try {
                Database::execute("DELETE FROM employee_faces");
            } catch (Throwable $fe) {
                error_log('[Reset Faces Error] ' . $fe->getMessage());
            }

            // 2. تحديث جدول الإعدادات بالحالة النظيفة المصفّرة
            if ($wipedState !== null) {
                $jsonString = is_string($wipedState) ? $wipedState : json_encode($wipedState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if ($driver === 'pgsql') {
                    $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                            VALUES (?, ?::jsonb, 1, NOW())
                            ON CONFLICT (key_name) DO UPDATE
                            SET value_data = EXCLUDED.value_data,
                                version = app_settings.version + 1,
                                updated_at = NOW()";
                } else {
                    $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                            VALUES (?, ?, 1, NOW())
                            ON DUPLICATE KEY UPDATE
                                value_data = VALUES(value_data),
                                version = version + 1,
                                updated_at = NOW()";
                }
                Database::execute($sql, [$targetKey, $jsonString]);
            }

            // 3. تدوين سجل إعادة ضبط المصنع في sync_logs
            try {
                $clientIp = getClientIp();
                Database::execute(
                    "INSERT INTO sync_logs (action_type, entity_key, version, client_ip, created_at) VALUES ('FACTORY_RESET', ?, 1, ?, NOW())",
                    [$targetKey, $clientIp]
                );
            } catch (Throwable) {}

            jsonResponse([
                'success' => true,
                'message' => 'Server database wiped and factory reset successfully'
            ]);
            break;

        default:
            jsonResponse([
                'success' => false,
                'error' => "Unknown endpoint: {$endpoint}",
                'available_endpoints' => [
                    'GET/POST /api/settings',
                    'GET /api/sync/version',
                    'GET/POST/DELETE /api/faces',
                    'POST /api/system/reset',
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
