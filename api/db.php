<?php
/**
 * MariaDB / MySQLi Database Connection & Query Wrapper
 * PHP 8.1 - 8.5 Compatible with Prepared Statements
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

class Database
{
    private static ?mysqli $instance = null;

    /**
     * الحصول على اتصال قاعدة البيانات (Singleton Pattern)
     */
    public static function getConnection(): mysqli
    {
        if (self::$instance === null) {
            // تفعيل الإبلاغ عن أخطاء mysqli بأمان
            mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

            try {
                $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
                $mysqli->set_charset(DB_CHARSET);
                $mysqli->options(MYSQLI_OPT_INT_AND_FLOAT_NATIVE, 1);
                
                self::$instance = $mysqli;
            } catch (mysqli_sql_exception $e) {
                error_log('[DB Error] Connection failed: ' . $e->getMessage());
                jsonResponse([
                    'success' => false,
                    'error' => 'Database connection failed. Please verify DB credentials in api/config.php.',
                    'details' => $e->getMessage()
                ], 500);
            }
        }

        return self::$instance;
    }

    /**
     * تنفيذ استعلام محمي باستخدام Prepared Statements
     *
     * @param string $sql
     * @param string $types نوع المتغيرات (مثل 's', 'i', 'ssi')
     * @param array<int, mixed> $params
     * @return array<int, array<string, mixed>>
     */
    public static function query(string $sql, string $types = '', array $params = []): array
    {
        $db = self::getConnection();
        $stmt = $db->prepare($sql);

        if (!$stmt) {
            throw new RuntimeException('Failed to prepare statement: ' . $db->error);
        }

        if (!empty($types) && !empty($params)) {
            $stmt->bind_param($types, ...$params);
        }

        $stmt->execute();
        $result = $stmt->get_result();

        $rows = [];
        if ($result instanceof mysqli_result) {
            while ($row = $result->fetch_assoc()) {
                $rows[] = $row;
            }
            $result->free();
        }

        $stmt->close();
        return $rows;
    }

    /**
     * تنفيذ استعلام إدراج/تحديث/حذف وإرجاع عدد السجلات المتأثرة
     *
     * @param string $sql
     * @param string $types
     * @param array<int, mixed> $params
     * @return array{affected_rows: int, insert_id: int|string}
     */
    public static function execute(string $sql, string $types = '', array $params = []): array
    {
        $db = self::getConnection();
        $stmt = $db->prepare($sql);

        if (!$stmt) {
            throw new RuntimeException('Failed to prepare statement: ' . $db->error);
        }

        if (!empty($types) && !empty($params)) {
            $stmt->bind_param($types, ...$params);
        }

        $stmt->execute();
        $affectedRows = $stmt->affected_rows;
        $insertId = $stmt->insert_id;
        $stmt->close();

        return [
            'affected_rows' => $affectedRows,
            'insert_id' => $insertId
        ];
    }

    /**
     * تنفيذ استعلام وإرجاع سجل واحد فقط
     *
     * @param string $sql
     * @param string $types
     * @param array<int, mixed> $params
     * @return array<string, mixed>|null
     */
    public static function queryOne(string $sql, string $types = '', array $params = []): ?array
    {
        $rows = self::query($sql, $types, $params);
        return !empty($rows) ? $rows[0] : null;
    }
}
