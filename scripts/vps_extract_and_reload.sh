#!/bin/bash
set -e

echo "=== [1/4] Preparing Downloads Cache ==="
sudo apt-get install -y unzip >/dev/null 2>&1 || true
sudo mkdir -p /home/ubuntu/downloads_cache
if [ -d /var/www/pharmacy_frontend/downloads ]; then
    sudo cp -ru /var/www/pharmacy_frontend/downloads/* /home/ubuntu/downloads_cache/ 2>/dev/null || true
fi

echo "=== [2/4] Backing up Current index.html ==="
BACKUP_TS=$(date +%Y%m%d_%H%M%S)
if [ -f /var/www/pharmacy_frontend/index.html ]; then
    sudo cp /var/www/pharmacy_frontend/index.html /var/www/pharmacy_frontend/index.html.bak_${BACKUP_TS}
fi

echo "=== [3/4] Unzipping New Frontend Files ==="
sudo mkdir -p /var/www/pharmacy_frontend
sudo unzip -q -o /home/ubuntu/frontend_dist.zip -d /var/www/pharmacy_frontend

echo "=== [4/4] Restoring Downloads & Reloading Nginx ==="
sudo mkdir -p /var/www/pharmacy_frontend/downloads
sudo cp -ru /home/ubuntu/downloads_cache/* /var/www/pharmacy_frontend/downloads/ 2>/dev/null || true
sudo chown -R www-data:www-data /var/www/pharmacy_frontend
sudo chmod -R 755 /var/www/pharmacy_frontend

sudo nginx -t
sudo nginx -s reload

echo "=== FRONTEND_DEPLOYED_AND_NGINX_RELOADED_SUCCESSFULLY ==="
