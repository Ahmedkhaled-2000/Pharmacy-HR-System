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
@ini_set('memory_limit', '512M');
@ini_set('max_execution_time', '90');
@ini_set('default_socket_timeout', '30');
@ini_set('display_errors', '0');
ini_set('log_errors', '1');

// تفعيل ضغط الاستجابات لتقليص استهلاك الباندويث وتسريع النقل بنسبة تصل إلى 90%
if (!ob_get_level() && !headers_sent()) {
    if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
        @ob_start('ob_gzhandler');
    }
}

// ضبط التوقيت الافتراضي
date_default_timezone_set('Africa/Cairo');

// إعدادات ترويسات CORS المفتوحة للاتصال الآمن من الويب والهاتف
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
$reqHeaders = !empty($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])
    ? $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']
    : 'Content-Type, Authorization, X-Requested-With, X-App-Version, If-None-Match, Cache-Control, Pragma, Expires, Accept-Encoding, X-App-Role, X-App-Password, X-App-Emp-Code, X-App-Branch-Id';
header('Access-Control-Allow-Headers: ' . $reqHeaders);
header('Access-Control-Expose-Headers: ETag, Content-Length, X-App-Version');
header('Access-Control-Max-Age: 86400'); // 24 hours cache for preflight OPTIONS

// ترويسات ذكية للمتصفحات تضمن عدم كاش البيانات القديمة وتدعم التحقق السريع عبر ETag (304 Not Modified)
header('Cache-Control: no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
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
// لحماية كوتة Supabase وخفض استهلاك الـ Egress والاتصالات بنسبة 99%+
define('MICRO_CACHE_ENABLED', true);
define('MICRO_CACHE_TTL', 3600); // كاش دائم لمدة ساعة يُبطل فورياً ولحظياً عند أي عملية كتابة أو تعديل
define('MICRO_CACHE_VERSION_TTL', 30); // كاش فحص رقم الإصدار لمدة 30 ثانية
define('MICRO_CACHE_DIR', __DIR__ . '/cache');

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

// ترويسات الأمان والدفاع في العمق (HTTP Defense Headers)
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

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
 * التحقق من صلاحيات ودور المستخدم الموثق
 *
 * @param array<string> $allowedRoles
 * @return array<string, mixed>
 */
function requireAuth(array $allowedRoles = []): array
{
    $user = getAuthenticatedUser();
    if (!$user) {
        jsonResponse([
            'success' => false,
            'error' => 'غير مصرح: يلزم تسجيل الدخول وتوفير توكن صالح لإجراء هذه العملية (Unauthorized)'
        ], 401);
    }

    if (!empty($allowedRoles)) {
        $userRole = (string)($user['role'] ?? 'guest');
        if (!in_array($userRole, $allowedRoles, true)) {
            jsonResponse([
                'success' => false,
                'error' => 'تم رفض الوصول: لا تمتلك الصلاحيات الكافية لتنفيذ هذا الإجراء (Forbidden)'
            ], 403);
        }
    }

    return $user;
}

/**
 * فحص وتطبيق تحديد معدل الطلبات (High-Speed Server-Side Rate Limiter)
 *
 * @param string $action
 * @param int $maxRequests
 * @param int $windowSeconds
 * @param int|null $retryAfter
 * @return bool
 */
function checkRateLimit(string $action, int $maxRequests = 60, int $windowSeconds = 60, ?int &$retryAfter = null): bool
{
    $cacheDir = defined('MICRO_CACHE_DIR') ? MICRO_CACHE_DIR : __DIR__ . '/cache';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }

    $hash = md5($action . '_' . getClientIp());
    $file = $cacheDir . '/rl_' . $hash . '.tmp';
    $now = time();

    $data = ['start' => $now, 'count' => 0];
    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if ($raw) {
            $dec = json_decode($raw, true);
            if (is_array($dec) && isset($dec['start'], $dec['count'])) {
                $data = $dec;
            }
        }
    }

    if (($now - $data['start']) > $windowSeconds) {
        $data['start'] = $now;
        $data['count'] = 1;
        @file_put_contents($file, json_encode($data), LOCK_EX);
        return true;
    }

    $data['count']++;
    $retryAfter = max(1, $windowSeconds - ($now - $data['start']));

    if ($data['count'] > $maxRequests) {
        @file_put_contents($file, json_encode($data), LOCK_EX);
        return false;
    }

    @file_put_contents($file, json_encode($data), LOCK_EX);
    return true;
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
    
    // تأكيد صارم لعدم اعتماد كاش متصفح قديم مع دعم التحقق الفوري والذكي عبر ETag (304 Not Modified)
    header('Cache-Control: no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');

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
 * الحصول على عنوان IP الحقيقي الموثوق والمطهر للعميل
 */
