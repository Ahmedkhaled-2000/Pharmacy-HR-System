<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

echo json_encode([
    'status' => 'online',
    'message' => 'Pharmacy HR API is alive',
    'php_version' => PHP_VERSION,
    'server_time' => date('Y-m-d H:i:s'),
    'timezone' => date_default_timezone_get()
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
