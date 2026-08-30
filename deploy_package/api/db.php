<?php
/**
 * PostgreSQL & MySQL/MariaDB & SQLite Multi-Engine Database Connection
 * Compatible with PHP 8.1 - 8.5
 * Features: Instant Multi-Tier Fallback (PostgreSQL -> MariaDB/MySQL -> SQLite)
 * Zero Connection Leak Guarantee
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

class Database
{
    private static ?PDO $instance = null;
    private static string $driver = 'pgsql';

    /**
     * الحصول على اتصال قاعدة البيانات مع تبديل ذكي فوري بين PostgreSQL و MariaDB/MySQL و SQLite
     */
    public static function getConnection(): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $preferredDriver = defined('DB_DRIVER') ? strtolower((string)DB_DRIVER) : 'pgsql';

        // 1. المحاولة الأولى: PostgreSQL (إذا كان محدداً أو افتراضياً)
        if (in_array($preferredDriver, ['pgsql', 'postgres', 'postgresql'], true)) {
            try {
                self::$driver = 'pgsql';
                self::$instance = self::createPDOConnection('pgsql', DB_HOST);
                try {
                    self::$instance->exec("SET NAMES 'UTF8'");
                } catch (Throwable) {}
                return self::$instance;
            } catch (Throwable $ePg) {
                error_log("[DB PostgreSQL Failed - Trying MariaDB Fallback]: " . $ePg->getMessage());
            }
        }

        // 2. المحاولة الثانية: MySQL / MariaDB (الخيار فائق السرعة والمتاح دائماً على نفس الاستضافة)
        try {
            self::$driver = 'mysql';
            self::$instance = self::createPDOConnection('mysql', MYSQL_HOST);
            try {
                self::$instance->exec("SET NAMES utf8mb4");
            } catch (Throwable) {}
            return self::$instance;
        } catch (Throwable $eMy) {
            error_log("[DB MySQL Failed - Trying SQLite Fallback]: " . $eMy->getMessage());
        }

        // 3. المحاولة الثالثة: SQLite الطارئة
        try {
            return self::initSqliteConnection();
        } catch (Throwable $eSqlite) {
            error_log("[DB SQLite Fallback Error]: " . $eSqlite->getMessage());
            jsonResponse([
                'success' => false,
                'error' => 'Database connection failed across all drivers (PostgreSQL, MySQL, SQLite).',
                'details' => $eSqlite->getMessage()
            ], 500);
        }

        return self::$instance;
    }

    /**
     * إنشاء اتصال PDO سريع مع خيارات منع تسريب الاتصالات
     */
    private static function createPDOConnection(string $driver, ?string $overrideHost = null): PDO
    {
        $host = $overrideHost ?? ($driver === 'pgsql' ? DB_HOST : MYSQL_HOST);
        $port = ($driver === 'pgsql') ? (defined('DB_PORT') ? DB_PORT : 5432) : (defined('MYSQL_PORT') ? MYSQL_PORT : 3306);
        $dbName = ($driver === 'pgsql') ? DB_NAME : MYSQL_NAME;
        $user = ($driver === 'pgsql') ? DB_USER : MYSQL_USER;
        $pass = ($driver === 'pgsql') ? DB_PASS : MYSQL_PASS;

        if ($driver === 'pgsql') {
            $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;connect_timeout=2', $host, $port, $dbName);
        } else {
            $charset = (DB_CHARSET === 'utf8') ? 'utf8mb4' : DB_CHARSET;
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $dbName, $charset);
        }

        $pdoOptions = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::ATTR_TIMEOUT => 2,
            PDO::ATTR_PERSISTENT => false, // منع الاتصالات المعلقة
        ];

        return new PDO($dsn, $user, $pass, $pdoOptions);
    }

    /**
     * تهيئة اتصال وقواعد جداول SQLite الاحتياطية
     */
    private static function initSqliteConnection(): PDO
    {
        self::$driver = 'sqlite';
        $sqliteDir = defined('DB_SQLITE_PATH') ? dirname(DB_SQLITE_PATH) : __DIR__ . '/../database';
        if (!is_dir($sqliteDir)) {
            @mkdir($sqliteDir, 0775, true);
        }
        $sqlitePath = defined('DB_SQLITE_PATH') ? DB_SQLITE_PATH : $sqliteDir . '/database.sqlite';

        if (!is_writable($sqliteDir) && !file_exists($sqlitePath)) {
            $sqlitePath = sys_get_temp_dir() . '/pharmacy_database.sqlite';
        }

        self::$instance = new PDO("sqlite:" . $sqlitePath);
        self::$instance->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        self::$instance->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        self::$instance->setAttribute(PDO::ATTR_TIMEOUT, 3);
        
        try {
            self::$instance->exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
        } catch (Throwable) {}

        // إنشاء الجداول تلقائياً
        self::$instance->exec("
            CREATE TABLE IF NOT EXISTS app_settings (
                key_name TEXT PRIMARY KEY,
                value_data TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS employee_faces (
                employee_id TEXT PRIMARY KEY,
                descriptor TEXT,
                hand_descriptor TEXT,
                biometric_type TEXT DEFAULT 'face',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sync_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_type TEXT NOT NULL,
                entity_key TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                client_ip TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        return self::$instance;
    }

    /**
     * إغلاق وإعادة تعيين الاتصال فور انتهاء الطلب لمنع حجز الاتصالات
     */
    public static function resetConnection(): void
    {
        self::$instance = null;
    }

    /**
     * فحص نوع محرك قاعدة البيانات الحالي
     */
    public static function getDriver(): string
    {
        if (self::$instance === null) {
            self::getConnection();
        }
        return self::$driver;
    }

    /**
     * معالجة الاستعلام لضمان التوافق التام بين PostgreSQL و MySQL و SQLite
     */
    public static function normalizeQuery(string $sql): string
    {
        if (self::$driver === 'sqlite') {
            $sql = str_replace('?::jsonb', '?', $sql);
            $sql = preg_replace('/NOW\(\s*\d*\s*\)/i', 'CURRENT_TIMESTAMP', $sql);
            $sql = str_replace('NOW()', 'CURRENT_TIMESTAMP', $sql);
            $sql = str_replace('`', '', $sql);
        } elseif (self::$driver === 'pgsql') {
            $sql = str_replace('`', '', $sql);
            $sql = preg_replace('/NOW\(\s*\d*\s*\)/i', 'NOW()', $sql);
            $sql = preg_replace('/CURRENT_TIMESTAMP\(\s*\d*\s*\)/i', 'CURRENT_TIMESTAMP', $sql);
        } elseif (self::$driver === 'mysql') {
            $sql = str_replace('?::jsonb', '?', $sql);
            $sql = preg_replace('/NOW\(\s*\d*\s*\)/i', 'NOW()', $sql);
            $sql = preg_replace('/CURRENT_TIMESTAMP\(\s*\d*\s*\)/i', 'CURRENT_TIMESTAMP', $sql);
        }
        return $sql;
    }

    private static function resolveParams(mixed $typesOrParams, array $params): array
    {
        if (is_array($typesOrParams)) {
            return array_values($typesOrParams);
        }
        return array_values($params);
    }

    public static function query(string $sql, mixed $typesOrParams = '', array $params = []): array
    {
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

        try {
            $db = self::getConnection();
            $stmt = $db->prepare($normalizedSql);
            $stmt->execute($actualParams);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            return is_array($rows) ? $rows : [];
        } catch (PDOException $e) {
            self::resetConnection();
            throw $e;
        }
    }

    public static function execute(string $sql, mixed $typesOrParams = '', array $params = []): array
    {
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

        try {
            $db = self::getConnection();
            $stmt = $db->prepare($normalizedSql);
            $stmt->execute($actualParams);

            $affectedRows = $stmt->rowCount();
            $insertId = 0;
            try {
                $insertId = $db->lastInsertId();
            } catch (Throwable) {
                $insertId = 0;
            }

            return [
                'affected_rows' => $affectedRows,
                'insert_id' => $insertId
            ];
        } catch (PDOException $e) {
            self::resetConnection();
            throw $e;
        }
    }

    public static function queryOne(string $sql, mixed $typesOrParams = '', array $params = []): ?array
    {
        $rows = self::query($sql, $typesOrParams, $params);
        return !empty($rows) ? $rows[0] : null;
    }

    public static function beginTransaction(): bool
    {
        $db = self::getConnection();
        return $db->inTransaction() ? true : $db->beginTransaction();
    }

    public static function commit(): bool
    {
        $db = self::getConnection();
        return $db->inTransaction() ? $db->commit() : true;
    }

    public static function rollback(): bool
    {
        $db = self::getConnection();
        return $db->inTransaction() ? $db->rollBack() : true;
    }
}

// تسجيل إغلاق الاتصال التلقائي عند نهاية الطلب لمنع أي حجز للاتصالات
register_shutdown_function([Database::class, 'resetConnection']);
