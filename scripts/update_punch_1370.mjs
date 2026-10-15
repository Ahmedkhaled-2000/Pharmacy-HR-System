import { execSync } from 'child_process';

const sql = "UPDATE public.biometric_raw_punches SET action_type = 'check_out', raw_punch_state = 1, process_notes = 'انصراف وردية ليلية (تم تصحيح نوع الحركة إلى انصراف)' WHERE id = 1370 RETURNING id, device_user_pin, punch_time, raw_punch_state, action_type, process_notes;";

const b64 = Buffer.from(sql, 'utf8').toString('base64');

const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-postgres psql -U postgres -d postgres`;

console.log('Executing on VPS...');
const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
console.log(out);
