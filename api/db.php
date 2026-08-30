<?php
/**
 * PostgreSQL & MySQL & SQLite Database Connection & Query Wrapper via PDO
 * Compatible with PHP 8.1, 8.2, 8.3, 8.4, 8.5
 * Target: Apex Thunder Hosting (PostgreSQL 16+/18+ via pdo_pgsql with Automatic Failover)
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

class Database
{
    private static ?PDO $instance = null;
    private static string $driver = 'pgsql';

    /**
     * الحصول على اتصال قاعدة البيانات (مع إعادة المحاولة والتبديل الاحتياطي التلقائي)
     */
    public static function getConnection(): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $driver = defined('DB_DRIVER') ? strtolower((string)DB_DRIVER) : 'pgsql';

        // 1. إذا كان التكوين يطلب SQLite صراحة
        if ($driver === 'sqlite') {
            return self::initSqliteConnection();
        }

        // 2. محاولة الاتصال بـ PostgreSQL أو MySQL مع إعادة المحاولة
        $primaryDriver = in_array($driver, ['pgsql', 'postgres', 'postgresql'], true) ? 'pgsql' : 'mysql';
        
        $hostsToTry = [];
        $configuredHost = $primaryDriver === 'pgsql' ? DB_HOST : MYSQL_HOST;
        $hostsToTry[] = $configuredHost;
        
        if ($primaryDriver === 'pgsql') {
            if ($configuredHost === '127.0.0.1') {
                $hostsToTry[] = 'localhost';
            } elseif ($configuredHost === 'localhost') {
                $hostsToTry[] = '127.0.0.1';
            }
        }

        $lastError = null;
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            foreach ($hostsToTry as $host) {
                try {
                    self::$driver = $primaryDriver;
                    self::$instance = self::createPDOConnection($primaryDriver, $host);
                    if ($primaryDriver === 'pgsql') {
                        try {
                            self::$instance->exec("SET NAMES 'UTF8'");
                        } catch (Throwable) {}
                    }
                    return self::$instance;
                } catch (PDOException $e) {
                    $lastError = $e->getMessage();
                    error_log("[DB Connection Attempt {$attempt} on {$host} ({$primaryDriver})]: " . $lastError);
                }
            }
            if ($attempt < 3) {
                usleep($attempt * 60000); // 60ms, 120ms
            }
        }

        // 3. التراجع الاحتياطي التلقائي إلى SQLite عند تعذر الوصول التام للـ PostgreSQL
        error_log("[DB Fallback] Primary database ({$primaryDriver}) unavailable after retries. Activating SQLite fallback. Error: " . ($lastError ?? 'Unknown'));
        try {
            return self::initSqliteConnection();
        } catch (Throwable $eSqlite) {
            error_log("[DB SQLite Fallback Error] " . $eSqlite->getMessage());
            jsonResponse([
                'success' => false,
                'error' => 'Database connection failed. Please verify PostgreSQL credentials in api/config.php.',
                'details' => $lastError,
                'fallback_error' => $eSqlite->getMessage()
            ], 500);
        }

        return self::$instance;
    }

    /**
     * إنشاء اتصال PDO مع خيارات الأداء ومنع تسريب الاتصالات
     */
    private static function createPDOConnection(string $driver, ?string $overrideHost = null): PDO
    {
        $host = $overrideHost ?? ($driver === 'pgsql' ? DB_HOST : MYSQL_HOST);
        $port = ($driver === 'pgsql') ? (defined('DB_PORT') ? DB_PORT : 5432) : 3306;
        $dbName = ($driver === 'pgsql') ? DB_NAME : MYSQL_NAME;
        $user = ($driver === 'pgsql') ? DB_USER : MYSQL_USER;
        $pass = ($driver === 'pgsql') ? DB_PASS : MYSQL_PASS;

        if ($driver === 'pgsql') {
            $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $host, $port, $dbName);
        } else {
            $charset = (DB_CHARSET === 'utf8') ? 'utf8mb4' : DB_CHARSET;
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $dbName, $charset);
        }

        $pdoOptions = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::ATTR_TIMEOUT => 4,
            PDO::ATTR_PERSISTENT => false, // إغلاق الاتصالات فور انتهاء الطلب لتجنب تجاوز حد الـ 5 اتصالات
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

        // استخدام مجلد النظام المؤقت إذا كان المسار غير قابل للكتابة
        if (!is_writable($sqliteDir) && !file_exists($sqlitePath)) {
            $sqlitePath = sys_get_temp_dir() . '/pharmacy_database.sqlite';
        }

        self::$instance = new PDO("sqlite:" . $sqlitePath);
        self::$instance->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        self::$instance->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        self::$instance->setAttribute(PDO::ATTR_TIMEOUT, 5);
        
        try {
            self::$instance->exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
        } catch (Throwable) {}

        // إنشاء الجداول تلقائياً إذا لم تكن موجودة (Zero Config Setup)
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
            CREATE TABLE IF NOT EXISTS archive_suppliers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                phone TEXT NULL,
                email TEXT NULL,
                address TEXT NULL,
                tax_number TEXT NULL,
                notes TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS archive_employees (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                role TEXT NULL DEFAULT 'أمين مخزن',
                phone TEXT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS archive_invoices (
                id TEXT PRIMARY KEY,
                invoice_number TEXT NOT NULL,
                supplier_id TEXT NOT NULL,
                invoice_date DATETIME NOT NULL,
                total_amount REAL NOT NULL DEFAULT 0.00,
                discount REAL NOT NULL DEFAULT 0.00,
                net_amount REAL NOT NULL DEFAULT 0.00,
                status TEXT NOT NULL DEFAULT 'ARCHIVED',
                file_url TEXT NULL,
                drive_file_id TEXT NULL,
                file_name TEXT NULL,
                file_type TEXT NULL,
                upload_mode TEXT NOT NULL DEFAULT 'AUTO_EXTRACT',
                receiver_id TEXT NULL,
                entry_clerk_id TEXT NULL,
                notes TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS archive_invoice_items (
                id TEXT PRIMARY KEY,
                invoice_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                unit_price REAL NOT NULL DEFAULT 0.00,
                discount REAL NOT NULL DEFAULT 0.00,
                total_price REAL NOT NULL DEFAULT 0.00,
                selling_price REAL NULL,
                batch_number TEXT NULL,
                expiry_date TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS archive_column_mappings (
                id TEXT PRIMARY KEY,
                supplier_id TEXT NOT NULL,
                raw_column_name TEXT NOT NULL,
                standard_field TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (supplier_id, raw_column_name)
            );
            CREATE TABLE IF NOT EXISTS archive_system_settings (
                key_name TEXT PRIMARY KEY,
                value_data TEXT NOT NULL,
                description TEXT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS archive_import_logs (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                upload_mode TEXT NOT NULL,
                status TEXT NOT NULL,
                items_extracted INTEGER NOT NULL DEFAULT 0,
                error_message TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        return self::$instance;
    }

    /**
     * إعادة تعيين الاتصال عند حدوث انقطاع مؤقت
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
            // إزالة Backticks الخاصة بـ MySQL وتحويل NOW(6) إلى NOW()
            $sql = str_replace('`', '', $sql);
            $sql = preg_replace('/NOW\(\s*\d*\s*\)/i', 'NOW()', $sql);
            $sql = preg_replace('/CURRENT_TIMESTAMP\(\s*\d*\s*\)/i', 'CURRENT_TIMESTAMP', $sql);
        }
        return $sql;
    }

    /**
     * دمج وتجهيز المعاملات لدعم النمطين القديم (Types string) والحديث (Params array)
     *
     * @param mixed $typesOrParams
     * @param array<int, mixed> $params
     * @return array<int, mixed>
     */
    private static function resolveParams(mixed $typesOrParams, array $params): array
    {
        if (is_array($typesOrParams)) {
            return array_values($typesOrParams);
        }
        return array_values($params);
    }

    /**
     * تنفيذ استعلام محمي وإرجاع جميع السجلات مع إعادة المحاولة التلقائية عند انقطاع الاتصال
     *
     * @param string $sql
     * @param mixed $typesOrParams
     * @param array<int, mixed> $params
     * @return array<int, array<string, mixed>>
     */
    public static function query(string $sql, mixed $typesOrParams = '', array $params = []): array
    {
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

        for ($attempt = 1; $attempt <= 2; $attempt++) {
            try {
                $db = self::getConnection();
                $stmt = $db->prepare($normalizedSql);
                $stmt->execute($actualParams);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                return is_array($rows) ? $rows : [];
            } catch (PDOException $e) {
                if ($attempt === 1 && (
                    str_contains($e->getMessage(), 'server closed the connection') ||
                    str_contains($e->getMessage(), 'gone away') ||
                    str_contains($e->getMessage(), 'Connection lost') ||
                    str_contains($e->getMessage(), 'Broken pipe') ||
                    str_contains($e->getMessage(), 'SSL connection has been closed unexpectedly')
                )) {
                    self::resetConnection();
                    continue;
                }
                throw $e;
            }
        }
        return [];
    }

    /**
     * تنفيذ استعلام إدراج/تحديث/حذف وإرجاع عدد السجلات المتأثرة ومعرف الإدراج
     *
     * @param string $sql
     * @param mixed $typesOrParams
     * @param array<int, mixed> $params
     * @return array{affected_rows: int, insert_id: int|string}
     */
    public static function execute(string $sql, mixed $typesOrParams = '', array $params = []): array
    {
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

        for ($attempt = 1; $attempt <= 2; $attempt++) {
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
                if ($attempt === 1 && (
                    str_contains($e->getMessage(), 'server closed the connection') ||
                    str_contains($e->getMessage(), 'gone away') ||
                    str_contains($e->getMessage(), 'Connection lost') ||
                    str_contains($e->getMessage(), 'Broken pipe') ||
                    str_contains($e->getMessage(), 'SSL connection has been closed unexpectedly')
                )) {
                    self::resetConnection();
                    continue;
                }
                throw $e;
            }
        }

        return ['affected_rows' => 0, 'insert_id' => 0];
    }

    /**
     * تنفيذ استعلام وإرجاع سجل واحد فقط
     *
     * @param string $sql
     * @param mixed $typesOrParams
     * @param array<int, mixed> $params
     * @return array<string, mixed>|null
     */
    public static function queryOne(string $sql, mixed $typesOrParams = '', array $params = []): ?array
    {
        $rows = self::query($sql, $typesOrParams, $params);
        return !empty($rows) ? $rows[0] : null;
    }

    /**
     * بدء معاملة (Transaction)
     */
    public static function beginTransaction(): bool
    {
        $db = self::getConnection();
        return $db->inTransaction() ? true : $db->beginTransaction();
    }

    /**
     * تأكيد المعاملة (Commit)
     */
    public static function commit(): bool
    {
        $db = self::getConnection();
        return $db->inTransaction() ? $db->commit() : true;
    }

    /**
     * التراجع عن المعاملة (Rollback)
     */
    public static function rollback(): bool
    {
        $db = self::getConnection();
        return $db->inTransaction() ? $db->rollBack() : true;
    }
}
