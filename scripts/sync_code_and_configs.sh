#!/bin/bash
set -e

NEW_HOST="admin@169.58.214.20"

echo "=== [1/4] Syncing Backend Server Code to New VPS ==="
rsync -avz --exclude="node_modules" --exclude="*.bak*" /home/ubuntu/hr-system/server/ $NEW_HOST:/home/admin/hr-system/server/

echo "=== [2/4] Deploying Optimized docker-compose.yml to New VPS ==="
scp /tmp/docker-compose.new-vps.yml $NEW_HOST:/home/admin/hr-system/docker-compose.yml

echo "=== [3/4] Syncing Frontend Build to New VPS ==="
rsync -avz --delete /var/www/pharmacy_frontend/ $NEW_HOST:/tmp/pharmacy_frontend/
ssh $NEW_HOST "sudo rsync -av /tmp/pharmacy_frontend/ /var/www/pharmacy_frontend/ && sudo chown -R www-data:www-data /var/www/pharmacy_frontend/ && rm -rf /tmp/pharmacy_frontend"

echo "=== [4/4] Deploying Production Nginx Configuration to New VPS ==="
scp /tmp/nginx-pharma-new.conf $NEW_HOST:/tmp/default_nginx.conf
ssh $NEW_HOST "sudo cp /tmp/default_nginx.conf /etc/nginx/sites-available/default && sudo nginx -t && sudo systemctl reload nginx"

echo "=== CODE & CONFIG SYNC COMPLETED SUCCESSFULLY ==="
