/**
 * supabaseClient.js (Legacy Adapter)
 * يوجه الاستدعاءات إلى apiClient.js للعمل مع MariaDB و PHP Backend
 */

export {
  STORAGE_KEY,
  WORK_DAYS_PER_MONTH,
  WORK_HOURS_PER_DAY,
  API_BASE_URL,
  apiFetchSettings,
  apiSaveSettings,
  apiFetchVersion,
  apiFetchFaces,
  apiSaveFace,
  apiDeleteFace,
  apiExportBackup,
  apiImportBackup,
  apiHealthCheck,
} from './apiClient';

import {
  apiFetchSettings,
  apiSaveSettings,
  apiFetchFaces,
  apiSaveFace,
  apiDeleteFace,
} from './apiClient';

/**
 * محاكي خفيف لكائن db للتوافق الكامل مع أي كود قديم
 */
export const db = {
  from(table) {
    return {
      select(columns = '*') {
        return {
          eq(column, value) {
            return {
              async single() {
                try {
                  if (table === 'app_settings') {
                    const data = await apiFetchSettings(value);
                    return { data: { value: data }, error: null };
                  }
                  if (table === 'employee_faces') {
                    const face = await apiFetchFaces(value);
                    return { data: face, error: null };
                  }
                  return { data: null, error: null };
                } catch (err) {
                  return { data: null, error: err };
                }
              },
              async maybeSingle() {
                try {
                  if (table === 'app_settings') {
                    const data = await apiFetchSettings(value);
                    return { data: { value: data }, error: null };
                  }
                  return { data: null, error: null };
                } catch (err) {
                  return { data: null, error: err };
                }
              },
            };
          },
          async then(resolve) {
            try {
              if (table === 'employee_faces') {
                const data = await apiFetchFaces();
                resolve({ data, error: null });
              } else {
                resolve({ data: [], error: null });
              }
            } catch (err) {
              resolve({ data: null, error: err });
            }
          },
        };
      },
      async upsert(payload) {
        try {
          if (table === 'app_settings') {
            await apiSaveSettings(payload.key, payload.value);
            return { data: payload, error: null };
          }
          if (table === 'employee_faces') {
            await apiSaveFace(payload.employee_id, payload);
            return { data: payload, error: null };
          }
          return { data: payload, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      },
      delete() {
        return {
          eq(column, value) {
            return (async () => {
              try {
                if (table === 'employee_faces') {
                  await apiDeleteFace(value);
                }
                return { error: null };
              } catch (err) {
                return { error: err };
              }
            })();
          },
        };
      },
    };
  },
  channel() {
    return {
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    };
  },
  removeChannel() {
    // No-op for MariaDB HTTP polling
  },
};
