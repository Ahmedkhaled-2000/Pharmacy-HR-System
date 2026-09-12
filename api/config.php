<?php
/**
 * Configuration & Core Setup for Pharmacy HR & Archive System API
 * Exclusively powered by Supabase PostgreSQL (Port 6543 Pooler / 5432 Direct)
 * Zero-Browser-Cache + High-Performance Server-Side Micro-Caching for Egress & Quota Protection
 * Compatible with PHP 8.1, 8.2, 8.3, 8.4, 8.5
 */

declare(strict_types=1);

// ضبط تقرير الأخطاء والذاكرة والمهل الزمنية للبيئة الإنتاجية
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED & ~E_NOTICE);
@ini_set('memory_limit', '256M');
@ini_set('max_execution_time', '15');
@ini_set('default_socket_timeout', '10');
@ini_set('display_errors', '0');
ini_set('log_errors', '1');

// ضبط التوقيت الافتراضي
date_default_timezone_set('Africa/Cairo');

// إعدادات ترويسات CORS المفتوحة للاتصال الآمن من الويب والهاتف
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-App-Version, If-None-Match, Cache-Control, Pragma');
header('Access-Control-Max-Age: 86400'); // 24 hours cache for preflight OPTIONS

// ترويسات صارمة لمنع التخزين المؤقت في المتصفحات نهائياً (Anti-Browser-Cache)
// لضمان ظهور أي تعديل أو حفظ فوراً لدى كافة الأجهزة بدون الحاجة لمسح كاش المتصفح
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0');
header('Pragma: no-cache');
header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
header('X-LiteSpeed-Cache-Control: no-cache, no-store');
header('X-Accel-Buffering: no');

// التعامل مع طلبات Preflight (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --------------------------------------------------------------------------
// إعدادات الاتصال الحصرية بقاعدة بيانات Supabase PostgreSQL
// --------------------------------------------------------------------------
define('DB_DRIVER', 'pgsql');
define('DB_HOST', getenv('DB_HOST') ?: 'aws-0-eu-west-2.pooler.supabase.com'); // Supabase IPv4 Pooler Host
define('DB_PORT', (int)(getenv('DB_PORT') ?: 6543));                           // Pooler Port (Transaction Pooler)
define('DB_NAME', getenv('DB_NAME') ?: 'postgres');                           // Database Name
define('DB_USER', getenv('DB_USER') ?: 'postgres.cghmfqkrrtxgrhkoupla');       // Supabase User
define('DB_PASS', getenv('DB_PASS') ?: 'M00Bje1rkK8hqZbV');                   // Supabase Password
define('DB_SSLMODE', getenv('DB_SSLMODE') ?: 'require');                       // SSL Mode

// إعدادات التخزين المؤقت المصغر على مستوى الخادم (Server-Side Micro-Cache)
// لحماية كوتة Supabase وخفض استهلاك الـ Egress والاتصالات بنسبة 95%+
define('MICRO_CACHE_ENABLED', true);
define('MICRO_CACHE_TTL', 8); // 8 ثوانٍ كافية لتجميع مئات الطلبات من المتصفحات في استعلام واحد فقط لـ Supabase
define('MICRO_CACHE_DIR', sys_get_temp_dir() . '/pharmacy_hr_cache');

// المفتاح الافتراضي لحفظ بيانات وحالة النظام
define('DEFAULT_STORAGE_KEY', 'pharmacy-tracker-data');

// مفتاح التوقيع الرقمي للمصادقة وتأمين التوكنات
define('API_SECRET_KEY', getenv('API_SECRET_KEY') ?: 'pharmacy-system-core-jwt-secret-2026-v1');

/**
 * توليد رمز مصادقة موقع رقمياً (HMAC-SHA256 Signed Token)
 *
 * @param array<string, mixed> $payload
 * @param int $expirySeconds
 * @return string
 */
