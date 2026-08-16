<?php
/**
 * Sample Configuration File for Apex Thunder Web Hosting Panel
 * قم بتغيير البيانات أدناه حسب بيانات قاعدة البيانات التي قمت بإنشائها من لوحة التحكم
 */

declare(strict_types=1);

// --------------------------------------------------------------------------
// بيانات الاتصال بقاعدة بيانات MariaDB 10.11
// --------------------------------------------------------------------------
define('DB_HOST', 'localhost');              // عادة localhost على استضافة Apex Thunder
define('DB_PORT', 3306);                     // منفذ MariaDB الافتراضي
define('DB_NAME', 'node_PharmacyHR');        // اسم قاعدة البيانات المنشأة في الاستضافة
define('DB_USER', 'node_PharmacyHR');        // اسم مستخدم قاعدة البيانات
define('DB_PASS', 'Ahmed.2000');             // كلمة مرور قاعدة البيانات
define('DB_CHARSET', 'utf8mb4');

define('DEFAULT_STORAGE_KEY', 'pharmacy-tracker-data');
