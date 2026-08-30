<?php
/**
 * PostgreSQL & MySQL Database Connection & Query Wrapper via PDO
 * Compatible with PHP 8.1, 8.2, 8.3, 8.4, 8.5
 * Target: Apex Thunder Hosting (PostgreSQL 16+/18+ via pdo_pgsql)
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

class Database
{
    private static ?PDO $instance = null;
    private static string $driver = 'pgsql';

    /**
     * الحصول على اتصال قاعدة البيانات (Singleton Pattern via PDO)
     */
    public static function getConnection(): PDO
    {
        if (self::$instance === null) {
            $driver = defined('DB_DRIVER') ? strtolower(DB_DRIVER) : 'pgsql';
            $primaryDriver = in_array($driver, ['pgsql', 'postgres', 'postgresql'], true) ? 'pgsql' : 'mysql';
            $fallbackDriver = ($primaryDriver === 'pgsql') ? 'mysql' : 'pgsql';

            // محاولة الاتصال بالمحرك الأساسي
            $primaryError = null;
            try {
                self::$driver = $primaryDriver;
                self::$instance = self::createPDOConnection($primaryDriver);
                return self::$instance;
            } catch (PDOException $e) {
                $primaryError = $e->getMessage();
                error_log("[DB Primary Connection Error: $primaryDriver] " . $primaryError);
            }

            // محاولة الاتصال بالمحرك الاحتياطي التلقائي (Auto-Fallback)
            try {
                self::$driver = $fallbackDriver;
                self::$instance = self::createPDOConnection($fallbackDriver);
                return self::$instance;
            } catch (PDOException $e) {
                $fallbackError = $e->getMessage();
                error_log("[DB Fallback Connection Error: $fallbackDriver] " . $fallbackError);

                jsonResponse([
                    'success' => false,
                    'error' => 'Database connection failed. Please verify PostgreSQL / MySQL credentials in api/config.php.',
                    'primary_error' => $primaryError,
                    'fallback_error' => $fallbackError
                ], 500);
            }
        }

        return self::$instance;
    }

    private static function createPDOConnection(string $driver): PDO
    {
        $host = DB_HOST;
        $port = ($driver === 'pgsql') ? (defined('DB_PORT') ? DB_PORT : 5432) : 3306;
        $dbName = DB_NAME;
        $user = DB_USER;
        $pass = DB_PASS;

        if ($driver === 'pgsql') {
            $dsn = sprintf(
                'pgsql:host=%s;port=%d;dbname=%s;options=\'--client_encoding=%s\'',
                $host,
                $port,
                $dbName,
                DB_CHARSET
            );
        } else {
            $charset = (DB_CHARSET === 'utf8') ? 'utf8mb4' : DB_CHARSET;
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                $host === '127.0.0.1' ? 'localhost' : $host,
                $port,
                $dbName,
                $charset
            );
        }

        $pdoOptions = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
            PDO::ATTR_TIMEOUT => 5,
        ];

        return new PDO($dsn, $user, $pass, $pdoOptions);
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
     * معالجة الاستعلام لضمان التوافق بين PostgreSQL و MySQL
     */
    public static function normalizeQuery(string $sql): string
    {
        if (self::$driver === 'pgsql') {
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
                if ($attempt === 1 && (str_contains($e->getMessage(), 'server closed the connection') || str_contains($e->getMessage(), 'gone away') || str_contains($e->getMessage(), 'Connection lost') || str_contains($e->getMessage(), 'Broken pipe'))) {
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
                if ($attempt === 1 && (str_contains($e->getMessage(), 'server closed the connection') || str_contains($e->getMessage(), 'gone away') || str_contains($e->getMessage(), 'Connection lost') || str_contains($e->getMessage(), 'Broken pipe'))) {
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
