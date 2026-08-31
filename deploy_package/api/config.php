<?php
/**
 * Configuration & Core Setup for Pharmacy HR & Archive System API
 * Compatible with PHP 8.1, 8.2, 8.3, 8.4, 8.5
 * Database Engine: PostgreSQL 16+ / 18+ (Default) or MariaDB/MySQL via PDO
 */

declare(strict_types=1);

// ضبط تقرير الأخطاء في وضع الإنتاج
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
@ini_set('memory_limit', '512M');
@ini_set('max_execution_time', '60');
@ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
ini_set('log_errors', '1');

// ضبط التوقيت الافتراضي
date_default_timezone_set('Africa/Cairo');

// إعدادات ترويسات CORS المفتوحة للاتصال من الويب والهاتف
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-App-Version, If-None-Match');
header('Access-Control-Max-Age: 86400'); // 24 hours cache for preflight

// ترويسات صارمة لمنع التخزين المؤقت (Anti-Cache / Zero-Cache)
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
// إعدادات الاتصال بقاعدة بيانات PostgreSQL (الأساسية) و MySQL / SQLite (الاحتياطية)
// --------------------------------------------------------------------------
define('DB_DRIVER', getenv('DB_DRIVER') ?: 'pgsql'); // 'pgsql' for PostgreSQL 16+/18+, 'sqlite' for local/fallback, 'mysql' for MySQL/MariaDB
define('DB_SQLITE_PATH', __DIR__ . '/../database/database.sqlite');
define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');  // PostgreSQL Host على Apex Thunder
define('DB_PORT', (int)(getenv('DB_PORT') ?: 5432));
define('DB_NAME', getenv('DB_NAME') ?: 'nodej8878_pharmacy_hr'); // اسم قاعدة البيانات
define('DB_USER', getenv('DB_USER') ?: 'nodej8878_pg');          // اسم مستخدم قاعدة البيانات
define('DB_PASS', getenv('DB_PASS') ?: 'C6kMke4Uwj_dYtbCNHJx55r*'); // كلمة المرور
define('DB_CHARSET', 'utf8');

// إعدادات MySQL/MariaDB الاحتياطية
define('MYSQL_HOST', getenv('MYSQL_HOST') ?: 'localhost');
define('MYSQL_PORT', (int)(getenv('MYSQL_PORT') ?: 3306));
define('MYSQL_NAME', getenv('MYSQL_NAME') ?: 'node_PharmacyHR');
define('MYSQL_USER', getenv('MYSQL_USER') ?: 'node_PharmacyHR');
define('MYSQL_PASS', getenv('MYSQL_PASS') ?: 'C6kMke4Uwj_dYtbCNHJx55r*');

// المفتاح الافتراضي لحفظ بيانات النظام
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
 * إرسال استجابة JSON موحدة خالية من أي كاش وسيط
 *
 * @param array<string, mixed>|object|null $data
 * @param int $statusCode
 * @return void
 */
function jsonResponse(mixed $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0');
    header('Pragma: no-cache');
    header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
    header('X-LiteSpeed-Cache-Control: no-cache, no-store');
    header('X-Accel-Buffering: no');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
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

    $mergeArrayEntities = function(array $arr1, array $arr2, string $prefix = 'item') use ($deletedSet) {
        $map = [];
        $addOrMerge = function(array $list) use (&$map, $deletedSet, $prefix) {
            foreach ($list as $item) {
                if (!is_array($item)) continue;
                $key = isset($item['id']) && $item['id'] !== '' ? (string)$item['id'] : null;
                if (!$key && isset($item['employeeId'], $item['date'])) {
                    $key = $item['employeeId'] . '_' . $item['date'] . '_' . ($item['type'] ?? '') . '_' . ($item['time'] ?? $item['timeIn'] ?? '');
                }
                if (!$key) {
                    $key = $prefix . '_' . md5(json_encode($item));
                }

                // فحص ما إذا كان العنصر محذوفاً
                if (isset($deletedSet[$key]) || (isset($item['id']) && isset($deletedSet[(string)$item['id']]))) {
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

                    if ($isOldApproved && !$isNewApproved) {
                        $merged = array_merge($item, $old);
                    } elseif ($tNew >= $tOld) {
                        $merged = array_merge($old, $item);
                    } else {
                        $merged = array_merge($item, $old);
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

    // Deep merge orgSettings and ownerModificationLocks
    if (isset($existing['orgSettings']) || isset($incoming['orgSettings'])) {
        $eOrg = is_array($existing['orgSettings'] ?? null) ? $existing['orgSettings'] : [];
        $iOrg = is_array($incoming['orgSettings'] ?? null) ? $incoming['orgSettings'] : [];
        $mergedOrg = array_merge($eOrg, $iOrg);

        $eLocks = is_array($eOrg['ownerModificationLocks'] ?? null) ? $eOrg['ownerModificationLocks'] : [];
        $iLocks = is_array($iOrg['ownerModificationLocks'] ?? null) ? $iOrg['ownerModificationLocks'] : [];
        if (!empty($eLocks) || !empty($iLocks)) {
            $mergedOrg['ownerModificationLocks'] = array_merge($eLocks, $iLocks);
        }
        $merged['orgSettings'] = $mergedOrg;
    }

    $merged['_deletedIds'] = array_slice($deletedIds, -3000);
    return $merged;
}
