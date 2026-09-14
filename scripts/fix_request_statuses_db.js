import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const client = new pg.Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000
});

async function run() {
  await client.connect();
  console.log('Connected to Supabase PostgreSQL.');

  // 1. تحديث دالة التريجر لضمان تحديث payload متزامناً مع status
  console.log('Updating fn_log_request_changes trigger function...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.fn_log_request_changes()
    RETURNS TRIGGER AS $$
    DECLARE
        effective_payload jsonb;
        clean_status text;
    BEGIN
        clean_status := LOWER(TRIM(COALESCE(NEW.status, 'pending')));
        effective_payload := COALESCE(NEW.payload, '{}'::jsonb);
        effective_payload := jsonb_set(effective_payload, '{status}', to_jsonb(clean_status));
        
        IF UPPER(NEW.status) IN ('APPROVED', 'PAID', 'PARTIAL') THEN
            effective_payload := jsonb_set(effective_payload, '{adminApproved}', 'true'::jsonb);
        ELSIF UPPER(NEW.status) = 'REJECTED' THEN
            effective_payload := jsonb_set(effective_payload, '{adminApproved}', 'false'::jsonb);
        END IF;
        
        NEW.payload := effective_payload;

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
  `);
  console.log('Trigger function updated successfully.');

  // 2. مزامنة وتصحيح جدول public.requests مع app_settings.requests
  console.log('Syncing public.requests table with app_settings.requests...');
  const stateRes = await client.query("SELECT value_data FROM public.app_settings WHERE key_name = 'pharmacy-tracker-data' LIMIT 1");
  if (stateRes.rows.length > 0) {
    const state = stateRes.rows[0].value_data;
    const requests = Array.isArray(state.requests) ? state.requests : [];
    console.log(`Found ${requests.length} requests in app_settings.`);

    let updatedCount = 0;
    for (const r of requests) {
      if (!r || !r.id) continue;
      const reqId = String(r.id);
      const status = String(r.status || 'pending').toUpperCase();
      const payloadStr = JSON.stringify(r);

      const updateRes = await client.query(`
        UPDATE public.requests
        SET status = $1::character varying,
            payload = $2::jsonb,
            completed_at = CASE WHEN $1::character varying IN ('APPROVED', 'REJECTED', 'COMPLETED') THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
            updated_at = NOW()
        WHERE id = $3::character varying
      `, [status, payloadStr, reqId]);

      if (updateRes.rowCount > 0) {
        updatedCount++;
      } else {
        // إدراج الطلب إن لم يكن موجوداً
        await client.query(`
          INSERT INTO public.requests (
            id, idempotency_key, request_type, employee_id, employee_name, employee_code,
            branch_id, department_id, target_role, priority, status, payload,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12::jsonb,
            COALESCE(($13)::timestamptz, NOW()), NOW()
          )
          ON CONFLICT (id) DO UPDATE
          SET status = EXCLUDED.status, payload = EXCLUDED.payload, updated_at = NOW()
        `, [
          reqId,
          r.idempotency_key || `sync_${reqId}`,
          r.type || r.requestType || 'general',
          r.employeeId || r.empId || 'unknown',
          r.employeeName || '',
          r.employeeCode || '',
          r.branchId || 'BR01',
          r.departmentId || null,
          r.targetRole || 'admin',
          (r.priority || 'NORMAL').toUpperCase(),
          status,
          payloadStr,
          r.createdAt || null
        ]);
        updatedCount++;
      }
    }
    console.log(`Synchronized ${updatedCount} requests in public.requests table.`);
  }

  // 3. التحقق من الحالات بعد المزامنة
  const verify = await client.query("SELECT status, count(*) FROM public.requests GROUP BY status");
  console.log('\nStatus counts in public.requests:');
  console.table(verify.rows);

  await client.end();
  console.log('Database repair completed successfully.');
}

run().catch(console.error);
