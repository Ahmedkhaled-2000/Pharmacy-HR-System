#!/bin/bash
set -e

echo "=== [1/5] Setting up 4GB Swap Space ==="
if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap created successfully."
else
    echo "Swapfile already exists."
fi

echo "=== [2/5] Installing Docker, Nginx, Certbot and Utilities ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 nginx certbot python3-certbot-nginx rsync ufw fail2ban htop curl jq

echo "=== [3/5] Configuring Services and Permissions ==="
usermod -aG docker admin || true
systemctl enable --now docker
systemctl enable --now nginx

echo "=== [4/5] Creating Directory Structure ==="
mkdir -p /home/admin/hr-system/server
mkdir -p /home/admin/hr-system/database
mkdir -p /home/admin/hr-system/scripts
mkdir -p /home/admin/hr-system/whatsapp-auth
mkdir -p /var/www/pharmacy_frontend
chown -R admin:admin /home/admin/hr-system
chown -R www-data:www-data /var/www/pharmacy_frontend
chmod -R 755 /var/www/pharmacy_frontend

echo "=== [5/5] Verification ==="
docker --version
docker compose version
nginx -v
free -h
swapon --show
echo "=== PROVISIONING COMPLETED SUCCESSFULLY ==="
