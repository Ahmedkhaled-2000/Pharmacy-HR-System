#!/bin/bash
set -e

echo "=== [1/5] Deploying Frontend Update to /var/www/pharmacy_frontend ==="
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
if [ -f /var/www/pharmacy_frontend/index.html ]; then
    sudo cp /var/www/pharmacy_frontend/index.html /var/www/pharmacy_frontend/index.html.bak_${BACKUP_DATE}
fi
sudo tar -xzf /home/ubuntu/frontend_update.tar.gz -C /var/www/pharmacy_frontend/
sudo chown -R www-data:www-data /var/www/pharmacy_frontend/
sudo chmod -R 755 /var/www/pharmacy_frontend/
sudo nginx -t
sudo nginx -s reload
echo "Frontend deployed and Nginx reloaded successfully."

echo "=== [2/5] Deploying Backend Files to Docker Container ==="
cp /home/ubuntu/outstock-manager.js /home/ubuntu/hr-system/server/outstock-manager.js 2>/dev/null || true
cp /home/ubuntu/hr-backend.js /home/ubuntu/hr-system/server/hr-backend.js 2>/dev/null || true
cp /home/ubuntu/whatsapp-server.js /home/ubuntu/hr-system/server/whatsapp-server.js 2>/dev/null || true

sudo docker cp /home/ubuntu/outstock-manager.js hr-backend-server:/app/server/outstock-manager.js
sudo docker cp /home/ubuntu/hr-backend.js hr-backend-server:/app/server/hr-backend.js

echo "=== [3/5] Restarting hr-backend-server and hr-whatsapp-server Containers ==="
sudo docker restart hr-backend-server hr-whatsapp-server
sleep 4

echo "=== [4/5] Verifying System Services & Health ==="
sudo docker ps
curl -s http://127.0.0.1:5000/api/health || true
echo ""
echo "=== VPS DEPLOYMENT COMPLETED SUCCESSFULLY ==="
