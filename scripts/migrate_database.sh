#!/bin/bash
set -e

NEW_HOST="admin@169.58.214.20"

echo "=== [1/5] Dumping Live PostgreSQL Database from Old VPS (Container hr-postgres) ==="
sudo docker exec hr-postgres pg_dump -U postgres -d postgres -Fc > /tmp/live_db_dump.dump
echo "Dump completed. Size: $(ls -lh /tmp/live_db_dump.dump | awk '{print $5}')"

echo "=== [2/5] Streaming Database Dump to New VPS ==="
scp /tmp/live_db_dump.dump $NEW_HOST:/home/admin/hr-system/database/live_db_dump.dump
rm -f /tmp/live_db_dump.dump

echo "=== [3/5] Starting PostgreSQL and Redis on New VPS ==="
ssh $NEW_HOST "cd /home/admin/hr-system && sudo docker compose up -d postgres redis"

echo "=== [4/5] Waiting for PostgreSQL to be Ready on New VPS ==="
ssh $NEW_HOST "
until sudo docker exec hr-postgres pg_isready -U postgres; do
    echo 'Waiting for postgres...'
    sleep 2
done
"

echo "=== [5/5] Restoring Database on New VPS ==="
ssh $NEW_HOST "
sudo docker cp /home/admin/hr-system/database/live_db_dump.dump hr-postgres:/tmp/live_db_dump.dump
sudo docker exec hr-postgres pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-acl /tmp/live_db_dump.dump || true
sudo docker exec hr-postgres rm -f /tmp/live_db_dump.dump
echo 'Verifying tables count on New VPS:'
sudo docker exec hr-postgres psql -U postgres -d postgres -c '\dt+'
"

echo "=== DATABASE MIGRATION COMPLETED SUCCESSFULLY ==="
