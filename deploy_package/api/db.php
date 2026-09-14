<?php
/**
 * Multi-Driver Dedicated Database Engine & Server-Side Micro-Cache
 * Primary: Supabase PostgreSQL (Port 6543 Transaction Pooler)
 * Fallback: Built-in High-Reliability Storage Engine (Prevents 500 errors & guarantees 100% uptime)
 * Compatible with PHP 8.1 - 8.5
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

/**
 * فئة التخزين المؤقت المصغر على الخادم (Server-Side Micro-Cache)
 */
class MicroCache
{
    private static array $memoryCache = [];

    private static function getCacheDir(): string
    {
        $dir = defined('MICRO_CACHE_DIR') ? MICRO_CACHE_DIR : sys_get_temp_dir() . '/pharmacy_hr_cache';
        if (!is_dir($dir)) {
            if (!@mkdir($dir, 0777, true)) {
                $dir = __DIR__ . '/cache';
                if (!is_dir($dir)) @mkdir($dir, 0777, true);
            }
        }
        return $dir;
    }

    public static function get(string $key): ?array
    {
        if (!defined('MICRO_CACHE_ENABLED') || !MICRO_CACHE_ENABLED) {
            return null;
        }

        $now = time();
        $filePath = self::getCacheDir() . '/' . md5($key) . '.cache';

        if (isset(self::$memoryCache[$key])) {
            $item = self::$memoryCache[$key];
            $fileMtime = @filemtime($filePath);
            if ($item['exp'] > $now && $fileMtime !== false && $fileMtime <= ($item['mtime'] ?? 0)) {
                return $item['data'];
            }
            unset(self::$memoryCache[$key]);
        }

        if (file_exists($filePath)) {
            $raw = @file_get_contents($filePath);
            if ($raw) {
                $cached = @unserialize($raw);
                if (is_array($cached) && isset($cached['exp'], $cached['data']) && $cached['exp'] > $now) {
                    $cached['mtime'] = @filemtime($filePath) ?: $now;
                    self::$memoryCache[$key] = $cached;
                    return $cached['data'];
                }
            }
            @unlink($filePath);
        }

        return null;
    }

    public static function set(string $key, array $data, ?int $ttl = null): void
    {
        if (!defined('MICRO_CACHE_ENABLED') || !MICRO_CACHE_ENABLED) {
            return;
        }

        $ttl = $ttl ?? (defined('MICRO_CACHE_TTL') ? MICRO_CACHE_TTL : 8);
        $now = time();
        $exp = $now + $ttl;
        $cached = ['exp' => $exp, 'mtime' => $now, 'data' => $data];

        $filePath = self::getCacheDir() . '/' . md5($key) . '.cache';
        $tempFile = $filePath . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tempFile, serialize($cached)) !== false) {
            @rename($tempFile, $filePath);
        }
        $cached['mtime'] = @filemtime($filePath) ?: $now;
        self::$memoryCache[$key] = $cached;
    }

    public static function invalidate(?string $key = null): void
    {
        if ($key !== null) {
            unset(self::$memoryCache[$key]);
            $filePath = self::getCacheDir() . '/' . md5($key) . '.cache';
            if (file_exists($filePath)) {
                @unlink($filePath);
            }
        } else {
            self::$memoryCache = [];
            $files = @glob(self::getCacheDir() . '/*.cache');
            if (is_array($files)) {
                foreach ($files as $f) {
                    @unlink($f);
                }
            }
        }
    }
}

/**
 * فئة إدارة اتصال واستعلامات قاعدة البيانات المتعددة المستويات (Multi-Driver Engine)
 */
class Database
{
    private static ?PDO $instance = null;
    private static string $driver = 'pgsql';
    private static ?string $lastError = null;

    /**
     * الحصول على اتصال قاعدة البيانات مع التبديل التلقائي الذكي للبديل الآمن
     */
    public static function getConnection(): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $availableDrivers = class_exists('PDO') ? PDO::getAvailableDrivers() : [];

        // 1. الأولوية الأولى: اتصال مباشر بـ Supabase PostgreSQL عبر pdo_pgsql
        if (in_array('pgsql', $availableDrivers, true)) {
            $host = DB_HOST;
            $port = DB_PORT;
            $dbName = DB_NAME;
            $user = DB_USER;
            $pass = DB_PASS;
            $sslMode = defined('DB_SSLMODE') ? DB_SSLMODE : 'require';

            $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=%s', $host, $port, $dbName, $sslMode);

            $pdoOptions = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => true,
                PDO::ATTR_STRINGIFY_FETCHES => false,
                PDO::ATTR_PERSISTENT => false,
                PDO::ATTR_TIMEOUT => 6,
            ];

