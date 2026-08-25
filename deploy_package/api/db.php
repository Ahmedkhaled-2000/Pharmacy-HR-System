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
            self::$driver = in_array($driver, ['pgsql', 'postgres', 'postgresql'], true) ? 'pgsql' : 'mysql';

            try {
                if (self::$driver === 'pgsql') {
                    $dsn = sprintf(
                        'pgsql:host=%s;port=%d;dbname=%s;options=\'--client_encoding=%s\'',
                        DB_HOST,
                        DB_PORT,
                        DB_NAME,
                        DB_CHARSET
                    );
                } else {
                    $charset = (DB_CHARSET === 'utf8') ? 'utf8mb4' : DB_CHARSET;
                    $dsn = sprintf(
                        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                        DB_HOST,
                        DB_PORT,
                        DB_NAME,
                        $charset
                    );
                }

                $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_STRINGIFY_FETCHES => false,
                ]);

                self::$instance = $pdo;
            } catch (PDOException $e) {
                error_log('[DB Connection Error] ' . $e->getMessage());
                jsonResponse([
                    'success' => false,
                    'error' => 'Database connection failed. Please verify PostgreSQL credentials in api/config.php.',
                    'details' => $e->getMessage()
                ], 500);
            }
        }

        return self::$instance;
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
     * تنفيذ استعلام محمي وإرجاع جميع السجلات
     *
     * @param string $sql
     * @param mixed $typesOrParams
     * @param array<int, mixed> $params
     * @return array<int, array<string, mixed>>
     */
    public static function query(string $sql, mixed $typesOrParams = '', array $params = []): array
    {
        $db = self::getConnection();
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

        $stmt = $db->prepare($normalizedSql);
        $stmt->execute($actualParams);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
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
        $db = self::getConnection();
        $actualParams = self::resolveParams($typesOrParams, $params);
        $normalizedSql = self::normalizeQuery($sql);

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
