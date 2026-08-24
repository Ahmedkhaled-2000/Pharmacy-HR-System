<?php
/**
 * Sample Configuration File for Apex Thunder Web Hosting Panel (PostgreSQL / MySQL)
 * قم بتغيير البيانات أدناه حسب بيانات قاعدة البيانات التي قمت بإنشائها من لوحة التحكم
 */

declare(strict_types=1);

// --------------------------------------------------------------------------
// بيانات الاتصال بقاعدة بيانات PostgreSQL (أو MySQL) على Apex Thunder
// --------------------------------------------------------------------------
define('DB_DRIVER', 'pgsql');                // 'pgsql' لـ PostgreSQL أو 'mysql' لـ MariaDB/MySQL
define('DB_HOST', '127.0.0.1');              // 127.0.0.1 على استضافة Apex Thunder
define('DB_PORT', 5432);                     // 5432 لـ PostgreSQL (أو 3306 لـ MySQL)
define('DB_NAME', 'nodej8878_pharmacy_hr'); // اسم قاعدة البيانات المنشأة في الاستضافة
define('DB_USER', 'nodej8878_pg');          // اسم مستخدم قاعدة البيانات
define('DB_PASS', 'C6kMke4Uwj_dYtbCNHJx55r*'); // كلمة مرور قاعدة البيانات
define('DB_CHARSET', 'utf8');

define('DEFAULT_STORAGE_KEY', 'pharmacy-tracker-data');
