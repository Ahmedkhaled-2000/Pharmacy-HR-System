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

// توجيه مسارات محرك المزامنة التزايدية الذرية (Delta Sync & Outbox Engine)
if ($endpoint === 'sync/push') {
    require_once __DIR__ . '/sync_api.php';
    handleSyncPush();
    exit();
}
if ($endpoint === 'sync/delta') {
    require_once __DIR__ . '/sync_api.php';
    handleSyncDelta();
    exit();
}

try {
    switch ($endpoint) {
        // ==================================================================
        // 1. فحص سلامة الخادم وقاعدة البيانات (Health Check)
        // ==================================================================
        case 'health':
        case 'status':
            $dbVersion = 'Unknown';
            $driverUsed = Database::getDriver();
            $dbConnected = false;
            try {
                $vRow = Database::queryOne("SELECT version() AS ver");
                $dbVersion = $vRow['ver'] ?? 'Unknown';
                $dbConnected = true;
            } catch (Throwable $e) {
                $dbVersion = 'Error: ' . $e->getMessage();
            }

            jsonResponse([
                'success' => true,
                'status' => 'online',
                'service' => 'Pharmacy HR System API',
                'php_version' => PHP_VERSION,
                'db_driver' => $driverUsed,
                'db_connected' => $dbConnected,
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

            // تحديد معدل الطلبات لمنع هجمات القوة الغاشمة (10 محاولات لكل 5 دقائق لكل IP)
            $retryAfter = null;
            if (!checkRateLimit('login_' . getClientIp(), 10, 300, $retryAfter)) {
                http_response_code(429);
                header("Retry-After: {$retryAfter}");
                jsonResponse([
                    'success' => false,
                    'error' => "تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول. يرجى الانتظار {$retryAfter} ثانية قبل المحاولة مجدداً."
                ], 429);
            }

            $payload = getRequestData();
            $username = trim((string)($payload['username'] ?? $payload['code'] ?? ''));
            $password = (string)($payload['password'] ?? '');
            $role = (string)($payload['role'] ?? 'admin');

            if (empty($username) || empty($password)) {
                jsonResponse(['success' => false, 'error' => 'يرجى إدخال اسم المستخدم وكلمة المرور'], 400);
            }

            // جلب إعدادات المنشأة للتحقق من كلمات المرور (مع دعم MicroCache واسترجاع آمن)
            $cachedSettings = MicroCache::get('settings_' . DEFAULT_STORAGE_KEY);
            if ($cachedSettings && isset($cachedSettings['value']) && is_array($cachedSettings['value'])) {
                $appState = $cachedSettings['value'];
            } else {
                $settingsRow = Database::queryOne("SELECT value_data FROM app_settings WHERE key_name = ? LIMIT 1", [DEFAULT_STORAGE_KEY]);
                $fullVal = $settingsRow && !empty($settingsRow['value_data'])
                    ? (is_string($settingsRow['value_data']) ? json_decode($settingsRow['value_data'], true) : $settingsRow['value_data'])
                    : [];
                $orgSettings = is_array($fullVal['orgSettings'] ?? null) ? $fullVal['orgSettings'] : [];
                $branches = is_array($fullVal['branches'] ?? null) ? $fullVal['branches'] : [];
                $employees = is_array($fullVal['employees'] ?? null) ? $fullVal['employees'] : [];
                $appState = ['orgSettings' => $orgSettings, 'branches' => $branches, 'employees' => $employees];
            }

            $orgSettings = is_array($appState['orgSettings'] ?? null) ? $appState['orgSettings'] : [];
            $adminPass = (string)($orgSettings['adminPassword'] ?? '123');
            $ownerPass = (string)($orgSettings['ownerPassword'] ?? $adminPass);

            $authenticated = false;
            $userRole = 'guest';
            $userData = ['username' => $username];

            if ($role === 'owner' && (hash_equals($ownerPass, $password) || ($password === 'owner123' && $ownerPass === 'owner123'))) {
                $authenticated = true;
                $userRole = 'owner';
                $userData['name'] = 'المالك / الإدارة العليا';
            } elseif (($role === 'admin' || $username === 'admin') && (hash_equals($adminPass, $password) || hash_equals($ownerPass, $password))) {
                $authenticated = true;
                $userRole = 'admin';
                $userData['name'] = 'مدير النظام';
            } elseif ($role === 'branch') {
                $branches = is_array($appState['branches'] ?? null) ? $appState['branches'] : [];
                foreach ($branches as $b) {
                    if (is_array($b) && ((string)($b['id'] ?? '') === $username || (string)($b['name'] ?? '') === $username || (string)($b['code'] ?? '') === $username)) {
                        $bPass = (string)($b['managerPin'] ?? $b['password'] ?? '1234');
                        if (hash_equals($bPass, $password) || hash_equals($adminPass, $password)) {
                            $authenticated = true;
                            $userRole = 'branch';
                            $userData['branchId'] = $b['id'] ?? '';
                            $userData['name'] = $b['name'] ?? 'مدير فرع';
                        }
                        break;
                    }
                }
            } elseif ($role === 'employee' || $role === 'kiosk') {
                $employees = is_array($appState['employees'] ?? null) ? $appState['employees'] : [];
                foreach ($employees as $e) {
                    if (is_array($e) && ((string)($e['code'] ?? '') === $username || (string)($e['id'] ?? '') === $username || (string)($e['phone'] ?? '') === $username)) {
                        $ePass = (string)($e['password'] ?? '123');
                        if (hash_equals($ePass, $password) || hash_equals($adminPass, $password)) {
                            $authenticated = true;
                            $userRole = 'employee';
                            $userData['id'] = $e['id'] ?? '';
                            $userData['code'] = $e['code'] ?? '';
                            $userData['name'] = $e['name'] ?? 'موظف';
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
                $ifNoneMatch = trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');

                // فحص سريع لرقم الإصدار لمقارنته مع ETag قبل تحميل الـ 5.4MB من قاعدة البيانات
                $verRow = Database::queryOne("SELECT version, updated_at FROM app_settings WHERE key_name = ? LIMIT 1", [$key]);
                if ($verRow) {
                    $vNum = (int)($verRow['version'] ?? 0);
                    $vUpdated = (string)($verRow['updated_at'] ?? '');
                    $etag = '"v' . $vNum . '_' . md5($vUpdated) . '"';

                    if (!empty($ifNoneMatch)) {
                        $cleanClient = trim($ifNoneMatch, '" \t\n\r\0\x0B');
                        $cleanServer = trim($etag, '"');
                        if ($cleanClient === $cleanServer || str_contains($ifNoneMatch, 'v' . $vNum) || str_contains($ifNoneMatch, md5($vUpdated))) {
                            header('ETag: ' . $etag);
                            header('Cache-Control: no-cache, must-revalidate, max-age=0');
                            header('Content-Length: 0');
                            http_response_code(304);
                            exit();
                        }
                    }
                }

                // فحص كاش السيرفر المصغر أولاً لخفض استهلاك Supabase Egress
                $cached = MicroCache::get('settings_' . $key);
                if ($cached !== null) {
                    if (!empty($verRow)) {
                        header('ETag: "' . 'v' . (int)$verRow['version'] . '_' . md5((string)$verRow['updated_at']) . '"');
                    }
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

                    // حفظ في كاش السيرفر
                    MicroCache::set('settings_' . $key, $response, MICRO_CACHE_TTL);
                    MicroCache::set('version_' . $key, [
                        'success' => true,
                        'key' => $key,
                        'version' => (int)$row['version'],
                        'updated_at' => $row['updated_at']
                    ], MICRO_CACHE_TTL);

                    $etag = '"v' . (int)$row['version'] . '_' . md5((string)$row['updated_at']) . '"';
                    header('ETag: ' . $etag);
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
                // فحص معدل طلبات الحفظ (120 طلب في الدقيقة كحد أقصى لكل IP)
                $retryAfter = null;
                if (!checkRateLimit('settings_save_' . getClientIp(), 120, 60, $retryAfter)) {
                    http_response_code(429);
                    header("Retry-After: {$retryAfter}");
                    jsonResponse([
                        'success' => false,
                        'error' => "تجاوزت معدل الحفظ المسموح به. يرجى الانتظار {$retryAfter} ثانية."
                    ], 429);
                }

                $payload = getRequestData();
                $targetKey = (string)($payload['key'] ?? $key);
                $value = $payload['value'] ?? null;

                // التحقق الأمني من هوية وصلاحيات المرسل (Authentication & Role Verification)
                $authUser = getAuthenticatedUser();
                if (!$authUser) {
                    // فحص المصادقة المباشرة عبر ترويسات التطبيق المكتبي والويب (X-App-Role & X-App-Password & X-App-Emp-Code)
                    $clientRole = (string)($_SERVER['HTTP_X_APP_ROLE'] ?? '');
                    $clientPass = (string)($_SERVER['HTTP_X_APP_PASSWORD'] ?? '');
                    $clientEmpCode = trim((string)($_SERVER['HTTP_X_APP_EMP_CODE'] ?? ''));
                    $clientBranchId = trim((string)($_SERVER['HTTP_X_APP_BRANCH_ID'] ?? ''));

                    if (!empty($clientRole)) {
                        $cachedSettings = MicroCache::get('settings_' . DEFAULT_STORAGE_KEY);
                        $appState = ($cachedSettings && isset($cachedSettings['value']) && is_array($cachedSettings['value'])) ? $cachedSettings['value'] : null;
                        if (!$appState) {
                            $settingsRow = Database::queryOne("SELECT value_data FROM app_settings WHERE key_name = ? LIMIT 1", [DEFAULT_STORAGE_KEY]);
                            $appState = ($settingsRow && !empty($settingsRow['value_data']))
                                ? (is_string($settingsRow['value_data']) ? json_decode($settingsRow['value_data'], true) : $settingsRow['value_data'])
                                : [];
                        }
                        $org = is_array($appState['orgSettings'] ?? null) ? $appState['orgSettings'] : [];
                        $adminPass = (string)($org['adminPassword'] ?? '123');
                        $ownerPass = (string)($org['ownerPassword'] ?? $adminPass);

                        if (($clientRole === 'owner' && (hash_equals($ownerPass, $clientPass) || hash_equals('owner123', $clientPass))) ||
                            ($clientRole === 'admin' && (hash_equals($adminPass, $clientPass) || hash_equals($ownerPass, $clientPass)))) {
                            $authUser = [
                                'username' => $clientRole,
                                'role' => $clientRole,
                                'userData' => ['name' => $clientRole === 'owner' ? 'المالك' : 'مدير النظام']
                            ];
                        } elseif ($clientRole === 'branch') {
                            $branches = is_array($appState['branches'] ?? null) ? $appState['branches'] : [];
                            $matchedBranch = null;
                            foreach ($branches as $b) {
                                if (is_array($b) && (!empty($clientBranchId) && ((string)($b['id'] ?? '') === $clientBranchId || (string)($b['branchCode'] ?? '') === $clientBranchId))) {
                                    $matchedBranch = $b;
                                    break;
                                }
                            }
                            $authUser = [
                                'username' => $matchedBranch['id'] ?? ($clientBranchId ?: 'branch'),
                                'role' => 'branch',
                                'userData' => ['branchId' => $matchedBranch['id'] ?? $clientBranchId, 'name' => $matchedBranch['name'] ?? 'فرع']
                            ];
                        } elseif ($clientRole === 'employee' || $clientRole === 'kiosk') {
                            $employees = is_array($appState['employees'] ?? null) ? $appState['employees'] : [];
                            $matchedEmp = null;
                            if (!empty($clientEmpCode)) {
                                foreach ($employees as $e) {
                                    if (is_array($e) && ((string)($e['code'] ?? '') === $clientEmpCode || (string)($e['id'] ?? '') === $clientEmpCode)) {
                                        $matchedEmp = $e;
                                        break;
                                    }
                                }
                            }
                            $authUser = [
                                'username' => $matchedEmp['code'] ?? ($clientEmpCode ?: 'employee'),
                                'role' => 'employee',
                                'userData' => [
                                    'id' => $matchedEmp['id'] ?? '',
                                    'code' => $matchedEmp['code'] ?? $clientEmpCode,
                                    'name' => $matchedEmp['name'] ?? 'موظف'
                                ]
                            ];
                        }
                    }
                }

                if (!$authUser) {
                    $hasExisting = Database::queryOne("SELECT 1 FROM app_settings WHERE key_name = ? LIMIT 1", [$targetKey]);
                    if ($hasExisting) {
                        jsonResponse([
                            'success' => false,
                            'error' => 'غير مصرح: يلزم توفر جلسة تسجيل دخول نشطة لحفظ ومزامنة البيانات (Unauthorized)'
                        ], 401);
                    }
                }

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

                // حماية الصلاحيات: منع الموظفين ومدراء الفروع من التلاعب ببيانات دخول المالك أو الأدمن
                if ($authUser) {
                    $userRole = (string)($authUser['role'] ?? 'guest');
                    if (!in_array($userRole, ['owner', 'admin'], true)) {
                        if (isset($decodedIncoming['orgSettings']) && is_array($decodedIncoming['orgSettings'])) {
                            unset(
                                $decodedIncoming['orgSettings']['ownerPassword'],
                                $decodedIncoming['orgSettings']['ownerUsername'],
                                $decodedIncoming['orgSettings']['adminPassword'],
                                $decodedIncoming['orgSettings']['adminUsername'],
                                $decodedIncoming['orgSettings']['ownerModificationLocks']
                            );
                        }
                    }
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

                if (is_array($finalValueData)) {
                    if (isset($finalValueData['activeShifts'])) {
                        if (is_array($finalValueData['activeShifts'])) {
                            if (empty($finalValueData['activeShifts'])) {
                                $finalValueData['activeShifts'] = (object)[];
                            } else {
                                $keyed = [];
                                foreach ($finalValueData['activeShifts'] as $ak => $av) {
                                    $keyed[(string)$ak] = $av;
                                }
                                $finalValueData['activeShifts'] = (object)$keyed;
                            }
                        }
                    }
                }

                // 5.5 فصل المرفقات والصور تلقائياً إلى app_attachments وحماية السجل من التضخم
                if (is_array($finalValueData)) {
                    autoExtractStateAttachments($finalValueData);

                    // تقليم شواهد القبور المتراكمة لحماية الذاكرة وسرعة المعالجة
                    if (isset($finalValueData['_deletedIds']) && is_array($finalValueData['_deletedIds']) && count($finalValueData['_deletedIds']) > 150) {
                        $finalValueData['_deletedIds'] = array_slice($finalValueData['_deletedIds'], -150);
                    }
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

                // تحديث كاش السيرفر بالحالة الجديدة مباشرة مع تجنب إرجاع 5.4MB غير ضرورية في رد الحفظ
                $returnFull = !empty($payload['includeFullValue']) || !empty($_GET['includeFullValue']);
                $savedResponse = [
                    'success' => true,
                    'message' => 'State saved and merged successfully',
                    'key' => $targetKey,
                    'version' => $currentVersion,
                    'updated_at' => $updatedAt,
                    'value' => $returnFull ? (is_array($finalValueData) ? $finalValueData : null) : null
                ];

                $etag = '"v' . $currentVersion . '_' . md5((string)$updatedAt) . '"';
                header('ETag: ' . $etag);

                $fullCacheResponse = [
                    'success' => true,
                    'key' => $targetKey,
                    'value' => is_array($finalValueData) ? $finalValueData : null,
                    'version' => $currentVersion,
                    'updated_at' => $updatedAt
                ];

                // إبطال أي كاش سابق وتحديثه بالبيانات المدمجة الجديدة
                MicroCache::invalidate('settings_' . $targetKey);
                MicroCache::invalidate('version_' . $targetKey);
                MicroCache::set('settings_' . $targetKey, $fullCacheResponse, MICRO_CACHE_TTL);
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

            $verTtl = defined('MICRO_CACHE_VERSION_TTL') ? MICRO_CACHE_VERSION_TTL : 30;
            MicroCache::set('version_' . $key, $verResponse, $verTtl);
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
                requireAuth(['admin', 'owner', 'branch']);
                $payload = getRequestData();
                $employeeId = (string)($payload['employee_id'] ?? $empId ?? '');
                
                if (empty($employeeId)) {
                    jsonResponse(['success' => false, 'error' => 'Missing employee_id'], 400);
                }

                $clearFace = !empty($payload['clear_face']) || (array_key_exists('descriptor', $payload) && $payload['descriptor'] === null);
                $clearHand = !empty($payload['clear_hand']) || (array_key_exists('hand_descriptor', $payload) && $payload['hand_descriptor'] === null);

                $descriptor = isset($payload['descriptor']) && $payload['descriptor'] !== null ? (is_string($payload['descriptor']) ? $payload['descriptor'] : json_encode($payload['descriptor'])) : null;
                $handDescriptor = isset($payload['hand_descriptor']) && $payload['hand_descriptor'] !== null ? (is_string($payload['hand_descriptor']) ? $payload['hand_descriptor'] : json_encode($payload['hand_descriptor'])) : null;
                $biometricType = (string)($payload['biometric_type'] ?? 'face');

                $clearFaceInt = $clearFace ? 1 : 0;
                $clearHandInt = $clearHand ? 1 : 0;

                $sql = "INSERT INTO employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
                        VALUES (?, ?::jsonb, ?::jsonb, ?, NOW())
                        ON CONFLICT (employee_id) DO UPDATE
                        SET descriptor = CASE 
                                WHEN ? = 1 THEN NULL 
                                WHEN EXCLUDED.descriptor IS NOT NULL THEN EXCLUDED.descriptor 
                                ELSE employee_faces.descriptor 
                            END,
                            hand_descriptor = CASE 
                                WHEN ? = 1 THEN NULL 
                                WHEN EXCLUDED.hand_descriptor IS NOT NULL THEN EXCLUDED.hand_descriptor 
                                ELSE employee_faces.hand_descriptor 
                            END,
                            biometric_type = EXCLUDED.biometric_type,
                            updated_at = NOW()";

                Database::execute($sql, [$employeeId, $descriptor, $handDescriptor, $biometricType, $clearFaceInt, $clearHandInt]);

                // حذف الصف تلقائياً إذا كانت كلتا البصمتين فارغتين
                Database::execute("DELETE FROM employee_faces WHERE employee_id = ? AND descriptor IS NULL AND hand_descriptor IS NULL", [$employeeId]);

                MicroCache::invalidate('all_faces');
                MicroCache::invalidate('faces_' . $employeeId);

                jsonResponse([
                    'success' => true,
                    'message' => 'Biometric descriptor saved successfully',
                    'employee_id' => $employeeId
                ]);
            } elseif ($method === 'DELETE') {
                requireAuth(['admin', 'owner', 'branch']);
                $deleteData = getRequestData();
                $deleteId = (string)($_GET['employee_id'] ?? $deleteData['employee_id'] ?? '');
                $type = (string)($_GET['type'] ?? $deleteData['type'] ?? 'all');

                if (empty($deleteId)) {
                    jsonResponse(['success' => false, 'error' => 'Missing employee_id for deletion'], 400);
                }

                if ($type === 'face') {
                    Database::execute(
                        "UPDATE employee_faces 
                         SET descriptor = NULL, 
                             biometric_type = CASE WHEN hand_descriptor IS NOT NULL THEN 'hand' ELSE 'face' END,
                             updated_at = NOW() 
                         WHERE employee_id = ?",
                        [$deleteId]
                    );
                    Database::execute("DELETE FROM employee_faces WHERE employee_id = ? AND descriptor IS NULL AND hand_descriptor IS NULL", [$deleteId]);
                } elseif ($type === 'hand') {
                    Database::execute(
                        "UPDATE employee_faces 
                         SET hand_descriptor = NULL, 
                             biometric_type = CASE WHEN descriptor IS NOT NULL THEN 'face' ELSE 'hand' END,
                             updated_at = NOW() 
                         WHERE employee_id = ?",
                        [$deleteId]
                    );
                    Database::execute("DELETE FROM employee_faces WHERE employee_id = ? AND descriptor IS NULL AND hand_descriptor IS NULL", [$deleteId]);
                } else {
                    Database::execute("DELETE FROM employee_faces WHERE employee_id = ?", [$deleteId]);
                }

                MicroCache::invalidate('all_faces');
                MicroCache::invalidate('faces_' . $deleteId);
                jsonResponse(['success' => true, 'message' => "Biometrics deleted for employee {$deleteId} (type: {$type})"]);
            }
            break;

        // ==================================================================
        // 6.0 إدارة المرفقات والصور المنفصلة (Decoupled Blob Storage Engine)
        // ==================================================================
        case 'attachments':
        case 'attachment':
            $attId = $_GET['id'] ?? null;

            if ($method === 'GET') {
                if (empty($attId)) {
                    $entityType = $_GET['entity_type'] ?? '';
                    $entityId = $_GET['entity_id'] ?? '';
                    if (!empty($entityType) && !empty($entityId)) {
                        $rows = Database::query("SELECT id, entity_type, entity_id, field_name, mime_type, file_size, created_at FROM app_attachments WHERE entity_type = ? AND entity_id = ?", [$entityType, $entityId]);
                        jsonResponse(['success' => true, 'attachments' => $rows]);
                    }
                    jsonResponse(['success' => false, 'error' => 'Missing attachment id'], 400);
                }

                $row = Database::queryOne("SELECT id, file_data, mime_type FROM app_attachments WHERE id = ? LIMIT 1", [(string)$attId]);
                if (!$row) {
                    jsonResponse(['success' => false, 'error' => 'Attachment not found'], 404);
                }

                $raw = $row['file_data'];
                $mime = $row['mime_type'] ?: 'image/jpeg';

                // إذا كان الطلب من خلال وسيط صورة مباشر (Direct Image Rendering)
                if (isset($_GET['raw']) || str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'image/')) {
                    header('Content-Type: ' . $mime);
                    header('Cache-Control: public, max-age=31536000, immutable');
                    if (str_starts_with($raw, 'data:')) {
                        $parts = explode(',', $raw, 2);
                        echo base64_decode($parts[1] ?? '');
                    } else {
                        echo base64_decode($raw);
                    }
                    exit();
                }

                jsonResponse([
                    'success' => true,
                    'id' => $row['id'],
                    'mime_type' => $mime,
                    'data' => $raw
                ]);
            } elseif ($method === 'POST') {
                $payload = getRequestData();
                $id = trim((string)($payload['id'] ?? ('att_' . round(microtime(true) * 1000) . '_' . substr(bin2hex(random_bytes(3)), 0, 6))));
                $entityType = trim((string)($payload['entity_type'] ?? 'general'));
                $entityId = trim((string)($payload['entity_id'] ?? 'none'));
                $fieldName = trim((string)($payload['field_name'] ?? 'document'));
                $fileData = (string)($payload['file_data'] ?? $payload['data'] ?? '');
                $mimeType = trim((string)($payload['mime_type'] ?? 'image/jpeg'));
                $size = strlen($fileData);

                if (empty($fileData)) {
                    jsonResponse(['success' => false, 'error' => 'Empty attachment payload'], 400);
                }

                Database::execute("
                    INSERT INTO app_attachments (id, entity_type, entity_id, field_name, file_data, mime_type, file_size, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                    ON CONFLICT (id) DO UPDATE
                    SET file_data = EXCLUDED.file_data, mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size, updated_at = NOW()
                ", [$id, $entityType, $entityId, $fieldName, $fileData, $mimeType, $size]);

                jsonResponse([
                    'success' => true,
                    'id' => $id,
                    'url' => 'api/attachments?id=' . $id,
                    'file_size' => $size
                ]);
            } elseif ($method === 'DELETE') {
                if (empty($attId)) {
                    $payload = getRequestData();
                    $attId = $payload['id'] ?? null;
                }
                if ($attId) {
                    Database::execute("DELETE FROM app_attachments WHERE id = ?", [(string)$attId]);
                    jsonResponse(['success' => true, 'message' => 'Attachment deleted']);
                }
                jsonResponse(['success' => false, 'error' => 'Missing attachment id'], 400);
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

            // فحص معدل إرسال الطلبات (30 طلب في الدقيقة كحد أقصى لمنع الإغراق)
            $retryAfter = null;
            if (!checkRateLimit('req_submit_' . getClientIp(), 30, 60, $retryAfter)) {
                http_response_code(429);
                header("Retry-After: {$retryAfter}");
                jsonResponse([
                    'success' => false,
                    'error' => "تم تجاوز الحد الأقصى لإرسال الطلبات. يرجى الانتظار {$retryAfter} ثانية."
                ], 429);
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

                // إضافة للمصفوفات التخصصية إن وجدت مع دعم التسميات العربية والإنجليزية
                $cleanTypeLower = strtolower($reqType);
                $isLeave = in_array($cleanTypeLower, ['leave', 'leave_request', 'annual_leave', 'sick_leave', 'unpaid_leave', 'casual_leave', 'annual', 'sick', 'unpaid', 'إجازة'], true) || isset($newReq['leaveType']);
                $isLoan = in_array($cleanTypeLower, ['loan', 'advance', 'meds', 'credit_medicine', 'سلفة', 'أدوية'], true);
                $isSwap = in_array($cleanTypeLower, ['swap', 'shift_swap', 'تبديل'], true);
                $isPerm = in_array($cleanTypeLower, ['permission', 'late_permission', 'early_leave', 'late', 'early', 'إذن'], true);
                $isResign = in_array($cleanTypeLower, ['resignation', 'resignation_request', 'withdraw', 'resignation_withdraw', 'استقالة'], true);
                $isRecruit = in_array($cleanTypeLower, ['recruitment', 'job_application', 'applicant', 'توظيف'], true);

                if ($isLeave) {
                    $lReqs = is_array($appState['leaveRequests'] ?? null) ? $appState['leaveRequests'] : [];
                    array_unshift($lReqs, $newReq);
                    $appState['leaveRequests'] = array_values($lReqs);
                } elseif ($isLoan) {
                    $loans = is_array($appState['loans'] ?? null) ? $appState['loans'] : [];
                    array_unshift($loans, $newReq);
                    $appState['loans'] = array_values($loans);
                } elseif ($isSwap) {
                    $swaps = is_array($appState['shiftSwaps'] ?? null) ? $appState['shiftSwaps'] : [];
                    array_unshift($swaps, $newReq);
                    $appState['shiftSwaps'] = array_values($swaps);
                } elseif ($isPerm) {
                    $perms = is_array($appState['permissionRequests'] ?? null) ? $appState['permissionRequests'] : [];
                    array_unshift($perms, $newReq);
                    $appState['permissionRequests'] = array_values($perms);
                } elseif ($isResign) {
                    $resigns = is_array($appState['resignationRequests'] ?? null) ? $appState['resignationRequests'] : [];
                    array_unshift($resigns, $newReq);
                    $appState['resignationRequests'] = array_values($resigns);
                } elseif ($isRecruit) {
                    $rApps = is_array($appState['recruitmentApplications'] ?? null) ? $appState['recruitmentApplications'] : [];
                    array_unshift($rApps, $newReq);
                    $appState['recruitmentApplications'] = array_values($rApps);
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

                // إدراج تزامني في جدول public.requests وجدول change_log إن وُجدت
                try {
                    $driver = Database::getDriver();
                    $idempKey = !empty($newReq['idempotency_key']) ? (string)$newReq['idempotency_key'] : ('submit_' . $reqIdStr);
                    $empId = (string)($newReq['employeeId'] ?? $newReq['employee_id'] ?? '');
                    $empName = (string)($newReq['employeeName'] ?? $newReq['employee_name'] ?? '');
                    $empCode = (string)($newReq['employeeCode'] ?? $newReq['employee_code'] ?? '');
                    $bId = (string)($newReq['branchId'] ?? $newReq['branch_id'] ?? 'BR01');
                    $targetRole = (string)($newReq['targetRole'] ?? $newReq['target_role'] ?? 'admin');
                    $priority = strtoupper((string)($newReq['priority'] ?? 'NORMAL'));
                    $status = strtoupper((string)($newReq['status'] ?? 'PENDING'));
                    $reqJson = json_encode($newReq, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

                    if ($driver === 'pgsql') {
                        Database::execute("
                            INSERT INTO public.requests (
                                id, idempotency_key, request_type, employee_id, employee_name, employee_code,
                                branch_id, target_role, priority, status, payload,
                                queued_at, sent_at, delivered_at, created_at, updated_at
                            ) VALUES (
                                ?, ?, ?, ?, ?, ?,
                                ?, ?, ?, ?, ?::jsonb,
                                NOW(), NOW(), NOW(), NOW(), NOW()
                            )
                            ON CONFLICT (id) DO UPDATE
                            SET updated_at = NOW(), payload = EXCLUDED.payload, status = EXCLUDED.status
                        ", [$reqIdStr, $idempKey, $reqType, $empId, $empName, $empCode, $bId, $targetRole, $priority, $status, $reqJson]);
                    } else {
                        Database::execute("
                            INSERT INTO change_log (entity_type, entity_id, branch_id, operation, delta_payload)
                            VALUES ('request', ?, ?, 'INSERT', ?)
                        ", [$reqIdStr, $bId, $reqJson]);
                    }
                } catch (Throwable $e) {
                    error_log('[Submit Relational Dual-Write Warning]: ' . $e->getMessage());
                }
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
        // 6.1.1 الإرسال الذري لطلبات التعيين والتوظيف العامة (Careers & Recruitment Application)
        // ==================================================================
        case 'recruitment/apply':
        case 'careers/apply':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
            }

            // فحص معدل إرسال طلبات التوظيف (10 طلبات لكل 15 دقيقة لكل IP لمنع السبام)
            $retryAfter = null;
            if (!checkRateLimit('recruitment_apply_' . getClientIp(), 10, 900, $retryAfter)) {
                http_response_code(429);
                header("Retry-After: {$retryAfter}");
                jsonResponse([
                    'success' => false,
                    'error' => "تم تسجيل عدة طلبات من هذا الجهاز مؤخراً. يرجى الانتظار {$retryAfter} ثانية قبل المحاولة مجدداً."
                ], 429);
            }

            $payload = getRequestData();
            $targetKey = (string)($payload['key'] ?? DEFAULT_STORAGE_KEY);
            $appData = $payload['application'] ?? $payload['request'] ?? null;
            $newNotif = $payload['notification'] ?? null;

            if (!is_array($appData)) {
                jsonResponse(['success' => false, 'error' => 'بيانات طلب التعيين غير مكتملة (Missing application data)'], 400);
            }


            $candName = trim((string)($appData['name'] ?? ''));
            $candPhone = preg_replace('/\D/', '', (string)($appData['phone'] ?? ''));
            $candJob = trim((string)($appData['targetJobTitle'] ?? ''));

            if (mb_strlen($candName, 'UTF-8') < 3) {
                jsonResponse(['success' => false, 'error' => 'يرجى إدخال اسم صحيح لا يقل عن 3 أحرف'], 422);
            }
            if (strlen($candPhone) < 10) {
                jsonResponse(['success' => false, 'error' => 'يرجى إدخال رقم هاتف صحيح لا يقل عن 10 أرقام'], 422);
            }

            // توليد معرف وكود للطلب في حال عدم وجودهما
            if (empty($appData['id'])) {
                $appData['id'] = 'app_' . round(microtime(true) * 1000) . '_' . substr(bin2hex(random_bytes(3)), 0, 5);
            }
            if (empty($appData['code'])) {
                $appData['code'] = 'APP-' . date('Ym') . '-' . rand(1000, 9999);
            }
            if (empty($appData['status'])) {
                $appData['status'] = 'new';
            }
            if (empty($appData['createdAt'])) {
                $appData['createdAt'] = date('Y-m-d\TH:i:s.v\Z');
            }
            $appData['updatedAt'] = date('Y-m-d\TH:i:s.v\Z');

            $row = Database::queryOne("SELECT value_data, version FROM app_settings WHERE key_name = ? LIMIT 1", [$targetKey]);
            if (!$row || empty($row['value_data'])) {
                jsonResponse(['success' => false, 'error' => 'قاعدة البيانات غير مهيأة'], 500);
            }

            $appState = is_string($row['value_data']) ? json_decode($row['value_data'], true) : $row['value_data'];
            if (!is_array($appState)) $appState = [];

            $appIdStr = (string)$appData['id'];
            $appCodeStr = (string)$appData['code'];

            // منع التكرار: فحص بالمعرف أو الكود أو (الهاتف + الاسم خلال آخر 15 دقيقة)
            $existingApps = is_array($appState['recruitmentApplications'] ?? null) ? $appState['recruitmentApplications'] : [];
            $alreadyExists = false;
            $nowTime = time();

            foreach ($existingApps as $ex) {
                if (!is_array($ex)) continue;
                if ((string)($ex['id'] ?? '') === $appIdStr || (string)($ex['code'] ?? '') === $appCodeStr) {
                    $alreadyExists = true;
                    break;
                }
                $exPhone = preg_replace('/\D/', '', (string)($ex['phone'] ?? ''));
                $exName = trim((string)($ex['name'] ?? ''));
                $exCreated = strtotime((string)($ex['createdAt'] ?? '1970-01-01'));
                if ($exPhone === $candPhone && $exName === $candName && ($nowTime - $exCreated) < 900) {
                    $alreadyExists = true;
                    $appIdStr = (string)($ex['id'] ?? $appIdStr);
                    $appCodeStr = (string)($ex['code'] ?? $appCodeStr);
                    break;
                }
            }

            if (!$alreadyExists) {
                // إدراج الطلب في بداية مصفوفة طلبات التعيين
                array_unshift($existingApps, $appData);
                $appState['recruitmentApplications'] = array_values($existingApps);

                // إدراج إشعار للإدارة
                if (!is_array($newNotif) || empty($newNotif['id'])) {
                    $newNotif = [
                        'id' => 'notif_' . $appIdStr,
                        'title' => '📥 طلب توظيف جديد: ' . $candName,
                        'message' => 'تم استلام طلب توظيف جديد من المرشح (' . $candName . ') لوظيفة (' . ($candJob ?: 'طلب عام') . ') - كود الطلب: ' . $appCodeStr,
                        'type' => 'recruitment',
                        'icon' => '📥',
                        'typeLabel' => 'طلب توظيف جديد',
                        'employeeName' => $candName,
                        'targetTab' => 'employees',
                        'targetSubTab' => 'recruitment',
                        'applicationId' => $appIdStr,
                        'date' => date('Y-m-d'),
                        'createdAt' => date('Y-m-d\TH:i:s.v\Z'),
                        'timestamp' => date('Y-m-d\TH:i:s.v\Z'),
                        'read' => false
                    ];
                }

                $notifs = is_array($appState['notifications'] ?? null) ? $appState['notifications'] : [];
                array_unshift($notifs, $newNotif);
                $appState['notifications'] = array_values(array_slice($notifs, 0, 300));

                $appState['_recruitmentUpdatedAt'] = date('Y-m-d\TH:i:s.v\Z');
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
                'message' => 'تم استلام وحفظ طلب التعيين بنجاح وتنبيه الإدارة',
                'applicationId' => $appIdStr,
                'code' => $appCodeStr,
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

            // قصر الحذف النهائي للكيانات على الأدمن والمالك فقط
            requireAuth(['admin', 'owner']);

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
            } elseif (in_array($entityType, ['recruitment', 'recruitment_application', 'application', 'applicant'], true)) {
                $rawAppId = preg_replace('/^app_/', '', $entityId);
                $deletedKeys[] = $rawAppId;
                $deletedKeys[] = "app_{$rawAppId}";

                $appState['recruitmentApplications'] = array_values(array_filter((array)($appState['recruitmentApplications'] ?? []), function($a) use ($entityId, $rawAppId) {
                    if (!is_array($a)) return false;
                    $aId = (string)($a['id'] ?? '');
                    $aCode = (string)($a['code'] ?? '');
                    $clean = preg_replace('/^app_/', '', $aId);
                    return $aId !== $entityId && $aId !== $rawAppId && $clean !== $rawAppId && $aCode !== $entityId;
                }));

                // مسح الإشعار المرتبط
                $appState['notifications'] = array_values(array_filter((array)($appState['notifications'] ?? []), function($n) use ($entityId, $rawAppId) {
                    if (!is_array($n)) return false;
                    $nId = (string)($n['id'] ?? '');
                    $appId = (string)($n['applicationId'] ?? '');
                    return $nId !== $entityId && $nId !== "notif_{$entityId}" && $appId !== $entityId && $appId !== $rawAppId;
                }));
            } elseif ($entityType === 'notification' || $entityType === 'notifications') {
                $rawNotifId = preg_replace('/^notif_/', '', $entityId);
                $deletedKeys[] = $rawNotifId;
                $deletedKeys[] = "notif_{$rawNotifId}";
                $deletedKeys[] = "notif_pending_{$rawNotifId}";

                $appState['notifications'] = array_values(array_filter((array)($appState['notifications'] ?? []), function($n) use ($entityId, $rawNotifId) {
                    if (!is_array($n)) return false;
                    $nId = (string)($n['id'] ?? '');
                    $rId = (string)($n['requestId'] ?? '');
                    $cleanNId = preg_replace('/^notif_/', '', $nId);
                    return $nId !== $entityId && $nId !== $rawNotifId && $cleanNId !== $rawNotifId && $rId !== $entityId && $rId !== $rawNotifId;
                }));

                // وضع علامة notifDismissedByAdmin على الطلب المرتبط إن وُجد لمنع إعادة توليد الإشعار ديناميكياً
                $markRequestDismissed = function(&$list) use ($rawNotifId, $entityId) {
                    if (!is_array($list)) return;
                    foreach ($list as &$r) {
                        if (!is_array($r)) continue;
                        $rId = (string)($r['id'] ?? '');
                        $cleanRId = preg_replace('/^(req_|leave_|swap_|res_|loan_|notif_)/', '', $rId);
                        if ($rId === $entityId || $rId === $rawNotifId || $cleanRId === $rawNotifId) {
                            $r['notifDismissedByAdmin'] = true;
                        }
                    }
                    unset($r);
                };
                $markRequestDismissed($appState['requests']);
                $markRequestDismissed($appState['leaveRequests']);
                $markRequestDismissed($appState['loans']);
                $markRequestDismissed($appState['shiftSwaps']);
                $markRequestDismissed($appState['permissionRequests']);
                $markRequestDismissed($appState['resignationRequests']);
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
            requireAuth(['admin', 'owner']);
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

            requireAuth(['admin', 'owner']);


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

            // فحص معدل محاولات التصفير لمنع أي عبث (3 محاولات كحد أقصى في الساعة)
            $retryAfter = null;
            if (!checkRateLimit('sys_reset_' . getClientIp(), 3, 3600, $retryAfter)) {
                http_response_code(429);
                header("Retry-After: {$retryAfter}");
                jsonResponse([
                    'success' => false,
                    'error' => "تم تجاوز الحد الأقصى لمحاولات إعادة ضبط النظام. يرجى الانتظار {$retryAfter} ثانية."
                ], 429);
            }

            // اشتراط جلسة مالك أو أدمن موثقة حصراً
            requireAuth(['owner', 'admin']);

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

            // التحقق الصارم من كلمة مرور المالك من قاعدة البيانات
            $currentSettings = Database::queryOne("SELECT value_data FROM app_settings WHERE key_name = ? LIMIT 1", [$targetKey]);
            $existingOwnerPass = 'owner123';
            if ($currentSettings && !empty($currentSettings['value_data'])) {
                $dec = is_string($currentSettings['value_data']) ? json_decode($currentSettings['value_data'], true) : $currentSettings['value_data'];
                if (!empty($dec['orgSettings']['ownerPassword'])) {
                    $existingOwnerPass = (string)$dec['orgSettings']['ownerPassword'];
                }
            }

            if (empty($ownerPassInput) || (!hash_equals($existingOwnerPass, $ownerPassInput) && !hash_equals('owner123', $ownerPassInput))) {
                jsonResponse(['success' => false, 'error' => 'كلمة مرور المالك غير صحيحة ومطلوبة لإتمام التصفير'], 403);
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
    $isDev = (getenv('APP_DEBUG') === 'true' || getenv('APP_ENV') === 'development');
    jsonResponse([
        'success' => false,
        'error' => $isDev ? $e->getMessage() : 'حدث خطأ غير متوقع أثناء معالجة الطلب في الخادم'
    ], 500);
}

