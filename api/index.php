<?php
/**
 * Main API Router for Pharmacy HR & Archive System
 * Exclusively powered by Supabase PostgreSQL
 * Features: High-Performance Server Micro-Caching + Zero Browser Cache Guarantee
 * Compatible with PHP 8.1 - 8.5
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

try {
    switch ($endpoint) {
        // ==================================================================
        // 1. فحص سلامة الخادم وقاعدة بيانات Supabase (Health Check)
        // ==================================================================
        case 'health':
        case 'status':
            $dbVersion = 'Unknown';
            try {
                $vRow = Database::queryOne("SELECT version() AS ver");
                $dbVersion = $vRow['ver'] ?? 'Unknown';
            } catch (Throwable) {}

            jsonResponse([
                'success' => true,
                'status' => 'online',
                'service' => 'Pharmacy HR System API (Supabase PostgreSQL Dedicated)',
                'php_version' => PHP_VERSION,
                'db_driver' => 'pgsql',
                'db_version' => $dbVersion,
                'server_time' => date('Y-m-d H:i:s'),
                'timezone' => date_default_timezone_get()
            ]);
            break;

        // ==================================================================
        // 2. تسجيل الدخول والتحقق من الجلسة (Auth Endpoints)
        // ==================================================================
        case 'auth/login':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
            }

            $payload = getRequestData();
            $username = trim((string)($payload['username'] ?? $payload['code'] ?? ''));
            $password = (string)($payload['password'] ?? '');
            $role = (string)($payload['role'] ?? 'admin');

            // جلب إعدادات المنشأة للتحقق من كلمات المرور (مع دعم MicroCache)
            $cachedSettings = MicroCache::get('settings_' . DEFAULT_STORAGE_KEY);
            if ($cachedSettings && isset($cachedSettings['value'])) {
                $appState = $cachedSettings['value'];
            } else {
                $settingsRow = Database::queryOne("SELECT value_data FROM app_settings WHERE key_name = ? LIMIT 1", [DEFAULT_STORAGE_KEY]);
                $appState = $settingsRow && !empty($settingsRow['value_data'])
                    ? (is_string($settingsRow['value_data']) ? json_decode($settingsRow['value_data'], true) : $settingsRow['value_data'])
                    : [];
            }

            $orgSettings = is_array($appState['orgSettings'] ?? null) ? $appState['orgSettings'] : [];
            $adminPass = (string)($orgSettings['adminPassword'] ?? '123');
            $ownerPass = (string)($orgSettings['ownerPassword'] ?? $adminPass);

            $authenticated = false;
            $userRole = 'guest';
            $userData = ['username' => $username];

            if ($role === 'owner' && $password === $ownerPass) {
                $authenticated = true;
                $userRole = 'owner';
                $userData['name'] = 'المالك / الإدارة العليا';
            } elseif (($role === 'admin' || $username === 'admin') && ($password === $adminPass || $password === $ownerPass)) {
                $authenticated = true;
                $userRole = 'admin';
                $userData['name'] = 'مدير النظام';
            } elseif ($role === 'branch') {
                $branches = is_array($appState['branches'] ?? null) ? $appState['branches'] : [];
                foreach ($branches as $b) {
                    if (is_array($b) && ((string)($b['id'] ?? '') === $username || (string)($b['name'] ?? '') === $username)) {
                        $bPass = (string)($b['managerPin'] ?? $b['password'] ?? '1234');
                        if ($password === $bPass || $password === $adminPass) {
                            $authenticated = true;
                            $userRole = 'branch';
                            $userData['branchId'] = $b['id'] ?? '';
                            $userData['name'] = $b['name'] ?? 'مدير فرع';
                        }
                        break;
                    }
                }
            }

            if ($authenticated) {
                $tokenPayload = [
                    'username' => $username,
                    'role' => $userRole,
                    'userData' => $userData
                ];
                $token = createApiToken($tokenPayload, 30 * 86400); // 30 days
                jsonResponse([
                    'success' => true,
                    'message' => 'تم تسجيل الدخول بنجاح',
                    'token' => $token,
                    'role' => $userRole,
                    'user' => $userData
                ]);
            } else {
                jsonResponse([
                    'success' => false,
                    'error' => 'بيانات الدخول غير صحيحة'
                ], 401);
            }
            break;

        case 'auth/session':
        case 'auth/verify':
            $authUser = getAuthenticatedUser();
            if ($authUser) {
                jsonResponse([
                    'success' => true,
                    'authenticated' => true,
                    'role' => $authUser['role'] ?? 'user',
                    'user' => $authUser['userData'] ?? ['username' => $authUser['username'] ?? '']
                ]);
            } else {
                jsonResponse(['success' => false, 'authenticated' => false], 401);
            }
            break;

        // ==================================================================
        // 3. تشغيل الـ Migrations
        // ==================================================================
        case 'migrate':
        case 'migrate.php':
            require __DIR__ . '/migrate.php';
            break;

        // ==================================================================
        // 4. إدارة إعدادات وبيانات التطبيق الرئيسية (App Settings / State Store)
        // ==================================================================
        case 'settings':
            $key = $_GET['key'] ?? DEFAULT_STORAGE_KEY;

            if ($method === 'GET') {
                // فحص كاش السيرفر المصغر أولاً لخفض استهلاك Supabase Egress
                $cached = MicroCache::get('settings_' . $key);
                if ($cached !== null) {
                    jsonResponse($cached);
                }

                $row = Database::queryOne(
                    "SELECT key_name, value_data, version, updated_at FROM app_settings WHERE key_name = ? LIMIT 1",
                    [$key]
                );

                if ($row) {
                    $rawVal = $row['value_data'];
                    $decodedValue = is_string($rawVal) ? json_decode($rawVal, true) : $rawVal;
                    if ($decodedValue === 'null' || $decodedValue === null || $rawVal === 'null') {
                        $decodedValue = null;
                    }

                    $response = [
                        'success' => true,
                        'key' => $row['key_name'],
                        'value' => $decodedValue,
                        'version' => (int)$row['version'],
                        'updated_at' => $row['updated_at']
                    ];

                    // حفظ في كاش السيرفر لمدة 8 ثوانٍ
                    MicroCache::set('settings_' . $key, $response, MICRO_CACHE_TTL);
                    MicroCache::set('version_' . $key, [
                        'success' => true,
                        'key' => $key,
                        'version' => (int)$row['version'],
                        'updated_at' => $row['updated_at']
                    ], MICRO_CACHE_TTL);

                    jsonResponse($response);
                } else {
                    $response = [
                        'success' => true,
                        'key' => $key,
                        'value' => null,
                        'version' => 0,
                        'updated_at' => null
                    ];
                    jsonResponse($response);
                }
            } elseif ($method === 'POST') {
                $payload = getRequestData();
                $targetKey = (string)($payload['key'] ?? $key);
                $value = $payload['value'] ?? null;

                // 1. حماية قصوى: منع مسح قاعدة البيانات بقيم فارغة أو Null
                if ($value === null || $value === 'null' || $value === '') {
                    jsonResponse([
                        'success' => false,
                        'error' => 'حماية البيانات: لا يمكن حفظ حالة فارغة (null payload rejected)'
                    ], 400);
                }

                $decodedIncoming = is_string($value) ? json_decode($value, true) : $value;
                if (!is_array($decodedIncoming)) {
                    jsonResponse([
                        'success' => false,
                        'error' => 'حماية البيانات: صيغة البيانات المرسلة غير صالحة'
                    ], 400);
                }

                // 2. جلب الحالة السابقة إن وجدت من قاعدة البيانات مباشرة
                $existingRow = Database::queryOne(
                    "SELECT value_data, version FROM app_settings WHERE key_name = ? LIMIT 1",
                    [$targetKey]
                );

                $existingDecoded = null;
                if ($existingRow && !empty($existingRow['value_data'])) {
                    $rawEx = $existingRow['value_data'];
                    $existingDecoded = is_string($rawEx) ? json_decode($rawEx, true) : $rawEx;
                    if ($existingDecoded === 'null' || $existingDecoded === null || $rawEx === 'null') {
                        $existingDecoded = null;
                    }
                }

                // 3. حماية ضد المسح العرضي للكوادر والموظفين (Accidental Wipe Prevention)
                $incomingEmpCount = is_array($decodedIncoming['employees'] ?? null) ? count($decodedIncoming['employees']) : 0;
                $existingEmpCount = is_array($existingDecoded['employees'] ?? null) ? count($existingDecoded['employees']) : 0;
                $isExplicitReset = !empty($decodedIncoming['_systemResetToken']) || !empty($payload['allowReset']);

                if (!$isExplicitReset && $incomingEmpCount === 0 && $existingEmpCount > 0) {
                    $decodedIncoming['employees'] = $existingDecoded['employees'] ?? [];
                    if (empty($decodedIncoming['branches']) && !empty($existingDecoded['branches'])) {
                        $decodedIncoming['branches'] = $existingDecoded['branches'];
                    }
                }

                // 4. دمج البيانات بذكاء مع السيرفر للحفاظ على اللوائح والإعدادات والطلبات
                $finalValueData = $decodedIncoming;
                if (is_array($existingDecoded)) {
                    $finalValueData = mergeServerState($existingDecoded, $decodedIncoming);
                }

                // 5. حفظ نسخة احتياطية لقطية فورية في Supabase
                if (is_array($existingDecoded) && !empty($existingDecoded)) {
                    try {
                        $jsonBackup = json_encode($existingDecoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
                        Database::execute(
                            "INSERT INTO app_settings_backups (key_name, value_data, version, client_ip, created_at) VALUES (?, ?::jsonb, ?, ?, NOW())",
                            [$targetKey, $jsonBackup, (int)($existingRow['version'] ?? 1), getClientIp()]
                        );
                    } catch (Throwable) {}
                }

                $jsonString = is_string($finalValueData)
                    ? $finalValueData
                    : json_encode($finalValueData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

                // 6. الحفظ في Supabase PostgreSQL
                $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                        VALUES (?, ?::jsonb, 1, NOW())
                        ON CONFLICT (key_name) DO UPDATE
                        SET value_data = EXCLUDED.value_data,
                            version = app_settings.version + 1,
                            updated_at = NOW()";

                Database::execute($sql, [$targetKey, $jsonString]);

                // 7. جلب النسخة والتاريخ وتفريغ الكاش فوراً
                $versionRow = Database::queryOne("SELECT version, updated_at FROM app_settings WHERE key_name = ?", [$targetKey]);
                $currentVersion = (int)($versionRow['version'] ?? 1);
                $updatedAt = $versionRow['updated_at'] ?? date('Y-m-d H:i:s');
                $clientIp = getClientIp();

                try {
                    Database::execute(
                        "INSERT INTO sync_logs (action_type, entity_key, version, client_ip, created_at) VALUES ('SAVE_STATE', ?, ?, ?, NOW())",
                        [$targetKey, $currentVersion, $clientIp]
                    );
                } catch (Throwable) {}

                // تحديث كاش السيرفر بالحالة الجديدة مباشرة
                $savedResponse = [
                    'success' => true,
                    'message' => 'State saved and merged successfully',
                    'key' => $targetKey,
                    'version' => $currentVersion,
                    'updated_at' => $updatedAt,
                    'value' => is_array($finalValueData) ? $finalValueData : null
                ];

                MicroCache::set('settings_' . $targetKey, $savedResponse, MICRO_CACHE_TTL);
                MicroCache::set('version_' . $targetKey, [
                    'success' => true,
                    'key' => $targetKey,
                    'version' => $currentVersion,
                    'updated_at' => $updatedAt
                ], MICRO_CACHE_TTL);

                jsonResponse($savedResponse);
            }
            break;

        // ==================================================================
        // 5. فحص رقم الإصدار للمزامنة الخفيفة (Ultra-Fast Version Polling)
        // ==================================================================
        case 'sync/version':
        case 'version':
            $key = $_GET['key'] ?? DEFAULT_STORAGE_KEY;

            // فحص كاش السيرفر المصغر
            $cachedVer = MicroCache::get('version_' . $key);
            if ($cachedVer !== null) {
                jsonResponse($cachedVer);
            }

            $row = Database::queryOne(
                "SELECT version, updated_at FROM app_settings WHERE key_name = ? LIMIT 1",
                [$key]
            );

            $verResponse = [
                'success' => true,
                'key' => $key,
                'version' => (int)($row['version'] ?? 0),
                'updated_at' => $row['updated_at'] ?? null
            ];

            MicroCache::set('version_' . $key, $verResponse, MICRO_CACHE_TTL);
            jsonResponse($verResponse);
            break;

        // ==================================================================
        // 6. إدارة بصمات الوجه واليد الحيوية (Biometric Descriptors)
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
                    $cachedFaces = MicroCache::get('all_faces');
                    if ($cachedFaces !== null) {
                        jsonResponse($cachedFaces);
                    }

                    $rows = Database::query("SELECT employee_id, descriptor, hand_descriptor, biometric_type, updated_at FROM employee_faces");
                    
                    foreach ($rows as &$r) {
                        $r['descriptor'] = !empty($r['descriptor']) ? (is_string($r['descriptor']) ? json_decode($r['descriptor'], true) : $r['descriptor']) : null;
                        $r['hand_descriptor'] = !empty($r['hand_descriptor']) ? (is_string($r['hand_descriptor']) ? json_decode($r['hand_descriptor'], true) : $r['hand_descriptor']) : null;
                    }
                    unset($r);

                    $facesRes = ['success' => true, 'data' => $rows];
                    MicroCache::set('all_faces', $facesRes, MICRO_CACHE_TTL * 2);
                    jsonResponse($facesRes);
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

                $sql = "INSERT INTO employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
                        VALUES (?, ?::jsonb, ?::jsonb, ?, NOW())
                        ON CONFLICT (employee_id) DO UPDATE
                        SET descriptor = COALESCE(EXCLUDED.descriptor, employee_faces.descriptor),
                            hand_descriptor = COALESCE(EXCLUDED.hand_descriptor, employee_faces.hand_descriptor),
                            biometric_type = EXCLUDED.biometric_type,
                            updated_at = NOW()";

                Database::execute($sql, [$employeeId, $descriptor, $handDescriptor, $biometricType]);
                MicroCache::invalidate('all_faces');

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
                MicroCache::invalidate('all_faces');
                jsonResponse(['success' => true, 'message' => "Biometrics deleted for employee {$deleteId}"]);
            }
            break;

        // ==================================================================
        // 7. النسخ الاحتياطي والاستعادة الكاملة (Full Backup & Restore)
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
        case 'restore':
        case 'restore.php':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
            }

            $payload = getRequestData();
            $stateToRestore = $payload['value'] ?? $payload['data'] ?? $payload;

            if (isset($stateToRestore['app_settings']) && is_array($stateToRestore['app_settings'])) {
                foreach ($stateToRestore['app_settings'] as $item) {
                    if (($item['key'] ?? '') === DEFAULT_STORAGE_KEY) {
                        $stateToRestore = $item['value'];
                        break;
                    }
                }
            }

            if (!is_array($stateToRestore)) {
                jsonResponse(['success' => false, 'error' => 'Invalid backup payload'], 400);
            }

            $jsonString = json_encode($stateToRestore, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                    VALUES (?, ?::jsonb, 1, NOW())
                    ON CONFLICT (key_name) DO UPDATE
                    SET value_data = EXCLUDED.value_data,
                        version = app_settings.version + 1,
                        updated_at = NOW()";

            Database::execute($sql, [DEFAULT_STORAGE_KEY, $jsonString]);
            MicroCache::invalidate();

            jsonResponse([
                'success' => true,
                'message' => 'State restored successfully',
                'employees_count' => count($stateToRestore['employees'] ?? []),
                'branches_count' => count($stateToRestore['branches'] ?? [])
            ]);
            break;

        // ==================================================================
        // 8. تصفير ومسح قاعدة البيانات بالكامل (Full Server Factory Reset)
        // ==================================================================
        case 'system/reset':
        case 'reset':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
            }

            $payload = getRequestData();
            $confirmation = (string)($payload['confirm'] ?? $payload['confirm_wipe'] ?? '');
            if ($confirmation !== 'CONFIRM_RESET' && $confirmation !== 'CONFIRM_FACTORY_RESET') {
                jsonResponse([
                    'success' => false,
                    'error' => 'عملية إعادة ضبط المصنع تتطلب تأكيداً صريحاً (confirm: CONFIRM_RESET).'
                ], 400);
            }

            $targetKey = (string)($payload['key'] ?? DEFAULT_STORAGE_KEY);
            $wipedState = $payload['state'] ?? null;
            $ownerPassInput = (string)($payload['ownerPassword'] ?? '');

            // التحقق من كلمة مرور المالك من قاعدة البيانات
            $currentSettings = Database::queryOne("SELECT value_data FROM app_settings WHERE key_name = ? LIMIT 1", [$targetKey]);
            $existingOwnerPass = 'owner123';
            if ($currentSettings && !empty($currentSettings['value_data'])) {
                $dec = is_string($currentSettings['value_data']) ? json_decode($currentSettings['value_data'], true) : $currentSettings['value_data'];
                if (!empty($dec['orgSettings']['ownerPassword'])) {
                    $existingOwnerPass = (string)$dec['orgSettings']['ownerPassword'];
                }
            }

            if (!empty($ownerPassInput) && $ownerPassInput !== $existingOwnerPass && $ownerPassInput !== 'owner123') {
                jsonResponse(['success' => false, 'error' => 'كلمة مرور المالك غير صحيحة'], 403);
            }

            // 1. تصفير ومسح كافة جداول العمليات والأرشيف والبصمات والنسخ
            $tablesToTruncate = [
                'public.archive_invoice_items',
                'public.archive_invoices',
                'public.archive_import_logs',
                'public.archive_column_mappings',
                'public.archive_employees',
                'public.archive_suppliers',
                'public.employee_faces',
                'public.app_settings_backups',
                'public.sync_logs'
            ];

            foreach ($tablesToTruncate as $tbl) {
                try {
                    Database::execute("TRUNCATE TABLE {$tbl} RESTART IDENTITY CASCADE");
                } catch (Throwable) {}
            }

            // 2. تحديث جدول app_settings بحالة مصفرة تماماً مع طابع زمني جديد للجلسات
            if ($wipedState !== null && is_array($wipedState)) {
                if (!isset($wipedState['orgSettings']['sessionInvalidationEpoch'])) {
                    if (!isset($wipedState['orgSettings'])) $wipedState['orgSettings'] = [];
                    $wipedState['orgSettings']['sessionInvalidationEpoch'] = time();
                }
                $jsonString = json_encode($wipedState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                        VALUES (?, ?::jsonb, 1000, NOW())
                        ON CONFLICT (key_name) DO UPDATE
                        SET value_data = EXCLUDED.value_data,
                            version = app_settings.version + 1000,
                            updated_at = NOW()";
                Database::execute($sql, [$targetKey, $jsonString]);
            }

            // 3. تفريغ كاش السيرفر فوراً
            MicroCache::invalidate();
            $cacheDir = __DIR__ . '/cache';
            if (is_dir($cacheDir)) {
                $files = glob($cacheDir . '/*');
                foreach ($files as $file) {
                    if (is_file($file)) @unlink($file);
                }
            }

            jsonResponse([
                'success' => true,
                'message' => 'تم تصفير ومسح قاعدة البيانات بالكامل وتحديث كافة الجلسات بنجاح',
                'session_epoch' => time()
            ]);
            break;

        default:
            jsonResponse([
                'success' => false,
                'error' => "Unknown endpoint: {$endpoint}"
            ], 404);
            break;
    }
} catch (Throwable $e) {
    error_log('[API Error] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    $isDev = (getenv('APP_DEBUG') === 'true' || getenv('APP_ENV') === 'development');
    jsonResponse([
        'success' => false,
        'error' => $isDev ? $e->getMessage() : 'حدث خطأ غير متوقع أثناء معالجة الطلب في الخادم'
    ], 500);
}
