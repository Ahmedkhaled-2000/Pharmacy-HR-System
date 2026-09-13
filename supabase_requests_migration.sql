-- ==============================================================================
-- 🚀 سكريبت ترقية قاعدة بيانات Supabase (PostgreSQL)
-- منظومة إدارة ومزامنة الطلبات المتقدمة فائقة الخفة (Ultra-Low Quota Requests & Delta Sync)
-- ==============================================================================
-- التعليمات:
-- 1. افتح لوحة تحكم Supabase الخاصة بمشروعك (Dashboard -> SQL Editor).
-- 2. انسخ والصق هذا السكريبت بالكامل واضغط "RUN".
-- ==============================================================================

-- 1. جدول الطلبات العلائقي المركزي المنفصل
CREATE TABLE IF NOT EXISTS public.requests (
    id VARCHAR(100) PRIMARY KEY,
    idempotency_key VARCHAR(191) UNIQUE NOT NULL,
    request_type VARCHAR(100) NOT NULL,
    employee_id VARCHAR(100) NOT NULL,
    employee_name VARCHAR(255) NULL,
    employee_code VARCHAR(100) NULL,
    branch_id VARCHAR(100) NOT NULL,
    department_id VARCHAR(100) NULL,
    target_role VARCHAR(100) NOT NULL DEFAULT 'admin',
    priority VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    change_sequence BIGSERIAL UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    queued_at TIMESTAMPTZ NULL,
    sent_at TIMESTAMPTZ NULL,
    delivered_at TIMESTAMPTZ NULL,
    received_at TIMESTAMPTZ NULL,
    read_at TIMESTAMPTZ NULL,
    acknowledged_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    deleted_by VARCHAR(100) NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_emp ON public.requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_requests_branch ON public.requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_type ON public.requests(request_type);
CREATE INDEX IF NOT EXISTS idx_requests_priority ON public.requests(priority);
CREATE INDEX IF NOT EXISTS idx_requests_seq ON public.requests(change_sequence ASC);
CREATE INDEX IF NOT EXISTS idx_requests_created ON public.requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_idemp ON public.requests(idempotency_key);

-- 2. جدول تاريخ وتتبع حركات وحالات الطلب (Audit Trail & State Machine)
CREATE TABLE IF NOT EXISTS public.request_status_history (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    from_status VARCHAR(50) NULL,
    to_status VARCHAR(50) NOT NULL,
    actor_id VARCHAR(100) NOT NULL,
    actor_name VARCHAR(255) NULL,
    actor_role VARCHAR(100) NOT NULL,
    comment TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_req_hist_req ON public.request_status_history(request_id);

-- 3. جدول تأكيدات وإشعارات الاستلام والتسليم (Acknowledgements)
CREATE TABLE IF NOT EXISTS public.request_acknowledgements (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    ack_type VARCHAR(50) NOT NULL, -- 'DELIVERED', 'READ', 'ACKNOWLEDGED'
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_req_ack_req_user ON public.request_acknowledgements(request_id, user_id);

-- 4. جدول تتبع التغييرات التزايدية (Monotonic Delta Change Log)
CREATE TABLE IF NOT EXISTS public.change_log (
    sequence BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    branch_id VARCHAR(100) NULL,
    operation VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    delta_payload JSONB NULL,
    actor_id VARCHAR(100) NULL,
    correlation_id VARCHAR(191) NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_change_log_seq ON public.change_log(sequence ASC);
CREATE INDEX IF NOT EXISTS idx_change_log_branch_seq ON public.change_log(branch_id, sequence ASC);
CREATE INDEX IF NOT EXISTS idx_change_log_entity ON public.change_log(entity_type, entity_id);

-- 5. صندوق استلام السيرفر لمنع التكرار (Server Inbox & Deduplication)
CREATE TABLE IF NOT EXISTS public.server_inbox (
    id BIGSERIAL PRIMARY KEY,
    client_operation_id VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(191) UNIQUE NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PROCESSED',
    error_message TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_server_inbox_idemp ON public.server_inbox(idempotency_key);

-- 6. جدول حالة ومؤشر مزامنة الأجهزة (Sync State per Device)
CREATE TABLE IF NOT EXISTS public.sync_state (
    device_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    branch_id VARCHAR(100) NULL,
    last_server_cursor BIGINT NOT NULL DEFAULT 0,
    last_successful_sync TIMESTAMPTZ NULL,
    last_attempted_sync TIMESTAMPTZ NULL,
    sync_status VARCHAR(30) NOT NULL DEFAULT 'IDLE',
    error_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, user_id)
);

-- 7. صندوق العمليات الميتة (Dead Letter Queue)
CREATE TABLE IF NOT EXISTS public.dead_letter_operations (
    id BIGSERIAL PRIMARY KEY,
    idempotency_key VARCHAR(191) UNIQUE NOT NULL,
    device_id VARCHAR(100) NULL,
    branch_id VARCHAR(100) NULL,
    operation_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    error_code VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    first_attempt_at TIMESTAMPTZ NOT NULL,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolution_notes TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_dlq_resolved ON public.dead_letter_operations(resolved);

-- ضمان توافق حجم الأعمدة مع المعرفات التاريخية الطويلة في حال وجود الجداول مسبقاً
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'requests' AND column_name = 'id') THEN
        ALTER TABLE public.requests ALTER COLUMN id TYPE VARCHAR(100);
        ALTER TABLE public.requests ALTER COLUMN idempotency_key TYPE VARCHAR(191);
        ALTER TABLE public.requests ALTER COLUMN request_type TYPE VARCHAR(100);
        ALTER TABLE public.requests ALTER COLUMN employee_code TYPE VARCHAR(100);
        ALTER TABLE public.requests ALTER COLUMN branch_id TYPE VARCHAR(100);
        ALTER TABLE public.requests ALTER COLUMN department_id TYPE VARCHAR(100);
        ALTER TABLE public.requests ALTER COLUMN target_role TYPE VARCHAR(100);
        ALTER TABLE public.requests ALTER COLUMN priority TYPE VARCHAR(50);
        ALTER TABLE public.requests ALTER COLUMN status TYPE VARCHAR(50);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'request_status_history' AND column_name = 'request_id') THEN
        ALTER TABLE public.request_status_history ALTER COLUMN request_id TYPE VARCHAR(100);
        ALTER TABLE public.request_status_history ALTER COLUMN from_status TYPE VARCHAR(50);
        ALTER TABLE public.request_status_history ALTER COLUMN to_status TYPE VARCHAR(50);
        ALTER TABLE public.request_status_history ALTER COLUMN actor_role TYPE VARCHAR(100);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'request_acknowledgements' AND column_name = 'request_id') THEN
        ALTER TABLE public.request_acknowledgements ALTER COLUMN request_id TYPE VARCHAR(100);
        ALTER TABLE public.request_acknowledgements ALTER COLUMN ack_type TYPE VARCHAR(50);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'change_log' AND column_name = 'correlation_id') THEN
        ALTER TABLE public.change_log ALTER COLUMN correlation_id TYPE VARCHAR(191);
        ALTER TABLE public.change_log ALTER COLUMN branch_id TYPE VARCHAR(100);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'server_inbox' AND column_name = 'idempotency_key') THEN
        ALTER TABLE public.server_inbox ALTER COLUMN idempotency_key TYPE VARCHAR(191);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dead_letter_operations' AND column_name = 'idempotency_key') THEN
        ALTER TABLE public.dead_letter_operations ALTER COLUMN idempotency_key TYPE VARCHAR(191);
    END IF;
