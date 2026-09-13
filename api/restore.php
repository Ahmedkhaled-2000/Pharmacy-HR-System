<?php
/**
 * Database Restore Script
 * Safely restores authentic system state from backup JSON
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// Security token check
$configuredSecret = getenv('RESTORE_SECRET') ?: 'restore_pharmacy_2026_auth';
$secret = $_GET['secret'] ?? $_POST['secret'] ?? '';
$isCli = (php_sapi_name() === 'cli');

if (!$isCli && (!is_string($secret) || !hash_equals($configuredSecret, $secret))) {
    jsonResponse(['success' => false, 'error' => 'Access denied: Unauthorized restore request.'], 403);
}

try {
    $driver = Database::getDriver();
    $rawInput = file_get_contents('php://input');
    
    $jsonData = null;
    if (!empty($_POST['data'])) {
        $jsonData = is_string($_POST['data']) ? json_decode($_POST['data'], true) : $_POST['data'];
    } elseif (!empty($rawInput)) {
        $jsonData = json_decode($rawInput, true);
    }

    if (!$jsonData) {
        jsonResponse(['success' => false, 'error' => 'No valid JSON data provided in request body'], 400);
    }

    // Extract pharmacy-tracker-data if wrapped in export structure
    $stateToRestore = null;
    if (isset($jsonData['app_settings']) && is_array($jsonData['app_settings'])) {
        foreach ($jsonData['app_settings'] as $item) {
            if (($item['key'] ?? '') === 'pharmacy-tracker-data') {
                $stateToRestore = $item['value'];
                break;
            }
        }
    } elseif (isset($jsonData['employees']) || isset($jsonData['branches']) || isset($jsonData['orgSettings'])) {
        $stateToRestore = $jsonData;
    }

    if (!$stateToRestore || !is_array($stateToRestore)) {
        jsonResponse(['success' => false, 'error' => 'Could not find valid pharmacy-tracker-data state structure'], 400);
    }

    $jsonString = json_encode($stateToRestore, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if (in_array($driver, ['pgsql', 'sqlite'], true)) {
        $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                VALUES ('pharmacy-tracker-data', ?::jsonb, 1, NOW())
                ON CONFLICT (key_name) DO UPDATE
                SET value_data = EXCLUDED.value_data,
                    version = app_settings.version + 1,
                    updated_at = NOW()";
    } else {
        $sql = "INSERT INTO app_settings (key_name, value_data, version, updated_at)
                VALUES ('pharmacy-tracker-data', ?, 1, NOW())
                ON DUPLICATE KEY UPDATE
                    value_data = VALUES(value_data),
                    version = version + 1,
                    updated_at = NOW()";
    }

    Database::execute($sql, [$jsonString]);

    // Create a snapshot backup of this restored state
    try {
        if (in_array($driver, ['pgsql', 'sqlite'], true)) {
            Database::execute("
                CREATE TABLE IF NOT EXISTS app_settings_backups (
                    id BIGSERIAL PRIMARY KEY,
                    key_name VARCHAR(191) NOT NULL,
                    value_data JSONB NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    client_ip VARCHAR(45) NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            ");
            Database::execute(
                "INSERT INTO app_settings_backups (key_name, value_data, version, client_ip, created_at) VALUES ('pharmacy-tracker-data', ?::jsonb, 1, 'RESTORE_SCRIPT', NOW())",
                [$jsonString]
            );
        }
    } catch (Throwable) {}

    jsonResponse([
        'success' => true,
        'message' => 'Authentic state restored and synced successfully!',
        'employees_count' => count($stateToRestore['employees'] ?? []),
        'branches_count' => count($stateToRestore['branches'] ?? []),
        'shifts_count' => count($stateToRestore['shifts'] ?? []),
        'requests_count' => count($stateToRestore['requests'] ?? []),
        'loans_count' => count($stateToRestore['loans'] ?? [])
    ]);

} catch (Throwable $e) {
    error_log('[Restore Error] ' . $e->getMessage());
    jsonResponse([
        'success' => false,
        'error' => 'Restore operation failed. Please consult server logs.'
    ], 500);
}