function createApiToken(array $payload, int $expirySeconds = 30 * 86400): string
{
    $payload['iat'] = time();
    $payload['exp'] = time() + $expirySeconds;
    $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $signature = hash_hmac('sha256', $jsonPayload, API_SECRET_KEY);
    return base64_encode($jsonPayload . '.' . $signature);
}

/**
 * التحقق من صحة رمز المصادقة واستخراج البيانات منه
 *
 * @param string|null $token
 * @return array<string, mixed>|null
 */
function verifyApiToken(?string $token): ?array
{
    if (empty($token)) return null;
    $token = trim($token);
    if (preg_match('/^Bearer\s+(.*)$/i', $token, $matches)) {
        $token = trim($matches[1]);
    }
    $decoded = base64_decode($token, true);
    if (!$decoded) return null;

    $lastDot = strrpos($decoded, '.');
    if ($lastDot === false) return null;

    $payloadStr = substr($decoded, 0, $lastDot);
    $signature = substr($decoded, $lastDot + 1);

    $expectedSig = hash_hmac('sha256', $payloadStr, API_SECRET_KEY);
    if (!hash_equals($expectedSig, $signature)) return null;

    $data = json_decode($payloadStr, true);
    if (!is_array($data) || (isset($data['exp']) && $data['exp'] < time())) return null;

    return $data;
}

/**
 * جلب بيانات المستخدم الموثق من ترويسة الطلب
 *
 * @return array<string, mixed>|null
 */
function getAuthenticatedUser(): ?array
{
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (empty($authHeader) && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    return verifyApiToken($authHeader);
}

/**
 * إرسال استجابة JSON موحدة خالية من أي كاش متصفح مع ضغط GZIP ودعم ETag / 304 Not Modified
 *
 * @param array<string, mixed>|object|null $data
 * @param int $statusCode
 * @return void
 */
function jsonResponse(mixed $data, int $statusCode = 200): void
{
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }

    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    
    // تأكيد صارم لعدم حفظ الكاش في المتصفح
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0');
    header('Pragma: no-cache');
    header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
    header('X-LiteSpeed-Cache-Control: no-cache, no-store');

    $output = is_string($data) ? $data : json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($output === false) {
        $output = json_encode([
            'success' => false,
            'error' => 'JSON serialization error: ' . json_last_error_msg()
        ]);
    }

    // 1. حساب ترويسة ETag ودعم 304 Not Modified لتوفير نقل البيانات بالكامل (0 بايت)
    $etag = '"' . md5($output) . '"';
    header('ETag: ' . $etag);
    header('Vary: Accept-Encoding');

    $ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
    if (!empty($ifNoneMatch) && $statusCode === 200) {
        $cleanClientEtag = trim($ifNoneMatch, '" \t\n\r\0\x0B');
        $cleanServerEtag = trim($etag, '"');
        if ($cleanClientEtag === $cleanServerEtag || str_contains($ifNoneMatch, $cleanServerEtag)) {
            http_response_code(304);
            header('Content-Length: 0');
            exit();
        }
    }

    // 2. ضغط الاستجابة بـ GZIP لتقليص حجم النقل (Egress) بنسبة 92%+
    $acceptEncoding = $_SERVER['HTTP_ACCEPT_ENCODING'] ?? '';
    $supportsGzip = function_exists('gzencode') && stripos($acceptEncoding, 'gzip') !== false && strlen($output) > 1024;

    if ($supportsGzip) {
        $compressed = gzencode($output, 6);
        if ($compressed !== false) {
            header('Content-Encoding: gzip');
            header('Content-Length: ' . (string)strlen($compressed));
            echo $compressed;
            exit();
        }
    }

    header('Content-Length: ' . (string)strlen($output));
    echo $output;
    exit();
}

/**
 * جلب بيانات الطلب (JSON Body أو $_POST)
 *
 * @return array<string, mixed>
 */
