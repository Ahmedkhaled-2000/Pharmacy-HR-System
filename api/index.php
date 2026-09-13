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
                $isForceReplace = !empty($payload['replaceDirectly']) || !empty($decodedIncoming['_forceOverride']);
                if (is_array($existingDecoded) && !$isForceReplace) {
                    $finalValueData = mergeServerState($existingDecoded, $decodedIncoming);
                }

                // 5. حماية معمارية التخزين المنفصل: منع تراكم اللقطات في Supabase وتدوير النسخ (FIFO Max 2)
                // يتم الاحتفاظ بنسختين فقط كحد أقصى للطوارئ مع تقنين الحفظ لمنع تضخم قاعدة البيانات
                $shouldCreateDbSnapshot = !empty($isExplicitReset) || !empty($payload['createSnapshot']);
                if (is_array($existingDecoded) && !empty($existingDecoded) && $shouldCreateDbSnapshot) {
                    try {
                        $jsonBackup = json_encode($existingDecoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
                        Database::execute(
                            "INSERT INTO app_settings_backups (key_name, value_data, version, client_ip, created_at) VALUES (?, ?::jsonb, ?, ?, NOW())",
                            [$targetKey, $jsonBackup, (int)($existingRow['version'] ?? 1), getClientIp()]
                        );

                        // سياسة التدوير الصارمة: حذف أي لقطات أقدم من أحدث نسختين فورياً
                        Database::execute(
                            "DELETE FROM app_settings_backups 
                             WHERE key_name = ? AND id NOT IN (
                                 SELECT id FROM app_settings_backups WHERE key_name = ? ORDER BY id DESC LIMIT 2
                             )",
                            [$targetKey, $targetKey]
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

                // إبطال أي كاش سابق فورياً وتحديثه بالبيانات المدمجة الجديدة
                MicroCache::invalidate('settings_' . $targetKey);
                MicroCache::invalidate('version_' . $targetKey);
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
        // 6.1 الإرسال الذري الخفيف للطلبات (Ultra-Lightweight Request Submit < 2KB)
        // ==================================================================
        case 'requests/submit':
        case 'request/submit':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
            }

            $payload = getRequestData();
            $targetKey = (string)($payload['key'] ?? DEFAULT_STORAGE_KEY);
            $newReq = $payload['request'] ?? null;
            $newNotif = $payload['notification'] ?? null;

            if (!is_array($newReq) || empty($newReq['id'])) {
                jsonResponse(['success' => false, 'error' => 'بيانات الطلب غير مكتملة (Missing request payload)'], 400);
            }

            $row = Database::queryOne("SELECT value_data, version FROM app_settings WHERE key_name = ? LIMIT 1", [$targetKey]);
            if (!$row || empty($row['value_data'])) {
                jsonResponse(['success' => false, 'error' => 'قاعدة البيانات غير مهيأة'], 500);
            }

            $appState = is_string($row['value_data']) ? json_decode($row['value_data'], true) : $row['value_data'];
            if (!is_array($appState)) $appState = [];

            $reqIdStr = (string)$newReq['id'];
            $reqType = (string)($newReq['type'] ?? $newReq['requestType'] ?? 'general');

            // 1. منع التكرار الصارم
            $existingReqs = is_array($appState['requests'] ?? null) ? $appState['requests'] : [];
            $alreadyExists = false;
            foreach ($existingReqs as $r) {
                if (is_array($r) && (string)($r['id'] ?? '') === $reqIdStr) {
                    $alreadyExists = true;
                    break;
                }
            }

            if (!$alreadyExists) {
                // إضافة للطلبات العامة
                array_unshift($existingReqs, $newReq);
                $appState['requests'] = array_values($existingReqs);

                // إضافة للمصفوفات التخصصية إن وجدت
                if (in_array($reqType, ['leave', 'leave_request', 'annual_leave', 'sick_leave', 'unpaid_leave'], true)) {
                    $lReqs = is_array($appState['leaveRequests'] ?? null) ? $appState['leaveRequests'] : [];
                    array_unshift($lReqs, $newReq);
                    $appState['leaveRequests'] = array_values($lReqs);
                } elseif (in_array($reqType, ['loan', 'advance', 'meds', 'credit_medicine'], true)) {
                    $loans = is_array($appState['loans'] ?? null) ? $appState['loans'] : [];
                    array_unshift($loans, $newReq);
                    $appState['loans'] = array_values($loans);
                } elseif (in_array($reqType, ['swap', 'shift_swap'], true)) {
                    $swaps = is_array($appState['shiftSwaps'] ?? null) ? $appState['shiftSwaps'] : [];
                    array_unshift($swaps, $newReq);
                    $appState['shiftSwaps'] = array_values($swaps);
                } elseif (in_array($reqType, ['permission', 'late_permission', 'early_leave'], true)) {
                    $perms = is_array($appState['permissionRequests'] ?? null) ? $appState['permissionRequests'] : [];
                    array_unshift($perms, $newReq);
                    $appState['permissionRequests'] = array_values($perms);
                }

                // إضافة الإشعار
                if (is_array($newNotif) && !empty($newNotif['id'])) {
                    $notifs = is_array($appState['notifications'] ?? null) ? $appState['notifications'] : [];
                    array_unshift($notifs, $newNotif);
                    $appState['notifications'] = array_values(array_slice($notifs, 0, 300));
                }

                $appState['_requestsUpdatedAt'] = date('Y-m-d\TH:i:s.v\Z');

                $jsonString = json_encode($appState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
                $updateSql = "UPDATE app_settings SET value_data = ?::jsonb, version = version + 1, updated_at = NOW() WHERE key_name = ?";
                Database::execute($updateSql, [$jsonString, $targetKey]);

                MicroCache::invalidate('settings_' . $targetKey);
                MicroCache::invalidate('version_' . $targetKey);
            }

            $freshRow = Database::queryOne("SELECT version, updated_at FROM app_settings WHERE key_name = ?", [$targetKey]);
            $newVer = (int)($freshRow['version'] ?? ($row['version'] + 1));

            jsonResponse([
                'success' => true,
                'message' => 'تم استلام وحفظ الطلب بنجاح في قاعدة البيانات',
                'requestId' => $reqIdStr,
                'version' => $newVer,
                'updated_at' => $freshRow['updated_at'] ?? date('Y-m-d H:i:s')
            ]);
            break;

        // ==================================================================
        // 6.2 الحذف النهائي البات من قاعدة البيانات (Permanent Hard Delete)
        // ==================================================================
        case 'entity/delete':
        case 'entity/hard-delete':
            if ($method !== 'POST' && $method !== 'DELETE') {
                jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
            }

            $payload = getRequestData();
            $targetKey = (string)($payload['key'] ?? DEFAULT_STORAGE_KEY);
            $entityType = (string)($payload['type'] ?? $_GET['type'] ?? '');
            $entityId = (string)($payload['id'] ?? $_GET['id'] ?? '');

            if (empty($entityType) || empty($entityId)) {
                jsonResponse(['success' => false, 'error' => 'Missing entity type or id for hard delete'], 400);
            }

            $row = Database::queryOne("SELECT value_data, version FROM app_settings WHERE key_name = ? LIMIT 1", [$targetKey]);
            if (!$row || empty($row['value_data'])) {
                jsonResponse(['success' => false, 'error' => 'State not found'], 404);
            }

            $appState = is_string($row['value_data']) ? json_decode($row['value_data'], true) : $row['value_data'];
            if (!is_array($appState)) $appState = [];

            $deletedKeys = [
                $entityId,
                strtolower($entityId)
            ];

            if ($entityType === 'employee') {
                $rawEmpId = preg_replace('/^emp_/', '', $entityId);
                $deletedKeys[] = "emp_{$rawEmpId}";
                $deletedKeys[] = "emp_del_{$rawEmpId}";
                $deletedKeys[] = $rawEmpId;

                // 1. حذف الموظف نهائياً من مصفوفة الموظفين
                $appState['employees'] = array_values(array_filter((array)($appState['employees'] ?? []), function($e) use ($rawEmpId, $entityId) {
                    if (!is_array($e)) return false;
                    $eId = (string)($e['id'] ?? '');
                    return $eId !== $entityId && $eId !== $rawEmpId && $eId !== "emp_{$rawEmpId}";
                }));

                // 2. حذف الموظف من جدول البصمات في Supabase
                try {
                    Database::execute("DELETE FROM employee_faces WHERE employee_id = ? OR employee_id = ?", [$entityId, $rawEmpId]);
                    MicroCache::invalidate('all_faces');
                } catch (Throwable) {}

                // 3. حذف الشفت النشط
                if (isset($appState['activeShifts'][$entityId])) unset($appState['activeShifts'][$entityId]);
                if (isset($appState['activeShifts'][$rawEmpId])) unset($appState['activeShifts'][$rawEmpId]);

            } elseif ($entityType === 'request') {
                $rawReqId = preg_replace('/^(req_|leave_|swap_|res_|loan_|notif_)/', '', $entityId);
                $deletedKeys[] = $rawReqId;
                $deletedKeys[] = "req_{$rawReqId}";
                $deletedKeys[] = "leave_{$rawReqId}";
                $deletedKeys[] = "swap_{$rawReqId}";
                $deletedKeys[] = "loan_{$rawReqId}";
                $deletedKeys[] = "notif_{$rawReqId}";

                $filterReq = function($list) use ($entityId, $rawReqId) {
                    return array_values(array_filter((array)$list, function($r) use ($entityId, $rawReqId) {
                        if (!is_array($r)) return false;
                        $rId = (string)($r['id'] ?? '');
                        $clean = preg_replace('/^(req_|leave_|swap_|res_|loan_|notif_)/', '', $rId);
                        return $rId !== $entityId && $rId !== $rawReqId && $clean !== $rawReqId && $clean !== $entityId;
                    }));
                };

                $appState['requests'] = $filterReq($appState['requests'] ?? []);
                $appState['leaveRequests'] = $filterReq($appState['leaveRequests'] ?? []);
                $appState['loans'] = $filterReq($appState['loans'] ?? []);
                $appState['shiftSwaps'] = $filterReq($appState['shiftSwaps'] ?? []);
                $appState['permissionRequests'] = $filterReq($appState['permissionRequests'] ?? []);
                $appState['resignationRequests'] = $filterReq($appState['resignationRequests'] ?? []);

                // مسح الإشعار المرتبط
                $appState['notifications'] = array_values(array_filter((array)($appState['notifications'] ?? []), function($n) use ($entityId, $rawReqId) {
                    if (!is_array($n)) return false;
                    $nId = (string)($n['id'] ?? '');
                    $rId = (string)($n['requestId'] ?? '');
                    return $nId !== $entityId && $nId !== $rawReqId && $rId !== $entityId && $rId !== $rawReqId;
                }));
            }

            // تحديث سجل شواهد القبور _deletedIds
            $existingDeleted = (array)($appState['_deletedIds'] ?? []);
            $appState['_deletedIds'] = array_values(array_slice(array_unique(array_merge($existingDeleted, $deletedKeys)), -5000));

            $jsonString = json_encode($appState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
            $updateSql = "UPDATE app_settings SET value_data = ?::jsonb, version = version + 1, updated_at = NOW() WHERE key_name = ?";
            Database::execute($updateSql, [$jsonString, $targetKey]);

            MicroCache::invalidate('settings_' . $targetKey);
            MicroCache::invalidate('version_' . $targetKey);

            $freshRow = Database::queryOne("SELECT version, updated_at FROM app_settings WHERE key_name = ?", [$targetKey]);
            $newVer = (int)($freshRow['version'] ?? ($row['version'] + 1));

            jsonResponse([
                'success' => true,
                'message' => "Entity {$entityType} ({$entityId}) deleted permanently from database",
                'version' => $newVer,
                'updated_at' => $freshRow['updated_at'] ?? date('Y-m-d H:i:s')
            ]);
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

            // 1. تصفير ومسح كافة جداول العمليات والأرشيف والبصمات والنسخ والقيود المحاسبية
            $tablesToTruncate = [
                'public.archive_invoice_items',
                'public.archive_invoices',
                'public.archive_import_logs',
                'public.archive_column_mappings',
                'public.archive_employees',
                'public.archive_suppliers',
                'public.employee_faces',
                'public.app_settings_backups',
                'public.sync_logs',
                'public.acc_journal_entries',
                'public.acc_journal_lines',
                'public.acc_cashier_closings',
                'public.acc_vendor_transactions'
            ];

            foreach ($tablesToTruncate as $tbl) {
                try {
                    Database::execute("TRUNCATE TABLE {$tbl} RESTART IDENTITY CASCADE");
                } catch (Throwable) {}
            }

            try {
                Database::execute("UPDATE public.acc_accounts SET opening_balance = 0, current_balance = 0");
                Database::execute("UPDATE public.acc_treasuries SET current_balance = 0");
                Database::execute("UPDATE public.acc_vendors SET current_balance = 0");
            } catch (Throwable) {}

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
    jsonResponse([
        'success' => false,
        'error' => $e->getMessage() ?: 'حدث خطأ غير متوقع أثناء معالجة الطلب في الخادم',
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ], 500);
}
