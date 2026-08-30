<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

$results = [
    'php_version' => PHP_VERSION,
    'pdo_drivers' => PDO::getAvailableDrivers(),
    'active_driver' => null,
    'pgsql_test' => null,
    'sqlite_test' => null,
    'mysql_test' => null,
];

// 1. Test Active Database Wrapper
try {
    $db = Database::getConnection();
    $results['active_driver'] = Database::getDriver();
    $count = Database::queryOne("SELECT COUNT(*) AS c FROM app_settings");
    $results['active_connection_test'] = [
        'status' => 'OK',
        'driver' => Database::getDriver(),
        'app_settings_count' => (int)($count['c'] ?? 0)
    ];
} catch (Throwable $e) {
    $results['active_connection_test'] = [
        'status' => 'ERROR',
        'message' => $e->getMessage()
    ];
}

// 2. Test PostgreSQL
try {
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', DB_HOST, DB_PORT, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [PDO::ATTR_TIMEOUT => 3, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $ver = $pdo->query("SELECT version()")->fetchColumn();
    $count = $pdo->query("SELECT COUNT(*) FROM app_settings")->fetchColumn();
    $results['pgsql_test'] = [
        'status' => 'OK',
        'version' => $ver,
        'app_settings_count' => (int)$count
    ];
} catch (Throwable $e) {
    $results['pgsql_test'] = [
        'status' => 'ERROR',
        'message' => $e->getMessage()
    ];
}

// 3. Test SQLite
try {
    $sqlitePath = defined('DB_SQLITE_PATH') ? DB_SQLITE_PATH : __DIR__ . '/../database/database.sqlite';
    $sqliteDir = dirname($sqlitePath);
    if (!is_dir($sqliteDir)) @mkdir($sqliteDir, 0775, true);
    if (!is_writable($sqliteDir) && !file_exists($sqlitePath)) {
        $sqlitePath = sys_get_temp_dir() . '/pharmacy_database.sqlite';
    }
    $sqPdo = new PDO("sqlite:" . $sqlitePath);
    $sqPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $sqVer = $sqPdo->query("SELECT sqlite_version()")->fetchColumn();
    $results['sqlite_test'] = [
        'status' => 'OK',
        'path' => $sqlitePath,
        'version' => $sqVer
    ];
} catch (Throwable $e) {
    $results['sqlite_test'] = [
        'status' => 'ERROR',
        'message' => $e->getMessage()
    ];
}

// 4. Test MySQL
try {
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', MYSQL_HOST, MYSQL_PORT, MYSQL_NAME);
    $pdo = new PDO($dsn, MYSQL_USER, MYSQL_PASS, [PDO::ATTR_TIMEOUT => 3, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $ver = $pdo->query("SELECT VERSION()")->fetchColumn();
    $results['mysql_test'] = [
        'status' => 'OK',
        'version' => $ver
    ];
} catch (Throwable $e) {
    $results['mysql_test'] = [
        'status' => 'ERROR',
        'message' => $e->getMessage()
    ];
}

echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
