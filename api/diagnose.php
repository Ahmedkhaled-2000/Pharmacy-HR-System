<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$results = [
    'php_version' => PHP_VERSION,
    'pdo_drivers' => PDO::getAvailableDrivers(),
    'pgsql_test' => null,
    'mysql_test' => null,
];

// Test PostgreSQL
try {
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;options=\'--client_encoding=utf8\'', DB_HOST, DB_PORT, DB_NAME);
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

// Test MySQL
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
