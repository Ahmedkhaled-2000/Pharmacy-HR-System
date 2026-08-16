<?php
/**
 * Configuration & Core Setup for Pharmacy HR System API
 * Compatible with PHP 8.1, 8.2, 8.3, 8.4, 8.5
 * Database Engine: MariaDB 10.11+ via mysqli
 */

declare(strict_types=1);

// ضبط تقرير الأخطاء في وضع الإنتاج
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// ضبط التوقيت الافتراضي
date_default_timezone_set('Africa/Cairo');

// إعدادات ترويسات CORS المفتوحة للاتصال من الويب والهاتف
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-App-Version');
header('Access-Control-Max-Age: 86400'); // 24 hours cache for preflight

// التعامل مع طلبات Preflight (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --------------------------------------------------------------------------
// إعدادات الاتصال بقاعدة بيانات MariaDB على استضافة Apex Thunder
// يمكنك تعديل هذه القيم حسب بيانات قاعدة البيانات التي قمت بإنشائها
// --------------------------------------------------------------------------
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', (int)(getenv('DB_PORT') ?: 3306));
define('DB_NAME', getenv('DB_NAME') ?: 'node_PharmacyHR');
define('DB_USER', getenv('DB_USER') ?: 'node_PharmacyHR');
define('DB_PASS', getenv('DB_PASS') ?: 'Ahmed.2000');
define('DB_CHARSET', 'utf8mb4');

// المفتاح الافتراضي لحفظ بيانات النظام
define('DEFAULT_STORAGE_KEY', 'pharmacy-tracker-data');

/**
 * إرسال استجابة JSON موحدة
 *
 * @param array<string, mixed>|object|null $data
 * @param int $statusCode
 * @return void
 */
function jsonResponse(mixed $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
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
