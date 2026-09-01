<?php
/**
 * Supabase PostgreSQL Dedicated Database Engine & Server-Side Micro-Cache
 * Exclusively optimized for Supabase Pooler (Port 6543 Transaction Pooler / IPv4)
 * Features: High-Performance Server Micro-Caching for Egress & Quota Protection
 * Compatible with PHP 8.1 - 8.5
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

/**
 * فئة التخزين المؤقت المصغر على الخادم (Server-Side Micro-Cache)
 * تقوم بحفظ نتائج الاستعلامات الأكثر تكراراً (مثل فحص النسخة والإعدادات) في ذاكرة / ملفات سريعة جداً على السيرفر
 * يتم تفريغ الكاش لحظياً (Zero-Delay Cache Invalidation) عند حدوث أي عملية كتابة أو تعديل
 */
class MicroCache
{
    private static array $memoryCache = [];

    private static function getCacheDir(): string
    {
        $dir = defined('MICRO_CACHE_DIR') ? MICRO_CACHE_DIR : sys_get_temp_dir() . '/pharmacy_hr_cache';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir;
    }

    public static function get(string $key): ?array
    {
        if (!defined('MICRO_CACHE_ENABLED') || !MICRO_CACHE_ENABLED) {
            return null;
        }

        $now = time();

        // 1. فحص ذاكرة الرام الفورية في نفس الطلب (In-Memory Request Cache)
        if (isset(self::$memoryCache[$key])) {
            $item = self::$memoryCache[$key];
            if ($item['exp'] > $now) {
                return $item['data'];
            }
            unset(self::$memoryCache[$key]);
        }

        // 2. فحص كاش ملفات السيرفر السريعة (File-based Micro Cache)
        $filePath = self::getCacheDir() . '/' . md5($key) . '.cache';
        if (file_exists($filePath)) {
            $raw = @file_get_contents($filePath);
            if ($raw) {
                $cached = @unserialize($raw);
                if (is_array($cached) && isset($cached['exp'], $cached['data']) && $cached['exp'] > $now) {
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
        $exp = time() + $ttl;
        $cached = ['exp' => $exp, 'data' => $data];

        self::$memoryCache[$key] = $cached;

        $filePath = self::getCacheDir() . '/' . md5($key) . '.cache';
        @file_put_contents($filePath, serialize($cached), LOCK_EX);
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
 * فئة إدارة اتصال واستعلامات Supabase PostgreSQL
 */
class Database
{
    private static ?PDO $instance = null;
    private static string $driver = 'pgsql';

    /**
     * الحصول على اتصال قاعدة بيانات Supabase مع إعادة محاولة ذكية
     */
    public static function getConnection(): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

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
            PDO::ATTR_EMULATE_PREPARES => true, // إلزامي مع Supabase Transaction Pooler لمنع خطأ pdo_stmt_does_not_exist
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::ATTR_PERSISTENT => false,
            PDO::ATTR_TIMEOUT => 6, // 6 seconds connect timeout
        ];

        // 3 محاولات اتصال سريعة لمنع أي انقطاع عابر في الشبكة
        for ($attempt = 0; $attempt < 3; $attempt++) {
            try {
                self::$instance = new PDO($dsn, $user, $pass, $pdoOptions);
                self::$instance->exec("SET client_encoding TO 'UTF8'");
                return self::$instance;
            } catch (Throwable $e) {
                if ($attempt < 2) {
                    usleep(100000); // 100ms wait before retry
                } else {
                    error_log('[Supabase PostgreSQL Connection Error]: ' . $e->getMessage());
                    jsonResponse([
                        'success' => false,
                        'error' => 'تعذر الاتصال بقاعدة بيانات Supabase PostgreSQL.',
                        'details' => $e->getMessage()
                    ], 500);
                }
            }
        }

        return self::$instance;
    }

    /**
     * إغلاق وإعادة تعيين الاتصال
     */
    public static function resetConnection(): void
    {
        self::$instance = null;
    }

    /**
     * اسم محرك قاعدة البيانات
     */
    public static function getDriver(): string
    {
        return self::$driver;
    }

    /**
     * معالجة الاستعلام لضمان التوافق القياسي مع PostgreSQL
     */
    public static function normalizeQuery(string $sql): string
    {
        $sql = str_replace('`', '"', $sql);
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
            } catch (PDOException $e) {
                self::resetConnection();
                if ($attempt === 0) {
                    usleep(50000); // 50ms wait
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
            } catch (PDOException $e) {
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

                // تفريغ الكاش فوراً لضمان وصول التحديثات الجديدة لكافة الأجهزة
                MicroCache::invalidate();

                return [
                    'affected_rows' => $affectedRows,
                    'insert_id' => $insertId
                ];
            } catch (PDOException $e) {
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
     * فحص وجود جدول معين في PostgreSQL
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