END $$;

-- 8. Trigger آلي لتسجيل التغييرات في جدول change_log تلقائياً
CREATE OR REPLACE FUNCTION public.fn_log_request_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.change_log (
            entity_type, entity_id, branch_id, operation, delta_payload, correlation_id, timestamp
        ) VALUES (
            'request', NEW.id, NEW.branch_id, 'INSERT', NEW.payload, NEW.idempotency_key, CURRENT_TIMESTAMP
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.change_log (
            entity_type, entity_id, branch_id, operation, delta_payload, correlation_id, timestamp
        ) VALUES (
            'request', NEW.id, NEW.branch_id, 'UPDATE', NEW.payload, NEW.idempotency_key, CURRENT_TIMESTAMP
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.change_log (
            entity_type, entity_id, branch_id, operation, delta_payload, correlation_id, timestamp
        ) VALUES (
            'request', OLD.id, OLD.branch_id, 'DELETE', jsonb_build_object('id', OLD.id, 'status', 'deleted'), OLD.idempotency_key, CURRENT_TIMESTAMP
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_requests_changelog ON public.requests;
CREATE TRIGGER trg_requests_changelog
AFTER INSERT OR UPDATE OR DELETE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.fn_log_request_changes();

-- 9. دالة ترحيل واستخراج الطلبات التاريخية من JSON القديم إلى الجدول العلائقي الجديد
CREATE OR REPLACE FUNCTION public.migrate_legacy_requests_from_app_settings()
RETURNS INTEGER AS $$
DECLARE
    state_json JSONB := NULL;
    req_item JSONB;
    inserted_count INTEGER := 0;
    req_id VARCHAR(100);
    req_idemp VARCHAR(191);
    col_name TEXT;
BEGIN
    -- فحص اسم العمود الفعلي في جدول app_settings ديناميكياً لتجنب خطأ 42703 (سواء كان key_name أو key)
    BEGIN
        SELECT column_name INTO col_name
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'app_settings' 
          AND column_name IN ('key_name', 'key')
        ORDER BY CASE WHEN column_name = 'key_name' THEN 1 ELSE 2 END
        LIMIT 1;

        IF col_name IS NOT NULL THEN
            EXECUTE format('SELECT value_data FROM public.app_settings WHERE %I = ''pharmacy-tracker-data'' LIMIT 1', col_name)
            INTO state_json;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        state_json := NULL;
    END;

    IF state_json IS NULL OR NOT (state_json ? 'requests') THEN
        RETURN 0;
    END IF;

    FOR req_item IN SELECT jsonb_array_elements(state_json->'requests')
    LOOP
        BEGIN
            req_id := SUBSTRING(COALESCE(req_item->>'id', gen_random_uuid()::text) FROM 1 FOR 100);
            req_idemp := SUBSTRING(COALESCE(req_item->>'idempotency_key', 'legacy_' || req_id) FROM 1 FOR 191);

            INSERT INTO public.requests (
                id,
                idempotency_key,
                request_type,
                employee_id,
                employee_name,
                employee_code,
                branch_id,
                department_id,
                target_role,
                priority,
                status,
                payload,
                created_at,
                updated_at
            ) VALUES (
                req_id,
                req_idemp,
                SUBSTRING(COALESCE(req_item->>'type', req_item->>'requestType', 'general') FROM 1 FOR 100),
                SUBSTRING(COALESCE(req_item->>'employeeId', req_item->>'empId', 'unknown') FROM 1 FOR 100),
                SUBSTRING(req_item->>'employeeName' FROM 1 FOR 255),
                SUBSTRING(req_item->>'employeeCode' FROM 1 FOR 100),
                SUBSTRING(COALESCE(req_item->>'branchId', 'BR01') FROM 1 FOR 100),
                SUBSTRING(req_item->>'departmentId' FROM 1 FOR 100),
                SUBSTRING(COALESCE(req_item->>'targetRole', 'admin') FROM 1 FOR 100),
                SUBSTRING(COALESCE(req_item->>'priority', 'NORMAL') FROM 1 FOR 50),
                SUBSTRING(COALESCE(req_item->>'status', 'PENDING') FROM 1 FOR 50),
                req_item,
                COALESCE((req_item->>'createdAt')::timestamptz, CURRENT_TIMESTAMP),
                COALESCE((req_item->>'updatedAt')::timestamptz, CURRENT_TIMESTAMP)
            )
            ON CONFLICT (idempotency_key) DO NOTHING;

            IF FOUND THEN
                inserted_count := inserted_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- تجاهل أي صف تالف فردي والاستمرار في ترحيل باقي الطلبات
            NULL;
        END;
    END LOOP;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- 10. تفعيل صلاحيات وسياسات الأمان RLS
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_operations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
    new_tables text[] := ARRAY[
        'requests', 'request_status_history', 'request_acknowledgements', 
        'change_log', 'server_inbox', 'sync_state', 'dead_letter_operations'
    ];
BEGIN
    FOREACH tbl IN ARRAY new_tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow Authenticated Access" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Allow Authenticated Access" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl);
    END LOOP;
END $$;

-- 11. تشغيل ترحيل الطلبات السابقة المخزنة في النظام
SELECT public.migrate_legacy_requests_from_app_settings() AS migrated_requests_count;
