<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$pdoDrivers = class_exists('PDO') ? PDO::getAvailableDrivers() : [];

$dbStatus = 'untested';
$activeDriver = 'none';
try {
    if (file_exists(__DIR__ . '/db.php')) {
        require_once __DIR__ . '/db.php';
        $db = Database::getConnection();
        $dbStatus = 'connected';
        $activeDriver = Database::getDriver();
    }
} catch (Throwable $e) {
    $dbStatus = 'error: ' . $e->getMessage();
}

echo json_encode([
    'status' => 'online',
    'message' => 'Pharmacy HR API is alive',
    'php_version' => PHP_VERSION,
    'pdo_drivers' => $pdoDrivers,
    'db_status' => $dbStatus,
    'active_driver' => $activeDriver,
    'server_time' => date('Y-m-d H:i:s'),
    'timezone' => date_default_timezone_get()
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
