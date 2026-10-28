#!/bin/bash
set -e

NEW_HOST="admin@169.58.214.20"

echo "=== [1/4] Copying WhatsApp Auth Session to New VPS ==="
sudo docker cp hr-whatsapp-server:/app/server/whatsapp-auth /tmp/whatsapp-auth 2>/dev/null || true
if [ -d /tmp/whatsapp-auth ]; then
    rsync -avz /tmp/whatsapp-auth/ $NEW_HOST:/home/admin/hr-system/whatsapp-auth/
    sudo rm -rf /tmp/whatsapp-auth
fi

echo "=== [2/4] Building and Launching All Services on New VPS ==="
ssh $NEW_HOST "
cd /home/admin/hr-system
sudo docker compose up -d --build
sleep 8
sudo docker ps
"

echo "=== [3/4] Verifying System Health on New VPS ==="
ssh $NEW_HOST "
curl -s http://127.0.0.1:5000/api/health || true
echo ''
curl -I http://127.0.0.1/
"

echo "=== [4/4] Activating Real-Time Biometric Forwarding on Old VPS ==="
# We will inject the proxy_pass to new server into the old Nginx config
sudo sed -i 's|proxy_pass http://127.0.0.1:5000;|proxy_pass http://169.58.214.20:5000;|g' /etc/nginx/sites-available/default
sudo nginx -t
sudo systemctl reload nginx

echo "=== FULL CUTOVER AND BIOMETRIC FORWARDING ACTIVATED SUCCESSFULLY ==="
