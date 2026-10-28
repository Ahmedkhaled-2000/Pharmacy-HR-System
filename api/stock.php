<?php
/**
 * stock.php
 * معالج مسارات واجهة برمجة التطبيقات (API) لمنظومة PharmaOS Stock المركزية
 * متوافق بنسبة 100% مع بيئات الاستضافة السحابية و LiteSpeed / CyberPanel / Nginx / Apache
 * يعمل مباشرة على قاعدة بيانات Supabase PostgreSQL مع دعم المعاملات المزدوجة (Double-Entry Ledger)
 * متوافق مع PHP 8.1 - 8.5
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

/**
 * دالة مساعدة لتوليد UUID v4
 */
function stockGenerateUuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/**
 * استخراج المستخدم الموثق لمنظومة المخازن
 */
function getAuthenticatedStockUser(): ?array
{
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (empty($authHeader) && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    $token = '';
    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
    }
    if (empty($token) && !empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        $token = trim($_SERVER['HTTP_X_AUTH_TOKEN']);
    }

    // دعم محطات الكاشير لنقاط البيع POS
    if (empty($token) && !empty($_SERVER['HTTP_X_POS_TERMINAL'])) {
        return [
            'id' => 'pos_' . preg_replace('/[^a-zA-Z0-9_-]/', '', $_SERVER['HTTP_X_POS_TERMINAL']),
            'username' => 'pos_cashier',
            'name' => 'نقطة بيع كاشير',
            'role' => 'pos'
        ];
    }

    if (!empty($token)) {
        $u = verifyApiToken($token);
        if ($u) {
            return [
                'id' => $u['id'] ?? $u['userId'] ?? $u['username'] ?? 'usr_stock',
                'username' => $u['username'] ?? '',
                'name' => $u['name'] ?? $u['fullName'] ?? $u['username'] ?? 'مسؤول المخازن',
                'role' => strtolower(str_replace('outstock_', '', (string)($u['role'] ?? 'owner'))),
                'branchId' => $u['branchId'] ?? $u['branch_id'] ?? null
            ];
        }

        // فك التوكن القياسي المستقل
        try {
            $parts = explode('.', $token);
            if (count($parts) === 3) {
                $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
                if (is_array($payload) && (!isset($payload['exp']) || $payload['exp'] > time())) {
                    return [
                        'id' => $payload['id'] ?? $payload['userId'] ?? $payload['username'] ?? 'usr_stock',
                        'username' => $payload['username'] ?? '',
                        'name' => $payload['fullName'] ?? $payload['name'] ?? $payload['username'] ?? 'مسؤول المخازن',
                        'role' => strtolower(str_replace('outstock_', '', (string)($payload['role'] ?? 'owner'))),
                        'branchId' => $payload['branchId'] ?? $payload['branch_id'] ?? null
                    ];
                }
            }
        } catch (Throwable) {}
    }

    // دور افتراضي للمطور أو المشرف الموثوق في بيئة التطوير
    $appRole = $_SERVER['HTTP_X_APP_ROLE'] ?? '';
    if (!empty($appRole)) {
        return [
            'id' => 'usr_admin',
            'username' => 'admin',
            'name' => 'مدير النظام',
            'role' => $appRole,
            'branchId' => null
        ];
    }

    return null;
}

/**
 * قيد حركة في دفتر الأستاذ الدائم وتحديث الرصيد اللحظي
 */
function stockRecordLedgerMovement(array $data): void
{
    $idempotencyKey = $data['idempotencyKey'] ?? ('mov_' . stockGenerateUuid());

    // تحقق من عدم تكرار العملية
    $existing = Database::queryOne(
        "SELECT id FROM public.inventory_ledger WHERE idempotency_key = ? LIMIT 1",
        [$idempotencyKey]
    );
    if ($existing) {
        return; // مسجلة مسبقاً
    }

    $transactionId = $data['transactionId'] ?? ('tx_' . stockGenerateUuid());
    $movementType = $data['movementType'] ?? 'manual_adjustment';
    $locationId = $data['locationId'] ?? 'loc_central';
    $medicationId = $data['medicationId'];
    $batchId = $data['batchId'] ?? null;
    $quantityBase = (float)($data['quantityBase'] ?? 0);
    $unitCost = (float)($data['unitCost'] ?? 0);
    $totalCost = abs($quantityBase) * $unitCost;
    $docType = $data['documentType'] ?? 'manual';
    $docNumber = $data['documentNumber'] ?? '';
    $docId = $data['documentId'] ?? null;
    $performedById = $data['performedById'] ?? 'sys';
    $performedByName = $data['performedByName'] ?? 'النظام';
    $performedByRole = $data['performedByRole'] ?? 'system';
    $notes = $data['notes'] ?? '';

    // إدراج السجل غير القابل للتعديل
    Database::execute(
        "INSERT INTO public.inventory_ledger (
            transaction_id, idempotency_key, movement_type, location_id,
            medication_id, batch_id, quantity_base, unit_cost, total_cost,
            document_type, document_number, document_id, performed_by_id,
            performed_by_name, performed_by_role, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
        [
            $transactionId, $idempotencyKey, $movementType, $locationId,
            $medicationId, $batchId, $quantityBase, $unitCost, $totalCost,
            $docType, $docNumber, $docId, $performedById,
            $performedByName, $performedByRole, $notes
        ]
    );

    // تحديث الرصيد اللحظي المجمع (Materialized Balance)
    $balId = "{$locationId}_{$medicationId}_" . ($batchId ?: 'default');
    Database::execute(
        "INSERT INTO public.inventory_balances (
            id, location_id, medication_id, batch_id, quantity_on_hand,
            avg_unit_cost, last_movement_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON CONFLICT (location_id, medication_id, batch_id) DO UPDATE SET
            quantity_on_hand = public.inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
            avg_unit_cost = CASE WHEN EXCLUDED.avg_unit_cost > 0 THEN EXCLUDED.avg_unit_cost ELSE public.inventory_balances.avg_unit_cost END,
            last_movement_at = NOW(),
            updated_at = NOW()",
        [$balId, $locationId, $medicationId, $batchId, $quantityBase, $unitCost]
    );
}

/**
 * معالج استدعاءات API لمنظومة المخازن
 */