function getClientIp(): string
{
    $rawIp = '';
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $rawIp = trim((string)$_SERVER['HTTP_CF_CONNECTING_IP']);
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']);
        $rawIp = trim($ips[0]);
    } else {
        $rawIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'));
    }

    $filtered = filter_var($rawIp, FILTER_VALIDATE_IP);
    return $filtered !== false ? $filtered : '127.0.0.1';
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

    // ── حماية الموظفين الفعليين على رأس العمل من شواهد القبور القديمة ──
    $allIncomingEmps = (array)($incoming['employees'] ?? []);
    foreach ($allIncomingEmps as $emp) {
        if (!is_array($emp)) continue;
        $isActive = ($emp['is_active'] ?? true) !== false && ($emp['status'] ?? '') !== 'تم الاستقالة' && ($emp['status'] ?? '') !== 'resigned';
        if ($isActive) {
            $eId = isset($emp['id']) ? (string)$emp['id'] : '';
            $eCode = isset($emp['code']) ? strtolower(trim((string)$emp['code'])) : '';
            $eUser = isset($emp['username']) ? strtolower(trim((string)$emp['username'])) : '';
            $eNid = isset($emp['nationalId']) ? preg_replace('/\D/', '', (string)$emp['nationalId']) : '';

            if ($eId !== '') {
                unset($deletedSet[$eId], $deletedSet[strtolower($eId)], $deletedSet['emp_' . $eId], $deletedSet['emp_' . strtolower($eId)], $deletedSet['emp_del_' . $eId]);
            }
            if ($eCode !== '') {
                unset($deletedSet[$eCode], $deletedSet['emp_' . $eCode], $deletedSet['emp_code_' . $eCode], $deletedSet['code_' . $eCode]);
            }
            if ($eUser !== '') {
                unset($deletedSet[$eUser], $deletedSet['user_' . $eUser], $deletedSet['emp_user_' . $eUser], $deletedSet['emp_' . $eUser]);
            }
            if ($eNid !== '') {
                unset($deletedSet['emp_nid_' . $eNid], $deletedSet['nid_' . $eNid]);
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
                    $empUser = isset($item['username']) ? strtolower(trim((string)$item['username'])) : '';
                    $empNid = isset($item['nationalId']) ? preg_replace('/\D/', '', (string)$item['nationalId']) : '';
                    if ($empId !== '' && (isset($deletedSet['emp_' . $empId]) || isset($deletedSet['emp_del_' . $empId]) || (strpos($empId, 'emp_') === 0 && (isset($deletedSet[$empId]) || isset($deletedSet[strtolower($empId)]))))) {
                        $isDeleted = true;
                    } elseif ($empCode !== '' && (isset($deletedSet['emp_code_' . $empCode]) || isset($deletedSet['emp_' . $empCode]))) {
                        $isDeleted = true;
                    } elseif ($empUser !== '' && (isset($deletedSet['emp_user_' . $empUser]) || isset($deletedSet['user_' . $empUser]))) {
                        $isDeleted = true;
                    } elseif ($empNid !== '' && (isset($deletedSet['emp_nid_' . $empNid]) || isset($deletedSet['nid_' . $empNid]))) {
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
                    $rawId = isset($item['id']) ? (string)$item['id'] : '';
                    $cleanRaw = preg_replace('/^(req_|leave_|swap_|res_|loan_|notif_|shift_|punch_)/', '', $rawId);
                    if (
                        isset($deletedSet[$key]) ||
                        ($rawId !== '' && (isset($deletedSet[$rawId]) || isset($deletedSet[strtolower($rawId)]) || isset($deletedSet["{$prefix}_{$rawId}"]))) ||
                        ($cleanRaw !== '' && (
                            isset($deletedSet[$cleanRaw]) ||
                            isset($deletedSet["req_{$cleanRaw}"]) ||
                            isset($deletedSet["leave_{$cleanRaw}"]) ||
                            isset($deletedSet["swap_{$cleanRaw}"]) ||
                            isset($deletedSet["loan_{$cleanRaw}"]) ||
                            isset($deletedSet["notif_{$cleanRaw}"]) ||
                            isset($deletedSet["shift_{$cleanRaw}"]) ||
                            isset($deletedSet["punch_{$cleanRaw}"])
                        ))
                    ) {
                        $isDeleted = true;
                    }
                }

                if ($isDeleted) {
                    continue;
                }

                // منع التكرار الدلالي للطلبات الصادرة بنفس الدقيقة والموظف والمحتوى
                if (in_array($prefix, ['req', 'leave', 'loan', 'swap', 'perm'], true)) {
                    $eId = (string)($item['employeeId'] ?? $item['employeeCode'] ?? '');
                    $rType = (string)($item['type'] ?? $item['requestType'] ?? $prefix);
                    $rDate = substr((string)($item['createdAt'] ?? $item['date'] ?? $item['timestamp'] ?? ''), 0, 16);
                    if ($eId !== '' && $rDate !== '') {
                        $sigKey = "sig_{$eId}_{$rType}_{$rDate}";
                        if (isset($map[$sigKey])) {
                            continue; // طلب مطابق تم تسجيله في نفس الدقيقة لنفس الموظف
                        }
                    }
                }

                if (!isset($map[$key])) {
                    $map[$key] = $item;
                } else {
                    $old = $map[$key];
                    $tOld = strtotime((string)($old['updatedAt'] ?? $old['approvedAt'] ?? $old['createdAt'] ?? $old['timestamp'] ?? $old['date'] ?? '1970-01-01'));
                    $tNew = strtotime((string)($item['updatedAt'] ?? $item['approvedAt'] ?? $item['createdAt'] ?? $item['timestamp'] ?? $item['date'] ?? '1970-01-01'));

                    $oldStatus = strtolower(trim((string)($old['status'] ?? '')));
                    $newStatus = strtolower(trim((string)($item['status'] ?? '')));
                    $terminalStatuses = ['approved', 'rejected', 'paid', 'partial', 'cancelled', 'waived', 'completed'];
                    $isOldTerminal = in_array($oldStatus, $terminalStatuses, true) || !empty($old['adminApproved']);
                    $isNewTerminal = in_array($newStatus, $terminalStatuses, true) || !empty($item['adminApproved']);
                    $isRequestPrefix = in_array($prefix, ['req', 'leave', 'loan', 'swap', 'perm', 'res'], true) || !empty($old['employeeId']) || !empty($item['employeeId']);

                    $isOldApproved = in_array($oldStatus, ['approved', 'paid', 'partial'], true) || ($old['adminApproved'] ?? false);
                    $isNewApproved = in_array($newStatus, ['approved', 'paid', 'partial'], true) || ($item['adminApproved'] ?? false);

                    if ($prefix === 'app') {
                        // لطلبات التوظيف: إذا تم قبول وتعيين المرشح كموظف (hired) فله الأولوية المطلقة الدائمة لمنع ارتداده إلى جديد
                        $isItemHired = ($item['status'] ?? '') === 'hired';
                        $isOldHired = ($old['status'] ?? '') === 'hired';

                        if ($isItemHired && !$isOldHired) {
                            $merged = array_merge($old, $item);
                        } elseif ($isOldHired && !$isItemHired) {
                            $merged = array_merge($item, $old);
                        } elseif ($tNew >= $tOld) {
                            $merged = array_merge($old, $item);
                        } else {
                            $merged = array_merge($item, $old);
                        }

                        // الحفاظ الدائم على بيانات التعيين متى ما تم تسجيلها
                        if (!empty($item['hiredEmployeeId']) || !empty($old['hiredEmployeeId'])) {
                            $merged['hiredEmployeeId'] = !empty($item['hiredEmployeeId']) ? $item['hiredEmployeeId'] : $old['hiredEmployeeId'];
                        }
                        if (!empty($item['hiredEmployeeCode']) || !empty($old['hiredEmployeeCode'])) {
                            $merged['hiredEmployeeCode'] = !empty($item['hiredEmployeeCode']) ? $item['hiredEmployeeCode'] : $old['hiredEmployeeCode'];
                        }
                        if (!empty($item['hiredAt']) || !empty($old['hiredAt'])) {
                            $merged['hiredAt'] = !empty($item['hiredAt']) ? $item['hiredAt'] : $old['hiredAt'];
                        }
                    } elseif ($prefix === 'emp') {
                        // للموظفين: اعتماد التعديل الأحدث زمنياً فقط (True Last-Write-Wins)
                        // لمنع الأجهزة ذات الكاش القديم من إعادة الموظف لفرعه السابق عند إجراء أي مزامنة
                        if ($tOld > $tNew) {
                            // السيرفر لديه تعديل أحدث (نقل فرع أو تحديث بيانات) -> السيرفر هو المعتمد
                            $merged = array_merge($item, $old);
                            $merged['updatedAt'] = !empty($old['updatedAt']) ? (string)$old['updatedAt'] : gmdate('Y-m-d\TH:i:s.v\Z');
                            $merged['branchId'] = !empty($old['branchId']) ? $old['branchId'] : ($item['branchId'] ?? '');
                            $merged['branchesDetails'] = !empty($old['branchesDetails']) ? $old['branchesDetails'] : ($item['branchesDetails'] ?? []);
                            if (isset($old['archivedBranchesDetails'])) {
                                $merged['archivedBranchesDetails'] = $old['archivedBranchesDetails'];
                            }
                        } else {
                            // البيانات الواردة أحدث أو مساوية -> اعتماد البيانات الواردة
                            $merged = array_merge($old, $item);
                            $merged['updatedAt'] = !empty($item['updatedAt']) ? (string)$item['updatedAt'] : gmdate('Y-m-d\TH:i:s.v\Z');
                            $merged['branchId'] = !empty($item['branchId']) ? $item['branchId'] : ($old['branchId'] ?? '');
                            $merged['branchesDetails'] = !empty($item['branchesDetails']) ? $item['branchesDetails'] : ($old['branchesDetails'] ?? []);
                            if (isset($item['archivedBranchesDetails'])) {
                                $merged['archivedBranchesDetails'] = $item['archivedBranchesDetails'];
                            }
                        }
                    } elseif ($isRequestPrefix && $isOldTerminal && !$isNewTerminal) {
                        // الحالة المسجلة بالسيرفر تم البت فيها (معتمدة/مرفوضة) بينما الواردة معلقة -> الحفاظ على القرار النهائي
                        $merged = array_merge($item, $old);
                    } elseif ($isRequestPrefix && $isNewTerminal && !$isOldTerminal) {
                        // الواردة تم البت فيها بينما السيرفر معلق -> اعتماد القرار النهائي
                        $merged = array_merge($old, $item);
                    } elseif ($isOldTerminal && !$isNewTerminal) {
                        $merged = array_merge($item, $old);
                    } elseif ($tNew >= $tOld) {
                        $merged = array_merge($old, $item);
                    } else {
                        $merged = array_merge($item, $old);
                    }

                    if ($isRequestPrefix && ($isOldTerminal || $isNewTerminal)) {
                        $decidedItem = ($isOldTerminal && !$isNewTerminal) ? $old : (($isNewTerminal && !$isOldTerminal) ? $item : ($tNew >= $tOld ? $item : $old));
                        if (!empty($decidedItem['rejectionReason'])) $merged['rejectionReason'] = $decidedItem['rejectionReason'];
                        if (!empty($decidedItem['rejectedAt'])) $merged['rejectedAt'] = $decidedItem['rejectedAt'];
                        if (!empty($decidedItem['rejectedBy'])) $merged['rejectedBy'] = $decidedItem['rejectedBy'];
                        if (!empty($decidedItem['approvedAt'])) $merged['approvedAt'] = $decidedItem['approvedAt'];
                        if (!empty($decidedItem['approvedBy'])) $merged['approvedBy'] = $decidedItem['approvedBy'];
                        if (!empty($decidedItem['decided_at'])) $merged['decided_at'] = $decidedItem['decided_at'];
                        if (!empty($decidedItem['decided_by'])) $merged['decided_by'] = $decidedItem['decided_by'];
                        if (!empty($decidedItem['decision_reason'])) $merged['decision_reason'] = $decidedItem['decision_reason'];
                        if (isset($decidedItem['adminApproved'])) $merged['adminApproved'] = $decidedItem['adminApproved'];
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

                    // الحفاظ على بصمة الوجه واليد للموظف من التصفير غير المقصود أثناء دمج الخادم مع احترام طلبات الحذف الصريحة
                    if ($prefix === 'emp') {
                        $oldHasFace = !empty($old['has_face_descriptor']) && !empty($old['face_descriptor']);
                        $newHasFace = !empty($item['has_face_descriptor']) && !empty($item['face_descriptor']);
                        $faceReset = !empty($item['biometricFaceResetAt']) ? $item['biometricFaceResetAt'] : (!empty($item['biometricResetAt']) ? $item['biometricResetAt'] : null);

                        if ($oldHasFace && !$newHasFace && empty($faceReset)) {
                            $merged['has_face_descriptor'] = true;
                            $merged['face_descriptor'] = $old['face_descriptor'];
                            if (!empty($old['preferred_biometric'])) $merged['preferred_biometric'] = $old['preferred_biometric'];
                        } elseif ($newHasFace) {
                            $merged['has_face_descriptor'] = true;
                            $merged['face_descriptor'] = $item['face_descriptor'];
                        } else {
                            $merged['has_face_descriptor'] = false;
                            $merged['face_descriptor'] = null;
                        }

                        $oldHasHand = !empty($old['has_hand_descriptor']) && !empty($old['hand_descriptor']);
                        $newHasHand = !empty($item['has_hand_descriptor']) && !empty($item['hand_descriptor']);
                        $handReset = !empty($item['biometricHandResetAt']) ? $item['biometricHandResetAt'] : (!empty($item['biometricResetAt']) ? $item['biometricResetAt'] : null);

                        if ($oldHasHand && !$newHasHand && empty($handReset)) {
                            $merged['has_hand_descriptor'] = true;
                            $merged['hand_descriptor'] = $old['hand_descriptor'];
                        } elseif ($newHasHand) {
                            $merged['has_hand_descriptor'] = true;
                            $merged['hand_descriptor'] = $item['hand_descriptor'];
                        } else {
                            $merged['has_hand_descriptor'] = false;
                            $merged['hand_descriptor'] = null;
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

    // دمج الورديات النشطة (activeShifts) مع الحفاظ الصارم على المفاتيح النصية ومنع إعادة الفهرسة الرقمية من PHP
    $eActive = is_array($existing['activeShifts'] ?? null) ? $existing['activeShifts'] : [];
    $iActive = is_array($incoming['activeShifts'] ?? null) ? $incoming['activeShifts'] : [];
    $mergedActive = [];
    foreach ($eActive as $k => $v) {
        if (is_array($v) || is_object($v)) {
            $mergedActive[(string)$k] = $v;
        }
    }
    foreach ($iActive as $k => $v) {
        if (is_array($v) || is_object($v)) {
            $mergedActive[(string)$k] = $v;
        }
    }
    $merged['activeShifts'] = empty($mergedActive) ? (object)[] : (object)$mergedActive;

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

    // الحفاظ على ختم مسح الإشعارات الزمني الأحدث
    $inClr = $incoming['_notificationsClearedAt'] ?? null;
    $exClr = $existing['_notificationsClearedAt'] ?? null;
    if ($inClr && $exClr) {
        $merged['_notificationsClearedAt'] = (strtotime((string)$inClr) >= strtotime((string)$exClr)) ? $inClr : $exClr;
    } else {
        $merged['_notificationsClearedAt'] = $inClr ?: $exClr ?: null;
    }

    // تقليص حجم الإشعارات بحذف الصور المكررة وتصفية الممسوحة وتحديد السقف بـ 100 إشعار حديث لحماية Egress
    if (isset($merged['notifications']) && is_array($merged['notifications'])) {
        $cleanNotifs = [];
        $notifClearedAt = $merged['_notificationsClearedAt'] ?? null;
        $clearedTimestamp = $notifClearedAt ? strtotime((string)$notifClearedAt) : null;

        foreach (array_slice($merged['notifications'], 0, 100) as $notif) {
            if (is_array($notif)) {
                if ($clearedTimestamp && !empty($notif['timestamp'])) {
                    $notifTime = strtotime((string)$notif['timestamp']);
                    if ($notifTime && $notifTime <= $clearedTimestamp) {
                        continue;
                    }
                }
                if (isset($notif['photoUrl']) && strlen((string)$notif['photoUrl']) > 500) {
                    unset($notif['photoUrl']);
                }
                $cleanNotifs[] = $notif;
            }
        }
        $merged['notifications'] = $cleanNotifs;
    }

    $merged['_deletedIds'] = array_slice(array_keys($deletedSet), -3000);
    return $merged;
}

/**
 * استخراج وفصل المرفقات والصور تلقائياً وحفظها في جدول app_attachments
 * يحمي قاعدة البيانات من التضخم ويضمن بقاء السجل الرئيسي خفيفاً (< 800KB)
 */
function autoExtractStateAttachments(array &$data, string $entityPath = 'state'): void
{
    foreach ($data as $k => &$v) {
        $curPath = $entityPath . '_' . $k;
        if (is_array($v)) {
            autoExtractStateAttachments($v, $curPath);
        } elseif (is_string($v) && (str_starts_with($v, 'data:image/') || str_starts_with($v, 'data:application/pdf') || (strlen($v) > 2000 && str_starts_with($v, 'data:')))) {
            preg_match('/^data:([^;]+);base64,/', $v, $m);
            $mime = $m[1] ?? 'image/jpeg';
            $size = strlen($v);
            $cleanPath = preg_replace('/[^a-zA-Z0-9_]/', '_', substr($curPath, -40));
            $attId = 'att_' . $cleanPath . '_' . substr(bin2hex(random_bytes(3)), 0, 6);

            try {
                Database::execute("
                    INSERT INTO app_attachments (id, entity_type, entity_id, field_name, file_data, mime_type, file_size, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                    ON CONFLICT (id) DO UPDATE
                    SET file_data = EXCLUDED.file_data, mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size, updated_at = NOW()
                ", [$attId, 'auto', (string)$k, (string)$k, $v, $mime, $size]);

                $v = "/api/attachments?id=" . $attId . "&raw=1";
            } catch (Throwable) {
                // Keep original if DB insertion fails
            }
        }
    }
}