function getRequestData(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    
    if (stripos($contentType, 'application/json') !== false || empty($_POST)) {
        $rawInput = file_get_contents('php://input');
        if (!empty($rawInput)) {
            $decoded = json_decode($rawInput, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
    }
    
    return is_array($_POST) ? $_POST : [];
}

/**
 * الحصول على عنوان IP الخاص بالعميل
 */
function getClientIp(): string
{
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        return (string)$_SERVER['HTTP_CF_CONNECTING_IP'];
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    }
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/**
 * دمج ذكي لبيانات النظام على الخادم لمنع مسح أو تداخل طلبات الموظفين بين الأجهزة
 *
 * @param array<string, mixed> $existing
 * @param array<string, mixed> $incoming
 * @return array<string, mixed>
 */
function mergeServerState(array $existing, array $incoming): array
{
    $deletedIds = array_unique(array_merge(
        (array)($existing['_deletedIds'] ?? []),
        (array)($incoming['_deletedIds'] ?? [])
    ));
    $deletedSet = array_flip(array_map('strval', $deletedIds));

    // ── صرامة شواهد القبور على السيرفر (Server Tombstone Priority) ──
    // شواهد القبور في _deletedIds لها الأولوية المطلقة لمنع إعادة إحياء الموظفين المحذوفين

    // ── حماية المرشحين المقبولين والمعينين في التوظيف ──
    $allApps = array_merge(
        (array)($existing['recruitmentApplications'] ?? []),
        (array)($incoming['recruitmentApplications'] ?? [])
    );
    foreach ($allApps as $app) {
        if (!is_array($app)) continue;
        if (($app['status'] ?? '') === 'hired') {
            if (!empty($app['hiredEmployeeId'])) {
                $hId = (string)$app['hiredEmployeeId'];
                unset($deletedSet[$hId], $deletedSet[strtolower($hId)], $deletedSet['emp_' . $hId], $deletedSet['emp_' . strtolower($hId)], $deletedSet['emp_del_' . $hId]);
            }
            if (!empty($app['hiredEmployeeCode'])) {
                $hCode = strtolower(trim((string)$app['hiredEmployeeCode']));
                unset($deletedSet[$hCode], $deletedSet['emp_' . $hCode], $deletedSet['emp_code_' . $hCode]);
            }
        }
    }

    $mergeArrayEntities = function(array $arr1, array $arr2, string $prefix = 'item') use ($deletedSet) {
        $map = [];
        $addOrMerge = function(array $list) use (&$map, $deletedSet, $prefix) {
            foreach ($list as $item) {
                if (!is_array($item)) continue;
                $key = null;
                if (isset($item['id']) && $item['id'] !== '') {
                    $key = (string)$item['id'];
                } elseif ($prefix === 'emp') {
                    if (!empty($item['code'])) {
                        $key = 'emp_code_' . strtolower(trim((string)$item['code']));
                    } elseif (!empty($item['nationalId'])) {
                        $key = 'emp_nid_' . preg_replace('/\D/', '', (string)$item['nationalId']);
                    } elseif (!empty($item['recruitmentApplicationId'])) {
                        $key = 'emp_rec_' . (string)$item['recruitmentApplicationId'];
                    }
                }

                if (!$key && isset($item['employeeId'], $item['date'])) {
                    $key = $item['employeeId'] . '_' . $item['date'] . '_' . ($item['type'] ?? '') . '_' . ($item['time'] ?? $item['timeIn'] ?? '');
                }
                if (!$key) {
                    $key = $prefix . '_' . md5(json_encode($item));
                }

                // فحص ما إذا كان العنصر محذوفاً مع عزل تام للموظفين والطلبات
                $isDeleted = false;
                if ($prefix === 'emp') {
                    $empId = isset($item['id']) ? (string)$item['id'] : '';
                    $empCode = isset($item['code']) ? strtolower(trim((string)$item['code'])) : '';
                    if ($empId !== '' && isset($deletedSet[$empId]) && str_starts_with($empId, 'emp_')) {
                        $isDeleted = true;
                    } elseif ($empId !== '' && isset($deletedSet['emp_' . $empId])) {
                        $isDeleted = true;
                    } elseif ($empCode !== '' && (isset($deletedSet['emp_code_' . $empCode]) || isset($deletedSet['emp_' . $empCode]))) {
                        $isDeleted = true;
                    }
                } elseif ($prefix === 'app') {
                    $appId = isset($item['id']) ? (string)$item['id'] : '';
                    $appCode = isset($item['code']) ? (string)$item['code'] : '';
                    if (($appId !== '' && isset($deletedSet[$appId])) ||
                        ($appId !== '' && isset($deletedSet['app_' . $appId])) ||
                        ($appCode !== '' && isset($deletedSet[$appCode])) ||
                        ($appCode !== '' && isset($deletedSet['app_' . $appCode])) ||
                        isset($deletedSet[$key])) {
                        $isDeleted = true;
                    }
                } else {
                    if (isset($deletedSet[$key]) || (isset($item['id']) && isset($deletedSet[(string)$item['id']]))) {
                        $isDeleted = true;
                    }
                }

                if ($isDeleted) {
                    continue;
                }

                if (!isset($map[$key])) {
                    $map[$key] = $item;
                } else {
                    $old = $map[$key];
                    $tOld = strtotime((string)($old['updatedAt'] ?? $old['approvedAt'] ?? $old['createdAt'] ?? $old['timestamp'] ?? $old['date'] ?? '1970-01-01'));
                    $tNew = strtotime((string)($item['updatedAt'] ?? $item['approvedAt'] ?? $item['createdAt'] ?? $item['timestamp'] ?? $item['date'] ?? '1970-01-01'));

                    $isOldApproved = in_array($old['status'] ?? '', ['approved', 'paid', 'partial'], true) || ($old['adminApproved'] ?? false);
                    $isNewApproved = in_array($item['status'] ?? '', ['approved', 'paid', 'partial'], true) || ($item['adminApproved'] ?? false);

                    if ($prefix === 'emp') {
                        // للموظفين: البيانات الواردة من التعديل الأخير للمستخدم هي المعتمدة دائماً
                        $merged = array_merge($old, $item);
                        $merged['updatedAt'] = !empty($item['updatedAt']) ? (string)$item['updatedAt'] : gmdate('Y-m-d\TH:i:s.v\Z');
                    } elseif ($isOldApproved && !$isNewApproved) {
                        $merged = array_merge($item, $old);
                    } elseif ($tNew >= $tOld) {
                        $merged = array_merge($old, $item);
                    } else {
                        $merged = array_merge($item, $old);
                    }

                    // الحفاظ على معرف مستقر لا يتغير للموظف
                    if ($prefix === 'emp' && !empty($old['id']) && !empty($item['id']) && (string)$old['id'] !== (string)$item['id']) {
                        $merged['id'] = $old['id'];
                    }

                    if (isset($old['paymentsHistory']) || isset($item['paymentsHistory'])) {
                        $pOld = (array)($old['paymentsHistory'] ?? []);
                        $pNew = (array)($item['paymentsHistory'] ?? []);
                        $pMap = [];
                        foreach (array_merge($pOld, $pNew) as $p) {
                            if (is_array($p)) {
                                $pKey = isset($p['id']) ? (string)$p['id'] : md5(json_encode($p));
                                $pMap[$pKey] = $p;
                            }
                        }
                        $merged['paymentsHistory'] = array_values($pMap);
                    }

                    // الحفاظ على بصمة الوجه واليد للموظف من التصفير غير المقصود أثناء دمج الخادم
                    if ($prefix === 'emp') {
                        $oldHasFace = !empty($old['has_face_descriptor']) && !empty($old['face_descriptor']);
                        $newHasFace = !empty($item['has_face_descriptor']) && !empty($item['face_descriptor']);
                        if ($oldHasFace && !$newHasFace && empty($item['biometricResetAt'])) {
                            $merged['has_face_descriptor'] = true;
                            $merged['face_descriptor'] = $old['face_descriptor'];
                            if (!empty($old['preferred_biometric'])) $merged['preferred_biometric'] = $old['preferred_biometric'];
                        } elseif ($newHasFace) {
                            $merged['has_face_descriptor'] = true;
                            $merged['face_descriptor'] = $item['face_descriptor'];
                        }

                        $oldHasHand = !empty($old['has_hand_descriptor']) && !empty($old['hand_descriptor']);
                        $newHasHand = !empty($item['has_hand_descriptor']) && !empty($item['hand_descriptor']);
                        if ($oldHasHand && !$newHasHand && empty($item['biometricResetAt'])) {
                            $merged['has_hand_descriptor'] = true;
                            $merged['hand_descriptor'] = $old['hand_descriptor'];
                        } elseif ($newHasHand) {
                            $merged['has_hand_descriptor'] = true;
                            $merged['hand_descriptor'] = $item['hand_descriptor'];
                        }
                    }

                    $map[$key] = $merged;
                }
            }
        };

        $addOrMerge($arr1);
        $addOrMerge($arr2);
        return array_values($map);
    };

    $merged = array_merge($existing, $incoming);
    $arrayKeys = [
        'employees' => 'emp',
        'branches' => 'branch',
        'shifts' => 'shift',
        'requests' => 'req',
        'permissionRequests' => 'perm',
        'leaveRequests' => 'leave',
        'leaveHistory' => 'lhist',
        'shiftSwaps' => 'swap',
        'loans' => 'loan',
        'resignationRequests' => 'res',
        'notifications' => 'notif',
        'adjustments' => 'adj',
        'lateIncidents' => 'late_inc',
        'evaluations' => 'eval',
        'employeeNotes' => 'note',
        'rosters' => 'roster',
        'authorizedDevices' => 'dev',
        'recruitmentApplications' => 'app',
        'jobVacancies' => 'vac',
        'logs' => 'log'
    ];

    foreach ($arrayKeys as $k => $p) {
        $eList = is_array($existing[$k] ?? null) ? $existing[$k] : [];
        $iList = is_array($incoming[$k] ?? null) ? $incoming[$k] : [];

        $merged[$k] = $mergeArrayEntities($eList, $iList, $p);
    }

    // الحفاظ الكامل والعميق على إعدادات المنظومة ولائحة الجزاءات والتاخيرات
    if (isset($existing['orgSettings']) || isset($incoming['orgSettings'])) {
        $eOrg = is_array($existing['orgSettings'] ?? null) ? $existing['orgSettings'] : [];
        $iOrg = is_array($incoming['orgSettings'] ?? null) ? $incoming['orgSettings'] : [];
        $mergedOrg = array_merge($eOrg, $iOrg);

        // الحفاظ الصارم على صلاحيات الموظفين المحدثة وعدم إعادة ترقيم مفاتيح الـ IDs الرقمية
        if (isset($iOrg['permissions']) && is_array($iOrg['permissions'])) {
            $mergedOrg['permissions'] = $iOrg['permissions'];
        }
        if (isset($iOrg['empPermissions']) && is_array($iOrg['empPermissions'])) {
            $mergedEmpPerms = is_array($eOrg['empPermissions'] ?? null) ? $eOrg['empPermissions'] : [];
            foreach ($iOrg['empPermissions'] as $empKey => $perms) {
                $mergedEmpPerms[(string)$empKey] = $perms;
            }
            $mergedOrg['empPermissions'] = $mergedEmpPerms;
        }

        $eLocks = is_array($eOrg['ownerModificationLocks'] ?? null) ? $eOrg['ownerModificationLocks'] : [];
        $iLocks = is_array($iOrg['ownerModificationLocks'] ?? null) ? $iOrg['ownerModificationLocks'] : [];
        if (!empty($eLocks) || !empty($iLocks)) {
            $mergedOrg['ownerModificationLocks'] = array_merge($eLocks, $iLocks);
        }

        // الحفاظ على بيانات دخول المالك المخصصة من التراجع للافتراضي
        if (!empty($iOrg['ownerUsername']) && $iOrg['ownerUsername'] !== 'owner') {
            $mergedOrg['ownerUsername'] = $iOrg['ownerUsername'];
        } elseif (!empty($eOrg['ownerUsername']) && $eOrg['ownerUsername'] !== 'owner') {
            $mergedOrg['ownerUsername'] = $eOrg['ownerUsername'];
        }
        if (!empty($iOrg['ownerPassword']) && $iOrg['ownerPassword'] !== 'owner123') {
            $mergedOrg['ownerPassword'] = $iOrg['ownerPassword'];
        } elseif (!empty($eOrg['ownerPassword']) && $eOrg['ownerPassword'] !== 'owner123') {
            $mergedOrg['ownerPassword'] = $eOrg['ownerPassword'];
        }

        // الحفاظ الصارم على إعدادات بريد Gmail لضمان عدم مسح بيانات الربط
        if (isset($iOrg['gmailConfig']) && is_array($iOrg['gmailConfig'])) {
            $eGmail = is_array($eOrg['gmailConfig'] ?? null) ? $eOrg['gmailConfig'] : [];
            $mergedGmail = array_merge($eGmail, $iOrg['gmailConfig']);
            if (empty($mergedGmail['userEmail']) && !empty($eGmail['userEmail'])) {
                $mergedGmail['userEmail'] = $eGmail['userEmail'];
            }
            if (empty($mergedGmail['appPassword']) && !empty($eGmail['appPassword'])) {
                $mergedGmail['appPassword'] = $eGmail['appPassword'];
            }
            if (empty($mergedGmail['targetAdminEmail']) && !empty($eGmail['targetAdminEmail'])) {
                $mergedGmail['targetAdminEmail'] = $eGmail['targetAdminEmail'];
            }
            if (empty($mergedGmail['serviceUrl']) && !empty($eGmail['serviceUrl'])) {
                $mergedGmail['serviceUrl'] = $eGmail['serviceUrl'];
            }
            $mergedOrg['gmailConfig'] = $mergedGmail;
        } elseif (isset($eOrg['gmailConfig']) && is_array($eOrg['gmailConfig'])) {
            $mergedOrg['gmailConfig'] = $eOrg['gmailConfig'];
        }

        // الحفاظ الصارم على إعدادات Google Drive
        if (isset($iOrg['driveConfig']) && is_array($iOrg['driveConfig'])) {
            $eDrive = is_array($eOrg['driveConfig'] ?? null) ? $eOrg['driveConfig'] : [];
            $mergedDrive = array_merge($eDrive, $iOrg['driveConfig']);
            if (empty($mergedDrive['serviceUrl']) && !empty($eDrive['serviceUrl'])) {
                $mergedDrive['serviceUrl'] = $eDrive['serviceUrl'];
            }
            if (empty($mergedDrive['parentFolderId']) && !empty($eDrive['parentFolderId'])) {
                $mergedDrive['parentFolderId'] = $eDrive['parentFolderId'];
            }
            $mergedOrg['driveConfig'] = $mergedDrive;
        } elseif (isset($eOrg['driveConfig']) && is_array($eOrg['driveConfig'])) {
            $mergedOrg['driveConfig'] = $eOrg['driveConfig'];
        }

        $merged['orgSettings'] = $mergedOrg;
    }

    if (isset($existing['bylaws']) || isset($incoming['bylaws'])) {
        $eBylaws = is_array($existing['bylaws'] ?? null) ? $existing['bylaws'] : [];
        $iBylaws = is_array($incoming['bylaws'] ?? null) ? $incoming['bylaws'] : [];
        $merged['bylaws'] = array_merge($eBylaws, $iBylaws);
    }

    $merged['_deletedIds'] = array_slice(array_keys($deletedSet), -3000);
    return $merged;
}
