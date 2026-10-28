#!/bin/bash
set -e
BACKUP_DIR="/home/admin/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/postgres_backup_$TIMESTAMP.dump"

sudo docker exec hr-postgres pg_dump -U postgres -d postgres -Fc > "$BACKUP_FILE"
find "$BACKUP_DIR" -type f -name "postgres_backup_*.dump" -mtime +14 -delete
echo "Backup created at $BACKUP_FILE"