function handleStockApi(string $subPath, string $method): void
{
    $user = getAuthenticatedStockUser();
    if (!$user) {
        jsonResponse(['success' => false, 'error' => 'غير مصرح: يلزم توفير توكن جلسة نشط للنظام'], 401);
    }

    $rawInput = file_get_contents('php://input');
    $body = !empty($rawInput) ? json_decode($rawInput, true) : [];
    if (!is_array($body)) $body = [];

    $subPath = trim($subPath, '/');

    try {
        // ── 1. لوحة المؤشرات الإحصائية Overview ──
        if ($subPath === 'overview' && $method === 'GET') {
            $branchId = $_GET['branch_id'] ?? $_GET['branchId'] ?? '';
            $params = [];
            $locFilter = '';
            if (!empty($branchId) && $branchId !== 'all') {
                $locFilter = "WHERE b.location_id = ?";
                $params[] = 'loc_branch_' . $branchId;
            }

            $valRow = Database::queryOne("
                SELECT 
                    COALESCE(SUM(b.quantity_on_hand * COALESCE(ib.cost_price, m.unit_price * 0.75, 0)), 0) as total_cost_value,
                    COALESCE(SUM(b.quantity_on_hand * COALESCE(m.public_price, 0)), 0) as total_public_value,
                    COUNT(DISTINCT b.medication_id) as total_skus,
                    COALESCE(SUM(CASE WHEN b.quantity_on_hand < 5 THEN 1 ELSE 0 END), 0) as low_stock_count
                FROM public.inventory_balances b
                JOIN public.outstock_medications m ON m.id = b.medication_id
                LEFT JOIN public.inventory_batches ib ON ib.id = b.batch_id
                $locFilter
            ", $params);

            // التحويلات المعلقة
            $transfersRow = Database::queryOne("
                SELECT 
                    COALESCE(SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END), 0) as in_transit_count,
                    COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) as pending_dispatch_count
                FROM public.inventory_transfers
            ");

            // الأدوية قريبة الانتهاء خلال 90 يوماً
            $expRow = Database::queryOne("
                SELECT COUNT(DISTINCT ib.id) as near_expiry_count
                FROM public.inventory_batches ib
                JOIN public.inventory_balances b ON b.batch_id = ib.id
                WHERE b.quantity_on_hand > 0 
                  AND ib.expiry_date <= (CURRENT_DATE + INTERVAL '90 days')
            ");

            jsonResponse([
                'success' => true,
                'totalCostValue' => (float)($valRow['total_cost_value'] ?? 0),
                'totalPublicValue' => (float)($valRow['total_public_value'] ?? 0),
                'totalSkus' => (int)($valRow['total_skus'] ?? 0),
                'lowStockCount' => (int)($valRow['low_stock_count'] ?? 0),
                'inTransitCount' => (int)($transfersRow['in_transit_count'] ?? 0),
                'pendingDispatchCount' => (int)($transfersRow['pending_dispatch_count'] ?? 0),
                'nearExpiryCount' => (int)($expRow['near_expiry_count'] ?? 0)
            ]);
        }

        // ── 2. إدارة المواقع والمستودعات Locations ──
        if ($subPath === 'locations') {
            if ($method === 'GET') {
                $locations = Database::query("
                    SELECT l.*, 
                           COALESCE(SUM(b.quantity_on_hand), 0) as total_units_stored,
                           COUNT(DISTINCT b.medication_id) as total_active_skus
                    FROM public.inventory_locations l
                    LEFT JOIN public.inventory_balances b ON b.location_id = l.id
                    GROUP BY l.id
                    ORDER BY l.is_central DESC, l.name_ar ASC
                ");
                jsonResponse(['success' => true, 'locations' => $locations]);
            }
            if ($method === 'POST') {
                $code = trim((string)($body['code'] ?? ''));
                $nameAr = trim((string)($body['name_ar'] ?? ''));
                $locType = trim((string)($body['location_type'] ?? 'branch_store'));
                $branchId = !empty($body['branch_id']) ? trim((string)$body['branch_id']) : null;
                $isCentral = !empty($body['is_central']);
                $allowNegative = !empty($body['allow_negative_stock']);
                $id = !empty($body['id']) ? (string)$body['id'] : ('loc_' . stockGenerateUuid());

                Database::execute("
                    INSERT INTO public.inventory_locations (
                        id, code, name_ar, location_type, branch_id, is_central,
                        allow_negative_stock, is_active, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        name_ar = EXCLUDED.name_ar,
                        location_type = EXCLUDED.location_type,
                        branch_id = EXCLUDED.branch_id,
                        allow_negative_stock = EXCLUDED.allow_negative_stock,
                        updated_at = NOW()
                ", [$id, $code, $nameAr, $locType, $branchId, $isCentral, $allowNegative]);

                jsonResponse(['success' => true, 'message' => 'تم حفظ بيانات موقع التخزين بنجاح', 'id' => $id]);
            }
        }

        // ── 3. كشاف الأرصدة والكميات Balances ──
        if ($subPath === 'balances' && $method === 'GET') {
            $locId = $_GET['location_id'] ?? '';
            $branchId = $_GET['branch_id'] ?? '';
            $search = $_GET['search'] ?? '';
            $lowStock = !empty($_GET['low_stock']);
            $limit = min(300, max(1, (int)($_GET['limit'] ?? 100)));
            $offset = max(0, (int)($_GET['offset'] ?? 0));

            $params = [];
            $where = ["1=1"];

            if (!empty($locId)) {
                $where[] = "b.location_id = ?";
                $params[] = $locId;
            } elseif (!empty($branchId)) {
                $where[] = "loc.branch_id = ?";
                $params[] = $branchId;
            }

            if (!empty($search)) {
                $where[] = "(m.trade_name_ar ILIKE ? OR m.trade_name_en ILIKE ? OR m.barcode = ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = $search;
            }

            if ($lowStock) {
                $where[] = "b.quantity_on_hand < 10";
            }

            $whereStr = implode(' AND ', $where);

            $rows = Database::query("
                SELECT 
                    b.id as balance_id,
                    b.location_id,
                    loc.name_ar as location_name,
                    loc.code as location_code,
                    loc.is_central,
                    m.id as medication_id,
                    m.trade_name_ar,
                    m.trade_name_en,
                    m.barcode,
                    m.category,
                    m.unit_type,
                    m.unit_price as catalog_cost,
                    m.public_price,
                    b.batch_id,
                    ib.batch_number,
                    ib.expiry_date,
                    ib.cost_price as batch_cost,
                    ib.is_quarantined,
                    b.quantity_on_hand,
                    b.quantity_reserved,
                    (b.quantity_on_hand - b.quantity_reserved) as available_quantity,
                    (b.quantity_on_hand * COALESCE(ib.cost_price, m.unit_price, 0)) as total_cost_value,
                    b.updated_at
                FROM public.inventory_balances b
                JOIN public.inventory_locations loc ON loc.id = b.location_id
                JOIN public.outstock_medications m ON m.id = b.medication_id
                LEFT JOIN public.inventory_batches ib ON ib.id = b.batch_id
                WHERE $whereStr
                ORDER BY m.trade_name_ar ASC, ib.expiry_date ASC
                LIMIT $limit OFFSET $offset
            ", $params);

            jsonResponse(['success' => true, 'count' => count($rows), 'balances' => $rows]);
        }

        // مطابقة رصيد صنف يدوياً
        if ($subPath === 'balances/reconcile' && $method === 'POST') {
            $medId = (string)($body['medication_id'] ?? '');
            $locId = (string)($body['location_id'] ?? '');
            if (empty($medId) || empty($locId)) {
                jsonResponse(['success' => false, 'error' => 'الصنف والموقع مطلوبان للمطابقة'], 400);
            }

            $sumRows = Database::query("
                SELECT batch_id, COALESCE(SUM(quantity_base), 0) as total_qty
                FROM public.inventory_ledger
                WHERE location_id = ? AND medication_id = ?
                GROUP BY batch_id
            ", [$locId, $medId]);

            foreach ($sumRows as $r) {
                $bId = $r['batch_id'] ?? 'default';
                $balId = "{$locId}_{$medId}_{$bId}";
                $qty = (float)$r['total_qty'];

                Database::execute("
                    INSERT INTO public.inventory_balances (id, location_id, medication_id, batch_id, quantity_on_hand, updated_at)
                    VALUES (?, ?, ?, ?, ?, NOW())
                    ON CONFLICT (location_id, medication_id, batch_id) DO UPDATE SET
                        quantity_on_hand = EXCLUDED.quantity_on_hand,
                        updated_at = NOW()
                ", [$balId, $locId, $medId, $r['batch_id'], $qty]);
            }

            jsonResponse(['success' => true, 'message' => 'تمت مطابقة رصيد الصنف وفق حركات الدفتر بنجاح']);
        }

        // ── 4. قائمة التشغيلات وتواريخ الصلاحية Batches ──
        if ($subPath === 'batches' && $method === 'GET') {
            $medId = $_GET['medication_id'] ?? '';
            $expiringSoon = !empty($_GET['expiring_soon']);
            $params = [];
            $where = ["1=1"];

            if (!empty($medId)) {
                $where[] = "ib.medication_id = ?";
                $params[] = $medId;
            }
            if ($expiringSoon) {
                $where[] = "ib.expiry_date <= (CURRENT_DATE + INTERVAL '90 days')";
            }

            $whereStr = implode(' AND ', $where);

            $rows = Database::query("
                SELECT 
                    ib.*,
                    m.trade_name_ar,
                    m.trade_name_en,
                    m.barcode,
                    m.unit_type,
                    COALESCE(SUM(b.quantity_on_hand), 0) as total_on_hand
                FROM public.inventory_batches ib
                JOIN public.outstock_medications m ON m.id = ib.medication_id
                LEFT JOIN public.inventory_balances b ON b.batch_id = ib.id
                WHERE $whereStr
                GROUP BY ib.id, m.id
                ORDER BY ib.expiry_date ASC
                LIMIT 200
            ", $params);

            jsonResponse(['success' => true, 'batches' => $rows]);
        }

        // تبديل حالة الحجر الصحي لتشغيلة
        if ($subPath === 'batches/toggle-quarantine' && $method === 'POST') {
            $batchId = (string)($body['batch_id'] ?? '');
            $quarantine = !empty($body['is_quarantined']);
            Database::execute("
                UPDATE public.inventory_batches
                SET is_quarantined = ?, updated_at = NOW()
                WHERE id = ?
            ", [$quarantine, $batchId]);

            jsonResponse(['success' => true, 'message' => $quarantine ? 'تم عزل التشغيلة بنجاح' : 'تم رفع العزل عن التشغيلة']);
        }

        // ── 5. سجل دفتر الأستاذ الدائم Ledger ──
        if ($subPath === 'ledger' && $method === 'GET') {
            $limit = min(200, max(1, (int)($_GET['limit'] ?? 100)));
            $locId = $_GET['location_id'] ?? '';
            $params = [];
            $where = ["1=1"];
            if (!empty($locId)) {
                $where[] = "l.location_id = ?";
                $params[] = $locId;
            }
            $whereStr = implode(' AND ', $where);

            $rows = Database::query("
                SELECT 
                    l.*,
                    loc.name_ar as location_name,
                    m.trade_name_ar,
                    m.trade_name_en,
                    ib.batch_number,
                    ib.expiry_date
                FROM public.inventory_ledger l
                LEFT JOIN public.inventory_locations loc ON loc.id = l.location_id
                LEFT JOIN public.outstock_medications m ON m.id = l.medication_id
                LEFT JOIN public.inventory_batches ib ON ib.id = l.batch_id
                WHERE $whereStr
                ORDER BY l.id DESC
                LIMIT $limit
            ", $params);

            jsonResponse(['success' => true, 'count' => count($rows), 'ledger' => $rows]);
        }

        // ── 6. أوامر التحويل بين المستودعات والفروع Transfers ──
        if ($subPath === 'transfers') {
            if ($method === 'GET') {
                $rows = Database::query("
                    SELECT 
                        t.*,
                        src.name_ar as source_location_name,
                        dst.name_ar as destination_location_name,
                        COUNT(ti.id) as items_count
                    FROM public.inventory_transfers t
                    LEFT JOIN public.inventory_locations src ON src.id = t.source_location_id
                    LEFT JOIN public.inventory_locations dst ON dst.id = t.destination_location_id
                    LEFT JOIN public.inventory_transfer_items ti ON ti.transfer_id = t.id
                    GROUP BY t.id, src.name_ar, dst.name_ar
                    ORDER BY t.created_at DESC
                    LIMIT 100
                ");
                jsonResponse(['success' => true, 'transfers' => $rows]);
            }
            if ($method === 'POST') {
                $srcLoc = (string)($body['source_location_id'] ?? 'loc_central');
                $dstLoc = (string)($body['destination_location_id'] ?? '');
                $items = is_array($body['items'] ?? null) ? $body['items'] : [];
                $driverName = (string)($body['driver_name'] ?? '');
                $driverPhone = (string)($body['driver_phone'] ?? '');
                $notes = (string)($body['notes'] ?? '');

                if (empty($dstLoc)) jsonResponse(['success' => false, 'error' => 'مستودع الوجهة مطلوب'], 400);
                if (empty($items)) jsonResponse(['success' => false, 'error' => 'يجب إدراج صنف واحد على الأقل'], 400);

                $transferId = 'trf_' . stockGenerateUuid();
                $transferNumber = 'TRF-' . strtoupper(substr(md5(uniqid()), 0, 8));

                Database::execute("
                    INSERT INTO public.inventory_transfers (
                        id, transfer_number, transfer_type, source_location_id,
                        destination_location_id, in_transit_location_id, status,
                        requested_by_id, requested_by_name, total_requested_items,
                        driver_name, driver_phone, notes, created_at, updated_at
                    ) VALUES (?, ?, 'main_to_branch', ?, ?, 'loc_in_transit', 'draft', ?, ?, ?, ?, ?, ?, NOW(), NOW())
                ", [
                    $transferId, $transferNumber, $srcLoc, $dstLoc,
                    $user['id'], $user['name'], count($items),
                    $driverName, $driverPhone, $notes
                ]);

                foreach ($items as $it) {
                    $itemId = 'trfi_' . stockGenerateUuid();
                    Database::execute("
                        INSERT INTO public.inventory_transfer_items (
                            id, transfer_id, medication_id, batch_id, unit_type,
                            quantity_requested, quantity_approved, unit_cost, item_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                    ", [
                        $itemId, $transferId, $it['medication_id'], $it['batch_id'] ?? null,
                        $it['unit_type'] ?? 'pack', (float)($it['quantity_requested'] ?? 1),
                        (float)($it['quantity_requested'] ?? 1), (float)($it['unit_cost'] ?? 0)
                    ]);
                }

                jsonResponse([
                    'success' => true,
                    'message' => 'تم إنشاء أمر التحويل بنجاح',
                    'transfer_id' => $transferId,
                    'transfer_number' => $transferNumber
                ]);
            }
        }

        // تفاصيل أمر تحويل
        if (preg_match('#^transfers/([^/]+)$#', $subPath, $m) && $method === 'GET') {
            $tId = $m[1];
            $transfer = Database::queryOne("
                SELECT t.*, src.name_ar as source_location_name, dst.name_ar as destination_location_name
                FROM public.inventory_transfers t
                LEFT JOIN public.inventory_locations src ON src.id = t.source_location_id
                LEFT JOIN public.inventory_locations dst ON dst.id = t.destination_location_id
                WHERE t.id = ? OR t.transfer_number = ?
            ", [$tId, $tId]);

            if (!$transfer) jsonResponse(['success' => false, 'error' => 'أمر التحويل غير موجود'], 404);

            $items = Database::query("
                SELECT ti.*, m.trade_name_ar, m.trade_name_en, m.barcode, ib.batch_number, ib.expiry_date
                FROM public.inventory_transfer_items ti
                JOIN public.outstock_medications m ON m.id = ti.medication_id
                LEFT JOIN public.inventory_batches ib ON ib.id = ti.batch_id
                WHERE ti.transfer_id = ?
            ", [$transfer['id']]);

            jsonResponse(['success' => true, 'transfer' => $transfer, 'items' => $items]);
        }

        // صرف وشحن أمر تحويل Dispatch
        if (preg_match('#^transfers/([^/]+)/dispatch$#', $subPath, $m) && $method === 'POST') {
            $tId = $m[1];
            $transfer = Database::queryOne("SELECT * FROM public.inventory_transfers WHERE id = ?", [$tId]);
            if (!$transfer) jsonResponse(['success' => false, 'error' => 'أمر التحويل غير موجود'], 404);
            if ($transfer['status'] !== 'draft') jsonResponse(['success' => false, 'error' => 'تم صرف هذا التحويل مسبقاً'], 400);

            $items = Database::query("SELECT * FROM public.inventory_transfer_items WHERE transfer_id = ?", [$tId]);

            foreach ($items as $it) {
                $qty = (float)$it['quantity_approved'];
                if ($qty <= 0) $qty = (float)$it['quantity_requested'];

                // 1. خصم من المستودع المصدر
                stockRecordLedgerMovement([
                    'idempotencyKey' => "trf_disp_src_{$tId}_{$it['id']}",
                    'movementType' => 'branch_transfer_out',
                    'locationId' => $transfer['source_location_id'],
                    'medicationId' => $it['medication_id'],
                    'batchId' => $it['batch_id'],
                    'quantityBase' => -$qty,
                    'unitCost' => (float)$it['unit_cost'],
                    'documentType' => 'transfer_order',
                    'documentNumber' => $transfer['transfer_number'],
                    'performedById' => $user['id'],
                    'performedByName' => $user['name'],
                    'notes' => 'صرف شحنة تحويل إلى الطريق'
                ]);

                // 2. إضافة إلى رصيد الطريق In-Transit
                stockRecordLedgerMovement([
                    'idempotencyKey' => "trf_disp_tr_{$tId}_{$it['id']}",
                    'movementType' => 'branch_transfer_in',
                    'locationId' => 'loc_in_transit',
                    'medicationId' => $it['medication_id'],
                    'batchId' => $it['batch_id'],
                    'quantityBase' => $qty,
                    'unitCost' => (float)$it['unit_cost'],
                    'documentType' => 'transfer_order',
                    'documentNumber' => $transfer['transfer_number'],
                    'performedById' => $user['id'],
                    'performedByName' => $user['name'],
                    'notes' => 'شحنة في عهدة الطريق'
                ]);

                Database::execute("
                    UPDATE public.inventory_transfer_items
                    SET quantity_dispatched = ?, item_status = 'dispatched'
                    WHERE id = ?
                ", [$qty, $it['id']]);
            }

            Database::execute("
                UPDATE public.inventory_transfers
                SET status = 'in_transit', dispatched_by_id = ?, dispatched_by_name = ?, dispatched_at = NOW(), updated_at = NOW()
                WHERE id = ?
            ", [$user['id'], $user['name'], $tId]);

            jsonResponse(['success' => true, 'message' => 'تم صرف الشحنة ونقلها لعهدة الطريق بنجاح']);
        }

        // استلام وتأكيد الشحنة في الفرع Receive
        if (preg_match('#^transfers/([^/]+)/receive$#', $subPath, $m) && $method === 'POST') {
            $tId = $m[1];
            $transfer = Database::queryOne("SELECT * FROM public.inventory_transfers WHERE id = ?", [$tId]);
            if (!$transfer) jsonResponse(['success' => false, 'error' => 'أمر التحويل غير موجود'], 404);
            if ($transfer['status'] !== 'in_transit') jsonResponse(['success' => false, 'error' => 'الشحنة ليست قيد النقل في الطريق'], 400);

            $receivedInputs = is_array($body['received_items'] ?? null) ? $body['received_items'] : [];
            $items = Database::query("SELECT * FROM public.inventory_transfer_items WHERE transfer_id = ?", [$tId]);

            foreach ($items as $origItem) {
                $input = null;
                foreach ($receivedInputs as $ri) {
                    if (($ri['item_id'] ?? '') === $origItem['id']) { $input = $ri; break; }
                }

                $qtyDispatched = (float)$origItem['quantity_dispatched'];
                $qtyReceived = isset($input['quantity_received']) ? (float)$input['quantity_received'] : $qtyDispatched;
                $qtyDamaged = isset($input['quantity_damaged']) ? (float)$input['quantity_damaged'] : 0.0;
                $qtyShortage = max(0.0, $qtyDispatched - $qtyReceived - $qtyDamaged);

                // إفراغ من الطريق
                stockRecordLedgerMovement([
                    'idempotencyKey' => "trf_rec_clr_{$tId}_{$origItem['id']}",
                    'movementType' => 'branch_transfer_out',
                    'locationId' => 'loc_in_transit',
                    'medicationId' => $origItem['medication_id'],
                    'batchId' => $origItem['batch_id'],
                    'quantityBase' => -$qtyDispatched,
                    'unitCost' => (float)$origItem['unit_cost'],
                    'documentType' => 'transfer_order',
                    'documentNumber' => $transfer['transfer_number'],
                    'performedById' => $user['id'],
                    'performedByName' => $user['name'],
                    'notes' => 'تفريغ عهدة الطريق'
                ]);

                // إضافة السليم للفرع
                if ($qtyReceived > 0) {
                    stockRecordLedgerMovement([
                        'idempotencyKey' => "trf_rec_in_{$tId}_{$origItem['id']}",
                        'movementType' => 'branch_transfer_in',
                        'locationId' => $transfer['destination_location_id'],
                        'medicationId' => $origItem['medication_id'],
                        'batchId' => $origItem['batch_id'],
                        'quantityBase' => $qtyReceived,
                        'unitCost' => (float)$origItem['unit_cost'],
                        'documentType' => 'transfer_order',
                        'documentNumber' => $transfer['transfer_number'],
                        'performedById' => $user['id'],
                        'performedByName' => $user['name'],
                        'notes' => 'استلام بضاعة واردة بالفرع'
                    ]);
                }

                // تسجيل التالف
                if ($qtyDamaged > 0) {
                    stockRecordLedgerMovement([
                        'idempotencyKey' => "trf_rec_dam_{$tId}_{$origItem['id']}",
                        'movementType' => 'scrap_expired',
                        'locationId' => 'loc_damaged',
                        'medicationId' => $origItem['medication_id'],
                        'batchId' => $origItem['batch_id'],
                        'quantityBase' => $qtyDamaged,
                        'unitCost' => (float)$origItem['unit_cost'],
                        'documentType' => 'transfer_order',
                        'documentNumber' => $transfer['transfer_number'],
                        'performedById' => $user['id'],
                        'performedByName' => $user['name'],
                        'notes' => 'تلف شحنة أثناء النقل'
                    ]);
                }

                Database::execute("
                    UPDATE public.inventory_transfer_items
                    SET quantity_received = ?, quantity_damaged = ?, quantity_shortage = ?, item_status = 'received'
                    WHERE id = ?
                ", [$qtyReceived, $qtyDamaged, $qtyShortage, $origItem['id']]);
            }

            Database::execute("
                UPDATE public.inventory_transfers
                SET status = 'received_fully', received_by_id = ?, received_by_name = ?, received_at = NOW(), updated_at = NOW()
                WHERE id = ?
            ", [$user['id'], $user['name'], $tId]);

            jsonResponse(['success' => true, 'message' => 'تم استلام الشحنة وتحديث أرصدة الفرع بنجاح']);
        }

        // ── 7. استلام فواتير المشتريات والتوريد Receipts ──
        if ($subPath === 'receipts' && $method === 'POST') {
            $supplierId = (string)($body['supplier_id'] ?? '');
            $locId = (string)($body['location_id'] ?? 'loc_central');
            $invoiceNumber = (string)($body['invoice_number'] ?? ('REC-' . strtoupper(substr(md5(uniqid()), 0, 8))));
            $items = is_array($body['items'] ?? null) ? $body['items'] : [];

            if (empty($items)) jsonResponse(['success' => false, 'error' => 'قائمة أصناف الفاتورة فارغة'], 400);

            foreach ($items as $it) {
                $medId = (string)($it['medication_id'] ?? '');
                $batchNum = (string)($it['batch_number'] ?? 'DEFAULT');
                $expDate = (string)($it['expiry_date'] ?? date('Y-m-d', strtotime('+2 years')));
                $qty = (float)($it['quantity'] ?? 0);
                $unitCost = (float)($it['unit_cost'] ?? 0);
                $publicPrice = (float)($it['public_price'] ?? 0);

                if ($qty <= 0) continue;

                // إنشاء أو استرجاع التشغيلة
                $batchId = 'bat_' . md5("{$medId}_{$batchNum}_{$expDate}_{$unitCost}");
                Database::execute("
                    INSERT INTO public.inventory_batches (
                        id, medication_id, batch_number, expiry_date, cost_price,
                        public_price, supplier_id, receipt_reference_id, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
                    ON CONFLICT (medication_id, batch_number, expiry_date, cost_price) DO UPDATE SET
                        public_price = EXCLUDED.public_price,
                        updated_at = NOW()
                ", [$batchId, $medId, $batchNum, $expDate, $unitCost, $publicPrice, $supplierId ?: null, $invoiceNumber]);

                // قيد الاستلام في دفتر الأستاذ
                stockRecordLedgerMovement([
                    'idempotencyKey' => "rec_{$invoiceNumber}_{$medId}_{$batchNum}",
                    'movementType' => 'purchase_receipt',
                    'locationId' => $locId,
                    'medicationId' => $medId,
                    'batchId' => $batchId,
                    'quantityBase' => $qty,
                    'unitCost' => $unitCost,
                    'documentType' => 'purchase_invoice',
                    'documentNumber' => $invoiceNumber,
                    'performedById' => $user['id'],
                    'performedByName' => $user['name'],
                    'notes' => 'توريد مشتريات من المورد'
                ]);
            }

            jsonResponse(['success' => true, 'message' => 'تم استلام وتوريد فاتورة المشتريات وترحيل الأرصدة بنجاح']);
        }

        // ── 8. جلسات الجرد الفعلي ومطابقة الفروق Counts ──
        if ($subPath === 'counts') {
            if ($method === 'GET') {
                $rows = Database::query("
                    SELECT c.*, loc.name_ar as location_name
                    FROM public.inventory_counts c
                    LEFT JOIN public.inventory_locations loc ON loc.id = c.location_id
                    ORDER BY c.created_at DESC
                    LIMIT 50
                ");
                jsonResponse(['success' => true, 'counts' => $rows]);
            }
            if ($method === 'POST') {
                $locId = (string)($body['location_id'] ?? 'loc_central');
                $countType = (string)($body['count_type'] ?? 'full');
                $notes = (string)($body['notes'] ?? '');

                $countId = 'cnt_' . stockGenerateUuid();
                $countNumber = 'CNT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -4));

                Database::execute("
                    INSERT INTO public.inventory_counts (
                        id, count_number, location_id, count_type, status,
                        counted_by_id, counted_by_name, notes, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?, NOW(), NOW())
                ", [$countId, $countNumber, $locId, $countType, $user['id'], $user['name'], $notes]);

                // تجميد أرصدة الدفتر الحالية
                $bals = Database::query("
                    SELECT b.medication_id, b.batch_id, b.quantity_on_hand,
                           COALESCE(ib.cost_price, m.unit_price, 0) as unit_cost
                    FROM public.inventory_balances b
                    JOIN public.outstock_medications m ON m.id = b.medication_id
                    LEFT JOIN public.inventory_batches ib ON ib.id = b.batch_id
                    WHERE b.location_id = ?
                ", [$locId]);

                foreach ($bals as $b) {
                    Database::execute("
                        INSERT INTO public.inventory_count_items (
                            id, count_id, medication_id, batch_id, book_quantity,
                            actual_quantity, variance_quantity, unit_cost, variance_total_cost
                        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
                    ", [
                        'cnti_' . stockGenerateUuid(), $countId, $b['medication_id'],
                        $b['batch_id'], (float)$b['quantity_on_hand'], -(float)$b['quantity_on_hand'],
                        (float)$b['unit_cost'], -(float)$b['quantity_on_hand'] * (float)$b['unit_cost']
                    ]);
                }

                jsonResponse([
                    'success' => true,
                    'message' => 'تم فتح جلسة الجرد الفعلي بنجاح',
                    'count_id' => $countId,
                    'count_number' => $countNumber
                ]);
            }
        }

        // ── 9. الاستدعاء الدوائي وحجر التشغيلات Recalls ──
        if ($subPath === 'recalls/search' && $method === 'GET') {
            $q = trim((string)($_GET['query'] ?? ''));
            if (empty($q)) jsonResponse(['success' => true, 'results' => []]);

            $rows = Database::query("
                SELECT 
                    ib.id as batch_id, ib.batch_number, ib.expiry_date, ib.cost_price,
                    ib.public_price, ib.is_quarantined, m.id as medication_id,
                    m.trade_name_ar, m.trade_name_en, m.barcode, m.unit_type,
                    loc.id as location_id, loc.name_ar as location_name,
                    COALESCE(bal.quantity_on_hand, 0) as quantity_on_hand
                FROM public.inventory_batches ib
                JOIN public.outstock_medications m ON m.id = ib.medication_id
                LEFT JOIN public.inventory_balances bal ON bal.batch_id = ib.id
                LEFT JOIN public.inventory_locations loc ON loc.id = bal.location_id
                WHERE ib.batch_number ILIKE ? OR m.trade_name_ar ILIKE ? OR m.trade_name_en ILIKE ? OR m.barcode = ?
                ORDER BY ib.expiry_date ASC
            ", ["%$q%", "%$q%", "%$q%", $q]);

            $grouped = [];
            foreach ($rows as $r) {
                $bId = $r['batch_id'];
                if (!isset($grouped[$bId])) {
                    $grouped[$bId] = [
                        'batch_id' => $r['batch_id'],
                        'batch_number' => $r['batch_number'],
                        'expiry_date' => $r['expiry_date'],
                        'cost_price' => (float)$r['cost_price'],
                        'public_price' => (float)$r['public_price'],
                        'is_quarantined' => (bool)$r['is_quarantined'],
                        'medication_id' => $r['medication_id'],
                        'trade_name_ar' => $r['trade_name_ar'],
                        'trade_name_en' => $r['trade_name_en'],
                        'barcode' => $r['barcode'],
                        'total_quantity' => 0,
                        'locations' => []
                    ];
                }
                $qty = (float)$r['quantity_on_hand'];
                if (!empty($r['location_id'])) {
                    $grouped[$bId]['locations'][] = [
                        'location_id' => $r['location_id'],
                        'location_name' => $r['location_name'],
                        'quantity' => $qty
                    ];
                    $grouped[$bId]['total_quantity'] += $qty;
                }
            }

            jsonResponse(['success' => true, 'count' => count($grouped), 'results' => array_values($grouped)]);
        }

        if ($subPath === 'recalls/quarantine' && $method === 'POST') {
            $batchNumber = (string)($body['batchNumber'] ?? $body['batch_number'] ?? '');
            $batchId = (string)($body['batchId'] ?? $body['batch_id'] ?? '');
            Database::execute("
                UPDATE public.inventory_batches
                SET is_quarantined = true, updated_at = NOW()
                WHERE id = ? OR batch_number = ?
            ", [$batchId ?: 'none', $batchNumber ?: 'none']);

            jsonResponse(['success' => true, 'message' => "تم فرض الحجر الفوري على التشغيلة ومنع صرفها بكافة الفروع"]);
        }

        if ($subPath === 'recalls/unquarantine' && $method === 'POST') {
            $batchNumber = (string)($body['batchNumber'] ?? $body['batch_number'] ?? '');
            $batchId = (string)($body['batchId'] ?? $body['batch_id'] ?? '');
            Database::execute("
                UPDATE public.inventory_batches
                SET is_quarantined = false, updated_at = NOW()
                WHERE id = ? OR batch_number = ?
            ", [$batchId ?: 'none', $batchNumber ?: 'none']);

            jsonResponse(['success' => true, 'message' => "تم رفع الحجر عن التشغيلة وإعادتها للصرف"]);
        }

        // ── 10. محرك الذكاء لإعادة الطلب وتخطيط الاحتياجات Reorder ──
        if ($subPath === 'reorder/suggestions' && $method === 'GET') {
            $locId = $_GET['locationId'] ?? 'loc_central';
            $lookback = max(7, (int)($_GET['lookbackDays'] ?? 30));
            $leadTime = max(1, (int)($_GET['leadTimeDays'] ?? 7));

            $rows = Database::query("
                WITH current_stocks AS (
                    SELECT medication_id, COALESCE(SUM(quantity_on_hand), 0) as current_qty
                    FROM public.inventory_balances WHERE location_id = ? GROUP BY medication_id
                ),
                central_stocks AS (
                    SELECT medication_id, COALESCE(SUM(quantity_on_hand), 0) as central_qty
                    FROM public.inventory_balances WHERE location_id = 'loc_central' GROUP BY medication_id
                ),
                outflows AS (
                    SELECT medication_id, COALESCE(SUM(ABS(quantity_base)), 0) as total_consumed
                    FROM public.inventory_ledger
                    WHERE location_id = ? AND quantity_base < 0 AND created_at >= (NOW() - (? || ' days')::INTERVAL)
                    GROUP BY medication_id
                )
                SELECT 
                    m.id as medication_id, m.trade_name_ar, m.trade_name_en, m.barcode, m.unit_type,
                    m.unit_price as cost_price, m.public_price,
                    COALESCE(cs.current_qty, 0) as current_stock,
                    COALESCE(cent.central_qty, 0) as central_available_stock,
                    ROUND((COALESCE(o.total_consumed, 0) / ?::NUMERIC), 2) as daily_run_rate
                FROM public.outstock_medications m
                LEFT JOIN current_stocks cs ON cs.medication_id = m.id
                LEFT JOIN central_stocks cent ON cent.medication_id = m.id
                LEFT JOIN outflows o ON o.medication_id = m.id
                WHERE (COALESCE(cs.current_qty, 0) < 20 OR COALESCE(o.total_consumed, 0) > 0)
                ORDER BY CASE WHEN COALESCE(cs.current_qty, 0) <= 0 THEN 0 ELSE 1 END ASC
                LIMIT 100
            ", [$locId, $locId, $lookback, $lookback]);

            $items = [];
            foreach ($rows as $r) {
                $cur = (float)$r['current_stock'];
                $central = (float)$r['central_available_stock'];
                $rate = max(0.1, (float)$r['daily_run_rate']);
                $safety = (int)ceil($rate * 3);
                $rop = (int)ceil(($rate * $leadTime) + $safety);
                $suggested = (int)max(0, ceil(($rate * ($leadTime + 14)) + $safety) - $cur);

                $urgency = 'optimal';
                if ($cur <= 0 || ($cur / $rate) <= 2) $urgency = 'critical';
                elseif ($cur <= $rop) $urgency = 'warning';

                $items[] = [
                    'medication_id' => $r['medication_id'],
                    'trade_name_ar' => $r['trade_name_ar'],
                    'trade_name_en' => $r['trade_name_en'],
                    'barcode' => $r['barcode'],
                    'unit_type' => $r['unit_type'],
                    'cost_price' => (float)$r['cost_price'],
                    'public_price' => (float)$r['public_price'],
                    'current_stock' => $cur,
                    'central_available_stock' => $central,
                    'daily_run_rate' => $rate,
                    'days_of_stock_left' => $cur > 0 ? (int)round($cur / $rate) : 0,
                    'safety_stock' => $safety,
                    'reorder_point' => $rop,
                    'suggested_qty' => $suggested,
                    'urgency' => $urgency,
                    'recommended_source' => ($locId !== 'loc_central' && $central >= $suggested && $suggested > 0) ? 'central_transfer' : 'supplier_order',
                    'estimated_cost' => round($suggested * (float)$r['cost_price'], 2)
                ];
            }

            jsonResponse(['success' => true, 'totalSuggestions' => count($items), 'items' => $items]);
        }

        // ── 11. إعدام واستبعاد التوالف والهوالك Scrap ──
        if ($subPath === 'scrap' && $method === 'POST') {
            $locId = (string)($body['location_id'] ?? 'loc_central');
            $items = is_array($body['items'] ?? null) ? $body['items'] : [];
            $reason = (string)($body['reason'] ?? 'expired');
            $notes = (string)($body['notes'] ?? '');

            if (empty($items)) jsonResponse(['success' => false, 'error' => 'قائمة التوالف فارغة'], 400);
            $scrapDoc = 'SCRAP-' . strtoupper(substr(md5(uniqid()), 0, 8));

            foreach ($items as $it) {
                $qty = (float)($it['quantity'] ?? 0);
                if ($qty <= 0) continue;
                $cost = (float)($it['unit_cost'] ?? 0);

                // خروج من المستودع
                stockRecordLedgerMovement([
                    'idempotencyKey' => "scrap_out_{$scrapDoc}_{$it['medication_id']}",
                    'movementType' => 'scrap_expired',
                    'locationId' => $locId,
                    'medicationId' => $it['medication_id'],
                    'batchId' => $it['batch_id'] ?? null,
                    'quantityBase' => -$qty,
                    'unitCost' => $cost,
                    'documentType' => 'scrap_order',
                    'documentNumber' => $scrapDoc,
                    'performedById' => $user['id'],
                    'performedByName' => $user['name'],
                    'notes' => "إهلاك مخزني ($reason): $notes"
                ]);

                // قيد في الهوالك
                stockRecordLedgerMovement([
                    'idempotencyKey' => "scrap_in_{$scrapDoc}_{$it['medication_id']}",
                    'movementType' => 'scrap_expired',
                    'locationId' => 'loc_damaged',
                    'medicationId' => $it['medication_id'],
                    'batchId' => $it['batch_id'] ?? null,
                    'quantityBase' => $qty,
                    'unitCost' => $cost,
                    'documentType' => 'scrap_order',
                    'documentNumber' => $scrapDoc,
                    'performedById' => $user['id'],
                    'performedByName' => $user['name'],
                    'notes' => "استقبال بحساب الهوالك"
                ]);
            }

            jsonResponse(['success' => true, 'message' => "تم تسجيل إذن الهوالك #$scrapDoc وترحيل الأرصدة بنجاح"]);
        }

        // ── 12. مركز المرتجعات Returns ──
        if ($subPath === 'returns' && $method === 'POST') {
            $retType = (string)($body['return_type'] ?? 'branch_to_central');
            $srcLoc = (string)($body['source_location_id'] ?? '');
            $items = is_array($body['items'] ?? null) ? $body['items'] : [];
            $notes = (string)($body['notes'] ?? '');

            if (empty($srcLoc)) jsonResponse(['success' => false, 'error' => 'مستودع الإرجاع مطلوب'], 400);
            if (empty($items)) jsonResponse(['success' => false, 'error' => 'قائمة المرتجع فارغة'], 400);

            $retDoc = 'RET-' . strtoupper(substr(md5(uniqid()), 0, 8));

            if ($retType === 'branch_to_central') {
                $transferId = 'trf_ret_' . stockGenerateUuid();
                Database::execute("
                    INSERT INTO public.inventory_transfers (
                        id, transfer_number, transfer_type, source_location_id,
                        destination_location_id, in_transit_location_id, status,
                        requested_by_id, requested_by_name, total_requested_items,
                        notes, created_at, updated_at
                    ) VALUES (?, ?, 'branch_to_main', ?, 'loc_central', 'loc_in_transit', 'draft', ?, ?, ?, ?, NOW(), NOW())
                ", [$transferId, $retDoc, $srcLoc, $user['id'], $user['name'], count($items), "مرتجع إلى الرئيسي: $notes"]);

                foreach ($items as $it) {
                    Database::execute("
                        INSERT INTO public.inventory_transfer_items (
                            id, transfer_id, medication_id, batch_id, unit_type,
                            quantity_requested, quantity_approved, unit_cost, item_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                    ", [
                        'trfi_' . stockGenerateUuid(), $transferId, $it['medication_id'],
                        $it['batch_id'] ?? null, $it['unit_type'] ?? 'pack',
                        (float)$it['quantity'], (float)$it['quantity'], (float)($it['unit_cost'] ?? 0)
                    ]);
                }

                jsonResponse(['success' => true, 'message' => "تم إنشاء إذن مرتجع فرعي #$retDoc بنجاح"]);
            } else {
                foreach ($items as $it) {
                    $qty = (float)($it['quantity'] ?? 0);
                    if ($qty <= 0) continue;
                    stockRecordLedgerMovement([
                        'idempotencyKey' => "sup_ret_{$retDoc}_{$it['medication_id']}",
                        'movementType' => 'supplier_return',
                        'locationId' => $srcLoc,
                        'medicationId' => $it['medication_id'],
                        'batchId' => $it['batch_id'] ?? null,
                        'quantityBase' => -$qty,
                        'unitCost' => (float)($it['unit_cost'] ?? 0),
                        'documentType' => 'supplier_return_invoice',
                        'documentNumber' => $retDoc,
                        'performedById' => $user['id'],
                        'performedByName' => $user['name'],
                        'notes' => "مرتجع إلى المورد: $notes"
                    ]);
                }
                jsonResponse(['success' => true, 'message' => "تم تسجيل إذن مرتجع للمورد #$retDoc وخصم الكميات بنجاح"]);
            }
        }

        // ── 13. البحث في الأصناف Medications Search ──
        if ($subPath === 'medications/search' && $method === 'GET') {
            $q = trim((string)($_GET['q'] ?? ''));
            $locId = trim((string)($_GET['locationId'] ?? ''));

            $params = [];
            $where = ["1=1"];
            if (!empty($q)) {
                $where[] = "(m.trade_name_ar ILIKE ? OR m.trade_name_en ILIKE ? OR m.barcode = ?)";
                $params[] = "%$q%";
                $params[] = "%$q%";
                $params[] = $q;
            }

            $locJoin = "";
            if (!empty($locId)) {
                $locJoin = "AND bal.location_id = ?";
                $params[] = $locId;
            }

            $whereStr = implode(' AND ', $where);

            $rows = Database::query("
                SELECT 
                    m.id, m.trade_name_ar, m.trade_name_en, m.barcode, m.category,
                    m.unit_type, m.unit_price as cost_price, m.public_price,
                    COALESCE(SUM(bal.quantity_on_hand), 0) as available_qty
                FROM public.outstock_medications m
                LEFT JOIN public.inventory_balances bal ON bal.medication_id = m.id $locJoin
                WHERE $whereStr
                GROUP BY m.id
                ORDER BY m.trade_name_ar ASC
                LIMIT 50
            ", $params);

            jsonResponse(['success' => true, 'medications' => $rows]);
        }

        // مسار غير معروف
        jsonResponse(['success' => false, 'error' => "نقطة النهاية المطلوبة غير موجودة: /api/stock/$subPath"], 404);

    } catch (Throwable $e) {
        error_log('[Stock API Exception]: ' . $e->getMessage());
        jsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
    }
}
