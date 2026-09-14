<?php
/**
 * api/sync_api.php
 * وحدة محرك المزامنة التزايدية والذرية فائقة الخفة (Ultra-Low Quota Delta Sync & Outbox Processor)
 * تدعم:
 * 1. معالجة دفعات الـ Outbox مع مفاتيح عدم التكرار (Idempotent Batch Push)
 * 2. الجلب التزايدي الذكي المعتمد على المتسلسلة (Monotonic Delta Pull)
 * 3. إدارة دورة حياة وتأكيدات استلام الطلبات (Request Lifecycle & Acknowledgements)
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

function handleSyncPush(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        jsonResponse(['success' => false, 'error' => 'Method not allowed'], 405);
    }

    $clientIp = getClientIp();
    $retryAfter = null;
    if (!checkRateLimit('sync_push_' . $clientIp, 120, 60, $retryAfter)) {
        http_response_code(429);
        header("Retry-After: {$retryAfter}");
        jsonResponse(['success' => false, 'error' => "معدل المزامنة مرتفع جداً. يرجى الانتظار {$retryAfter} ثانية."], 429);
    }

    $payload = getRequestData();
    $deviceId = trim((string)($payload['device_id'] ?? 'device_unknown'));
    $userId = trim((string)($payload['user_id'] ?? 'user_unknown'));
    $branchId = trim((string)($payload['branch_id'] ?? ''));
    $operations = $payload['operations'] ?? [];

    if (!is_array($operations)) {
        jsonResponse(['success' => false, 'error' => 'Invalid operations payload: array expected'], 400);
    }

    $driver = Database::getDriver();
    $acks = [];
    $conflicts = [];
    $maxSequence = 0;

    // الحصول على أحدث تسلسل حالي
    try {
        $seqRow = Database::queryOne("SELECT MAX(sequence) as max_seq FROM change_log");
        $maxSequence = (int)($seqRow['max_seq'] ?? 0);
    } catch (Throwable) {}

    foreach ($operations as $op) {
        if (!is_array($op)) continue;

        $opId = trim((string)($op['operation_id'] ?? $op['id'] ?? ''));
        $idempKey = trim((string)($op['idempotency_key'] ?? ''));
        $opType = strtoupper(trim((string)($op['type'] ?? '')));
        $opPayload = is_array($op['payload'] ?? null) ? $op['payload'] : [];

        if (empty($idempKey)) {
            $idempKey = !empty($opId) ? 'op_' . $opId : 'idemp_' . bin2hex(random_bytes(16));
        }

        // 1. فحص عدم التكرار (Idempotency Check)
        try {
            $existingInbox = Database::queryOne(
                "SELECT id, status, processed_at FROM server_inbox WHERE idempotency_key = ? LIMIT 1",
                [$idempKey]
            );

            if ($existingInbox) {
                // العملية تم تنفيذها مسبقاً، نعيد تأكيد فوري دون إعادة التنفيذ
                $acks[] = [
                    'operation_id' => $opId,
                    'idempotency_key' => $idempKey,
                    'status' => $existingInbox['status'] ?? 'PROCESSED',
                    'replayed' => true,
                    'processed_at' => $existingInbox['processed_at']
                ];
                continue;
            }
        } catch (Throwable $e) {
            error_log('[Sync Inbox Check Error]: ' . $e->getMessage());
        }

        // 2. تنفيذ العملية الذرية حسب النوع
        $opSuccess = false;
        $entityId = null;
        $serverSeq = 0;

        try {
            if ($opType === 'CREATE_REQUEST' || $opType === 'SUBMIT_REQUEST') {
                $reqData = $opPayload['request'] ?? $opPayload;
                $reqId = trim((string)($reqData['id'] ?? ''));
                if (empty($reqId)) $reqId = 'req_' . bin2hex(random_bytes(8));
                $entityId = $reqId;

                $reqType = (string)($reqData['request_type'] ?? $reqData['type'] ?? 'general');
                $empId = (string)($reqData['employee_id'] ?? $reqData['empId'] ?? $userId);
                $empName = (string)($reqData['employee_name'] ?? $reqData['empName'] ?? '');
                $empCode = (string)($reqData['employee_code'] ?? $reqData['empCode'] ?? '');
                $bId = (string)($reqData['branch_id'] ?? $branchId ?: 'BR01');
                $deptId = (string)($reqData['department_id'] ?? '');
                $targetRole = (string)($reqData['target_role'] ?? $reqData['targetRole'] ?? 'admin');
                $priority = strtoupper((string)($reqData['priority'] ?? 'NORMAL'));
                $status = strtoupper((string)($reqData['status'] ?? 'PENDING'));
                $reqJson = json_encode($reqData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

                // إدراج الطلب
                if ($driver === 'pgsql') {
                    $insertSql = "
                        INSERT INTO public.requests (
                            id, idempotency_key, request_type, employee_id, employee_name, employee_code,
                            branch_id, department_id, target_role, priority, status, payload,
                            queued_at, sent_at, delivered_at, created_at, updated_at
                        ) VALUES (
                            ?, ?, ?, ?, ?, ?,
                            ?, ?, ?, ?, ?, ?::jsonb,
                            NOW(), NOW(), NOW(), NOW(), NOW()
                        )
                        ON CONFLICT (idempotency_key) DO UPDATE
                        SET updated_at = NOW()
                        RETURNING change_sequence;
                    ";
                    $r = Database::queryOne($insertSql, [
                        $reqId, $idempKey, $reqType, $empId, $empName, $empCode,
                        $bId, $deptId, $targetRole, $priority, $status, $reqJson
                    ]);
                    $serverSeq = (int)($r['change_sequence'] ?? 0);
                } else {
                    $insertSql = "
                        INSERT OR REPLACE INTO requests (
                            id, idempotency_key, request_type, employee_id, employee_name, employee_code,
                            branch_id, department_id, target_role, priority, status, payload,
                            queued_at, sent_at, delivered_at, created_at, updated_at
                        ) VALUES (
                            ?, ?, ?, ?, ?, ?,
                            ?, ?, ?, ?, ?, ?,
                            datetime('now'), datetime('now'), datetime('now'), datetime('now'), datetime('now')
                        );
                    ";
                    Database::execute($insertSql, [
                        $reqId, $idempKey, $reqType, $empId, $empName, $empCode,
                        $bId, $deptId, $targetRole, $priority, $status, $reqJson
                    ]);
                }

                // تسجيل حركة الحالة الابتدائية في request_status_history
                try {
                    Database::execute("
                        INSERT INTO request_status_history (request_id, from_status, to_status, actor_id, actor_name, actor_role, comment)
                        VALUES (?, NULL, ?, ?, ?, 'system', 'تم إنشاء الطلب بنجاح عبر صندوق الإرسال')
                    ", [$reqId, $status, $userId, $empName]);
                } catch (Throwable) {}

                // تسجيل في change_log فقط للمشغلات البديلة (في PostgreSQL يوجد Trigger تلقائي trg_requests_changelog)
                if ($driver !== 'pgsql') {
                    try {
                        $clRes = Database::execute("
                            INSERT INTO change_log (entity_type, entity_id, branch_id, operation, delta_payload)
                            VALUES ('request', ?, ?, 'INSERT', ?)
                        ", [$reqId, $bId, $reqJson]);
                        if ($clRes['insert_id'] > 0) $serverSeq = $clRes['insert_id'];
                    } catch (Throwable) {}
                }

                $opSuccess = true;

            } elseif ($opType === 'UPDATE_STATUS' || $opType === 'APPROVE_REQUEST' || $opType === 'REJECT_REQUEST') {
                $reqId = trim((string)($opPayload['request_id'] ?? $opPayload['id'] ?? ''));
                $newStatus = strtoupper(trim((string)($opPayload['status'] ?? ($opType === 'APPROVE_REQUEST' ? 'APPROVED' : 'REJECTED'))));
                $comment = trim((string)($opPayload['comment'] ?? ''));
                $actorRole = trim((string)($opPayload['actor_role'] ?? 'admin'));
                $actorName = trim((string)($opPayload['actor_name'] ?? 'الإدارة'));
                $entityId = $reqId;

                if (!empty($reqId)) {
                    $currentReq = Database::queryOne("SELECT status, branch_id, payload FROM requests WHERE id = ? LIMIT 1", [$reqId]);
                    $fromStatus = $currentReq['status'] ?? 'PENDING';
                    $bId = $currentReq['branch_id'] ?? $branchId;

                    Database::execute("
                        UPDATE requests 
                        SET status = ?, 
                            completed_at = CASE WHEN ? IN ('APPROVED', 'REJECTED', 'COMPLETED') THEN CURRENT_TIMESTAMP ELSE completed_at END,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ", [$newStatus, $newStatus, $reqId]);

                    Database::execute("
                        INSERT INTO request_status_history (request_id, from_status, to_status, actor_id, actor_name, actor_role, comment)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ", [$reqId, $fromStatus, $newStatus, $userId, $actorName, $actorRole, $comment]);

                    $deltaJson = json_encode(['id' => $reqId, 'status' => $newStatus, 'updated_at' => date('Y-m-d H:i:s')], JSON_UNESCAPED_UNICODE);
                    $clRes = Database::execute("
                        INSERT INTO change_log (entity_type, entity_id, branch_id, operation, delta_payload)
                        VALUES ('request', ?, ?, 'UPDATE', ?)
                    ", [$reqId, $bId, $deltaJson]);
                    if ($clRes['insert_id'] > 0) $serverSeq = $clRes['insert_id'];

                    $opSuccess = true;
                }

            } elseif ($opType === 'ACKNOWLEDGE_REQUEST' || $opType === 'READ_REQUEST') {
                $reqId = trim((string)($opPayload['request_id'] ?? $opPayload['id'] ?? ''));
                $ackType = strtoupper(trim((string)($opPayload['ack_type'] ?? ($opType === 'READ_REQUEST' ? 'READ' : 'ACKNOWLEDGED'))));
                $entityId = $reqId;

                if (!empty($reqId)) {
                    Database::execute("
                        INSERT INTO request_acknowledgements (request_id, user_id, device_id, ack_type)
                        VALUES (?, ?, ?, ?)
                    ", [$reqId, $userId, $deviceId, $ackType]);

                    if ($ackType === 'READ') {
                        Database::execute("UPDATE requests SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND read_at IS NULL", [$reqId]);
                    } elseif ($ackType === 'ACKNOWLEDGED') {
                        Database::execute("UPDATE requests SET acknowledged_at = CURRENT_TIMESTAMP WHERE id = ? AND acknowledged_at IS NULL", [$reqId]);
                    }
                    $opSuccess = true;
                }
            } else {
                // عملية عامة يتم تسجيلها بالـ inbox
                $opSuccess = true;
            }

            // 3. تسجيل في server_inbox لمنع أي تكرار مستقبلي
            if ($opSuccess) {
                Database::execute("
                    INSERT INTO server_inbox (client_operation_id, idempotency_key, device_id, user_id, operation_type, payload, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'PROCESSED')
                ", [
                    $opId, $idempKey, $deviceId, $userId, $opType,
                    json_encode($opPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                ]);

                $acks[] = [
                    'operation_id' => $opId,
                    'idempotency_key' => $idempKey,
                    'entity_id' => $entityId,
                    'status' => 'PROCESSED',
                    'server_sequence' => $serverSeq > 0 ? $serverSeq : $maxSequence
                ];
                if ($serverSeq > $maxSequence) $maxSequence = $serverSeq;
            }

        } catch (Throwable $e) {
            error_log("[Sync Op Failed] {$opType}: " . $e->getMessage());
            try {
                Database::execute("
                    INSERT INTO dead_letter_operations (operation_id, device_id, user_id, operation_type, payload, last_error)
                    VALUES (?, ?, ?, ?, ?, ?)
                ", [
                    $opId, $deviceId, $userId, $opType,
                    json_encode($opPayload, JSON_UNESCAPED_UNICODE),
                    $e->getMessage()
                ]);
            } catch (Throwable) {}

            $conflicts[] = [
                'operation_id' => $opId,
                'idempotency_key' => $idempKey,
                'status' => 'FAILED',
                'error' => $e->getMessage()
            ];
        }
    }

    // تحديث مؤشر sync_state للجهاز
    try {
        if ($driver === 'pgsql') {
            Database::execute("
                INSERT INTO sync_state (device_id, user_id, branch_id, last_server_cursor, last_successful_sync, sync_status, updated_at)
                VALUES (?, ?, ?, ?, NOW(), 'IDLE', NOW())
                ON CONFLICT (device_id, user_id) DO UPDATE
                SET last_server_cursor = GREATEST(sync_state.last_server_cursor, EXCLUDED.last_server_cursor),
                    last_successful_sync = NOW(),
                    sync_status = 'IDLE',
                    updated_at = NOW();
            ", [$deviceId, $userId, $branchId, $maxSequence]);
        } else {
            Database::execute("
                INSERT OR REPLACE INTO sync_state (device_id, user_id, branch_id, last_server_cursor, last_successful_sync, sync_status, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'), 'IDLE', datetime('now'));
            ", [$deviceId, $userId, $branchId, $maxSequence]);
        }
    } catch (Throwable) {}

    // إبطال الكاش الدقيق فورياً عند معالجة أي عمليات لضمان اتساق البيانات
    if (count($acks) > 0 && class_exists('MicroCache')) {
        try {
            MicroCache::invalidate('settings_' . DEFAULT_STORAGE_KEY);
            MicroCache::invalidate('version_' . DEFAULT_STORAGE_KEY);
        } catch (Throwable) {}
    }

    jsonResponse([
        'success' => true,
        'message' => 'تم استلام ومعالجة دفعة العمليات بنجاح وبأمان تام',
        'processed_count' => count($acks),
        'failed_count' => count($conflicts),
        'acks' => $acks,
        'conflicts' => $conflicts,
        'latest_cursor' => $maxSequence
    ]);
}

function handleSyncDelta(): void
{
    $sinceSeq = (int)($_GET['since_sequence'] ?? $_GET['cursor'] ?? 0);
    $branchId = trim((string)($_GET['branch_id'] ?? ''));
    $limit = min(200, max(1, (int)($_GET['limit'] ?? 100)));

    $changes = [];
    $newCursor = $sinceSeq;

    try {
        if (!empty($branchId)) {
            $sql = "
                SELECT sequence, entity_type, entity_id, branch_id, operation, delta_payload, timestamp
                FROM change_log
                WHERE sequence > ? AND (branch_id = ? OR branch_id IS NULL OR branch_id = '')
                ORDER BY sequence ASC
                LIMIT ?
            ";
            $rows = Database::query($sql, [$sinceSeq, $branchId, $limit]);
        } else {
            $sql = "
                SELECT sequence, entity_type, entity_id, branch_id, operation, delta_payload, timestamp
                FROM change_log
                WHERE sequence > ?
                ORDER BY sequence ASC
                LIMIT ?
            ";
            $rows = Database::query($sql, [$sinceSeq, $limit]);
        }

        foreach ($rows as $r) {
            $payload = $r['delta_payload'] ?? null;
            if (is_string($payload)) {
                $payload = json_decode($payload, true) ?: $payload;
            }
            $seq = (int)($r['sequence'] ?? 0);
            if ($seq > $newCursor) $newCursor = $seq;

            $changes[] = [
                'sequence' => $seq,
                'entity_type' => $r['entity_type'],
                'entity_id' => $r['entity_id'],
                'branch_id' => $r['branch_id'],
                'operation' => $r['operation'],
                'data' => $payload,
                'payload' => $payload,
                'timestamp' => $r['timestamp']
            ];
        }

        // إذا لم توجد تغييرات في change_log وكان الطلب على جدول requests مباشرة
        if (empty($changes) && $sinceSeq === 0) {
            $reqSql = !empty($branchId) 
                ? "SELECT * FROM requests WHERE branch_id = ? ORDER BY change_sequence ASC LIMIT ?"
                : "SELECT * FROM requests ORDER BY change_sequence ASC LIMIT ?";
            $params = !empty($branchId) ? [$branchId, $limit] : [$limit];
            $reqRows = Database::query($reqSql, $params);

            foreach ($reqRows as $rr) {
                $seq = (int)($rr['change_sequence'] ?? 0);
                if ($seq > $newCursor) $newCursor = $seq;
                $payload = $rr['payload'] ?? null;
                if (is_string($payload)) $payload = json_decode($payload, true) ?: $payload;

                $reqItem = [
                    'id' => $rr['id'],
                    'request_type' => $rr['request_type'],
                    'employee_id' => $rr['employee_id'],
                    'employee_name' => $rr['employee_name'],
                    'employee_code' => $rr['employee_code'],
                    'branch_id' => $rr['branch_id'],
                    'priority' => $rr['priority'],
                    'status' => $rr['status'],
                    'payload' => $payload,
                    'created_at' => $rr['created_at'],
                    'updated_at' => $rr['updated_at']
                ];

                $changes[] = [
                    'sequence' => $seq,
                    'entity_type' => 'request',
                    'entity_id' => $rr['id'],
                    'branch_id' => $rr['branch_id'],
                    'operation' => 'INSERT',
                    'data' => $reqItem,
                    'payload' => $reqItem,
                    'timestamp' => $rr['updated_at'] ?? $rr['created_at']
                ];
            }
        }

    } catch (Throwable $e) {
        error_log('[Sync Delta Error]: ' . $e->getMessage());
        jsonResponse([
            'success' => false,
            'error' => 'تعذر جلب التحديثات التزايدية. يرجى مراجعة سجلات الخادم.'
        ], 500);
    }

    jsonResponse([
        'success' => true,
        'cursor' => $newCursor,
        'latest_cursor' => $newCursor,
        'latest_sequence' => $newCursor,
        'count' => count($changes),
        'changes' => $changes,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
}
