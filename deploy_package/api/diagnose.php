<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

// حماية مسار الفحص من الوصول غير المصرح به
$diagnoseSecret = getenv('DIAGNOSE_SECRET') ?: 'diag_pharmacy_2026';
$providedSecret = $_GET['secret'] ?? $_SERVER['HTTP_X_DIAGNOSE_SECRET'] ?? '';
$isDev = (getenv('APP_DEBUG') === 'true' || getenv('APP_ENV') === 'development' || in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true));

if (!$isDev && $providedSecret !== $diagnoseSecret) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error' => 'Access denied. Provide valid secret parameter ?secret=...'
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

$results = [
    'status' => 'online',
    'service' => 'Pharmacy HR System API (Supabase Dedicated Diagnostic)',
    'php_version' => PHP_VERSION,
    'pdo_drivers' => PDO::getAvailableDrivers(),
    'supabase_host' => DB_HOST,
    'supabase_port' => DB_PORT,
    'supabase_user' => DB_USER,
    'supabase_db' => DB_NAME,
    'micro_cache_enabled' => defined('MICRO_CACHE_ENABLED') ? MICRO_CACHE_ENABLED : false,
    'micro_cache_ttl' => defined('MICRO_CACHE_TTL') ? MICRO_CACHE_TTL : 0,
    'supabase_connection' => null,
    'tables_audit' => null,
    'app_settings_check' => null,
];

// 1. فحص الاتصال وقراءة النسخة وزمن الاستجابة
$startTime = microtime(true);
try {
    $db = Database::getConnection();
    $verRow = Database::queryOne("SELECT version() AS ver");
    $latencyMs = round((microtime(true) - $startTime) * 1000, 2);

    $results['supabase_connection'] = [
        'status' => 'CONNECTED_SUCCESSFULLY',
        'latency_ms' => $latencyMs . ' ms',
        'postgres_version' => $verRow['ver'] ?? 'Unknown'
    ];
} catch (Throwable $e) {
    $results['supabase_connection'] = [
        'status' => 'CONNECTION_FAILED',
        'error' => $e->getMessage()
    ];
}

// 2. فحص الجداول الرئيسية في قاعدة البيانات
try {
    $tables = Database::query("
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
    ");
    $tableNames = array_column($tables, 'table_name');

    $results['tables_audit'] = [
        'count' => count($tableNames),
        'tables' => $tableNames
    ];
} catch (Throwable $e) {
    $results['tables_audit'] = ['error' => $e->getMessage()];
}

// 3. فحص حالة بيانات التطبيق واللوائح المحفوظة
try {
    $settingsRow = Database::queryOne("
        SELECT key_name, version, updated_at, LENGTH(value_data::text) as json_size_bytes 
        FROM app_settings 
        WHERE key_name = ? LIMIT 1
    ", [DEFAULT_STORAGE_KEY]);

    $facesCount = Database::queryOne("SELECT COUNT(*) as c FROM employee_faces");

    $results['app_settings_check'] = [
        'key' => DEFAULT_STORAGE_KEY,
        'exists' => !empty($settingsRow),
        'version' => $settingsRow['version'] ?? 0,
        'updated_at' => $settingsRow['updated_at'] ?? null,
        'json_size_kb' => round(((int)($settingsRow['json_size_bytes'] ?? 0)) / 1024, 2) . ' KB',
        'employee_faces_count' => (int)($facesCount['c'] ?? 0)
    ];
} catch (Throwable $e) {
    $results['app_settings_check'] = ['error' => $e->getMessage()];
}

echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
