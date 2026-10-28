#!/bin/bash
set -e

LOCKFILE="/tmp/mirror_db.lock"
exec 200>"$LOCKFILE"
flock -n 200 || { echo "[$(date)] Mirror script is already running. Skipping."; exit 0; }

OLD_HOST="ubuntu@63.183.147.199"
TEMP_DUMP="/tmp/mirror_sync.dump"

# 1. Dump current live database from hr-postgres on New VPS
sudo docker exec hr-postgres pg_dump -U postgres -d postgres -Fc > "$TEMP_DUMP"

# 2. Stream dump to Old VPS
scp -o StrictHostKeyChecking=no "$TEMP_DUMP" $OLD_HOST:/tmp/mirror_sync.dump
rm -f "$TEMP_DUMP"

# 3. Restore dump into hr-postgres container on Old VPS
ssh -o StrictHostKeyChecking=no $OLD_HOST "
sudo docker cp /tmp/mirror_sync.dump hr-postgres:/tmp/mirror_sync.dump
sudo docker exec hr-postgres pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-acl /tmp/mirror_sync.dump || true
sudo docker exec hr-postgres rm -f /tmp/mirror_sync.dump
rm -f /tmp/mirror_sync.dump
"
echo "[$(date)] Database mirrored to Old VPS successfully."