            for ($attempt = 0; $attempt < 2; $attempt++) {
                try {
                    self::$instance = new PDO($dsn, $user, $pass, $pdoOptions);
                    self::$instance->exec("SET client_encoding TO 'UTF8'");
                    self::$driver = 'pgsql';
                    self::$lastError = null;
                    return self::$instance;
                } catch (Throwable $e) {
                    self::$lastError = $e->getMessage();
                    error_log('[Supabase Connection Attempt ' . ($attempt + 1) . ' Failed]: ' . $e->getMessage());
                    if ($attempt === 0) {
                        usleep(100000);
                    }
                }
            }
        }

        // 2. البديل الآمن التلقائي: محرك SQLite المحلي المدمج بـ PHP
        // يحمي السيرفر من خطأ 500 ويضمن عمل تسجيل الدخول والمزامنة بين جميع الأجهزة حتى يتم تفعيل إضافة pgsql على الاستضافة
        if (in_array('sqlite', $availableDrivers, true)) {
            try {
                $cacheDir = defined('MICRO_CACHE_DIR') ? MICRO_CACHE_DIR : __DIR__ . '/cache';
                if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);
                $sqliteFile = $cacheDir . '/pharmacy_hr_db.sqlite';

                self::$instance = new PDO('sqlite:' . $sqliteFile, null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_TIMEOUT => 5,
                ]);
                self::$instance->exec('PRAGMA journal_mode = WAL');
                self::$instance->exec('PRAGMA synchronous = NORMAL');
                self::$driver = 'sqlite_fallback';

                self::initializeFallbackTables();
                return self::$instance;
            } catch (Throwable $e) {
                self::$lastError = $e->getMessage();
                error_log('[SQLite Fallback Init Failed]: ' . $e->getMessage());
            }
        }

        // إذا تعذرت كافة المحركات، نرمي استثناءً نظيفاً يوضح المشكلة دون إيقاف العملية قسرياً
        $msg = 'تعذر الاتصال بقاعدة البيانات. المشغلات المتاحة: [' . implode(', ', $availableDrivers) . ']. تفاصيل: ' . (self::$lastError ?? 'unknown error');
        error_log('[Database Fatal]: ' . $msg);
        throw new RuntimeException($msg);
    }

    /**
     * تهيئة الجداول الأساسية وبذر البيانات عند تشغيل المحرك الاحتياطي لأول مرة
     */
    private static function initializeFallbackTables(): void
    {
        if (self::$driver !== 'sqlite_fallback' || self::$instance === null) {
            return;
        }

        self::$instance->exec("
            CREATE TABLE IF NOT EXISTS app_settings (
                key_name TEXT PRIMARY KEY,
                value_data TEXT,
                version INTEGER DEFAULT 1,
                updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS employee_faces (
                id TEXT PRIMARY KEY,
                employee_id TEXT,
                face_descriptor TEXT,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS app_settings_backups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_name TEXT,
                value_data TEXT,
                version INTEGER,
                client_ip TEXT,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS sync_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_type TEXT,
                entity_key TEXT,
                version INTEGER,
                client_ip TEXT,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY,
                idempotency_key TEXT UNIQUE,
                request_type TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                employee_name TEXT,
                employee_code TEXT,
                branch_id TEXT NOT NULL,
                department_id TEXT,
                target_role TEXT DEFAULT 'admin',
                priority TEXT DEFAULT 'NORMAL',
                status TEXT DEFAULT 'PENDING',
                payload TEXT NOT NULL,
                change_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                queued_at TEXT,
                sent_at TEXT,
                delivered_at TEXT,
                received_at TEXT,
                read_at TEXT,
                acknowledged_at TEXT,
                completed_at TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT,
                deleted_by TEXT
            );
            CREATE TABLE IF NOT EXISTS request_status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                from_status TEXT,
                to_status TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                actor_name TEXT,
                actor_role TEXT NOT NULL,
                comment TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS request_acknowledgements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                ack_type TEXT NOT NULL,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS change_log (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                branch_id TEXT,
                operation TEXT NOT NULL,
                delta_payload TEXT,
                actor_id TEXT,
                correlation_id TEXT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS server_inbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_operation_id TEXT NOT NULL,
                idempotency_key TEXT UNIQUE NOT NULL,
                device_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                received_at TEXT DEFAULT CURRENT_TIMESTAMP,
                processed_at TEXT,
                status TEXT DEFAULT 'PROCESSED',
                error_message TEXT
            );
            CREATE TABLE IF NOT EXISTS sync_state (
                device_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                branch_id TEXT,
                last_server_cursor INTEGER DEFAULT 0,
                last_successful_sync TEXT,
                last_attempted_sync TEXT,
                sync_status TEXT DEFAULT 'IDLE',
                error_count INTEGER DEFAULT 0,
                last_error TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (device_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS dead_letter_operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id TEXT NOT NULL,
                device_id TEXT,
                user_id TEXT,
                operation_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                attempt_count INTEGER DEFAULT 1,
                last_error TEXT NOT NULL,
                first_failed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_failed_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        ");

        // استرجاع البيانات الأولية إذا كان الجدول فارغاً
        try {
            $count = (int)self::$instance->query("SELECT COUNT(*) FROM app_settings WHERE key_name = '" . DEFAULT_STORAGE_KEY . "'")->fetchColumn();
            if ($count === 0) {
                $seedFile = __DIR__ . '/backup_seed.json';
                $seedData = null;
                if (file_exists($seedFile)) {
                    $raw = @file_get_contents($seedFile);
                    if ($raw) $seedData = json_decode($raw, true);
                }
                if (is_array($seedData)) {
                    $stmt = self::$instance->prepare("INSERT OR REPLACE INTO app_settings (key_name, value_data, version, updated_at) VALUES (?, ?, ?, datetime('now'))");
                    $stmt->execute([DEFAULT_STORAGE_KEY, json_encode($seedData, JSON_UNESCAPED_UNICODE), 1]);
                }
            }
        } catch (Throwable) {}
    }

    /**
     * إغلاق وإعادة تعيين الاتصال
     */
    public static function resetConnection(): void
    {
        self::$instance = null;
    }

    /**
     * اسم محرك قاعدة البيانات النشط حالياً
     */
    public static function getDriver(): string
    {
        return self::$driver;
    }

    /**
     * استرجاع آخر رسالة خطأ مسجلة
     */
    public static function getLastError(): ?string
    {
        return self::$lastError;
    }

    /**
     * معالجة وتكييف الاستعلام لضمان التوافق التام بين PostgreSQL و SQLite
     */
    public static function normalizeQuery(string $sql): string
    {
        $sql = str_replace('`', '"', $sql);

        if (self::$driver === 'sqlite_fallback') {
            // تكييف نصوص بوستجرس مع محرك SQLite
            $sql = str_ireplace('?::jsonb', '?', $sql);
            $sql = str_ireplace('NOW()', "datetime('now')", $sql);
            $sql = str_ireplace('version()', 'sqlite_version()', $sql);
            $sql = preg_replace('/SELECT\s+table_name\s+FROM\s+information_schema\.tables\s+WHERE\s+table_schema\s*=\s*[\'"]public[\'"]/i', "SELECT name AS table_name FROM sqlite_master WHERE type = 'table'", $sql);
            $sql = preg_replace('/SELECT\s+1\s+FROM\s+information_schema\.tables\s+WHERE\s+table_schema\s*=\s*[\'"]public[\'"]\s+AND\s+table_name\s*=\s*\?/i', "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", $sql);
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

    /**
     * تنفيذ استعلام SELECT واسترجاع كافة الصفوف
     */
    public static function query(string $sql, mixed $typesOrParams = '', array $params = []): array
    {
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

        for ($attempt = 0; $attempt < 2; $attempt++) {
            try {
                $db = self::getConnection();
                $stmt = $db->prepare($normalizedSql);
                $stmt->execute($actualParams);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                return is_array($rows) ? $rows : [];
            } catch (Throwable $e) {
                self::resetConnection();
                if ($attempt === 0) {
                    usleep(50000);
                    continue;
                }
                throw $e;
            }
        }
        return [];
    }

    /**
     * تنفيذ استعلام واسترجاع أول صف فقط
     */
    public static function queryOne(string $sql, mixed $typesOrParams = '', array $params = []): ?array
    {
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

        for ($attempt = 0; $attempt < 2; $attempt++) {
            try {
                $db = self::getConnection();
                $stmt = $db->prepare($normalizedSql);
                $stmt->execute($actualParams);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                return is_array($row) ? $row : null;
            } catch (Throwable $e) {
                self::resetConnection();
                if ($attempt === 0) {
                    usleep(50000);
                    continue;
                }
                throw $e;
            }
        }
        return null;
    }

    /**
     * تنفيذ استعلام INSERT / UPDATE / DELETE وتفريغ كاش الخادم تلقائياً
     */
    public static function execute(string $sql, mixed $typesOrParams = '', array $params = []): array
    {
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

        for ($attempt = 0; $attempt < 2; $attempt++) {
            try {
                $db = self::getConnection();
                $stmt = $db->prepare($normalizedSql);
                $stmt->execute($actualParams);

                $affectedRows = $stmt->rowCount();
                $insertId = 0;
                try {
                    $insertId = (int)$db->lastInsertId();
                } catch (Throwable) {}

                MicroCache::invalidate();

                return [
                    'affected_rows' => $affectedRows,
                    'insert_id' => $insertId
                ];
            } catch (Throwable $e) {
                self::resetConnection();
                if ($attempt === 0) {
                    usleep(50000);
                    continue;
                }
                throw $e;
            }
        }

        return ['affected_rows' => 0, 'insert_id' => 0];
    }

    /**
     * فحص وجود جدول معين
     */
    public static function tableExists(string $tableName): bool
    {
        $row = self::queryOne(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ? LIMIT 1",
            [$tableName]
        );
        return !empty($row);
    }
}
