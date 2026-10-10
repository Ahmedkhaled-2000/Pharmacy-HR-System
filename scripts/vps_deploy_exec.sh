#!/bin/bash
set -e

echo "=== [1/4] Deploying Frontend to /var/www/pharmacy_frontend ==="
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

echo "=== [2/4] Deploying Backend Files to Docker Container ==="
cp /home/ubuntu/biometric-manager.js /home/ubuntu/hr-system/server/biometric-manager.js 2>/dev/null || true
cp /home/ubuntu/outstock-manager.js /home/ubuntu/hr-system/server/outstock-manager.js 2>/dev/null || true
cp /home/ubuntu/hr-backend.js /home/ubuntu/hr-system/server/hr-backend.js 2>/dev/null || true
cp /home/ubuntu/eda-drugeye-catalog.js /home/ubuntu/hr-system/server/eda-drugeye-catalog.js 2>/dev/null || true

sudo docker cp /home/ubuntu/biometric-manager.js hr-backend-server:/app/server/biometric-manager.js
sudo docker cp /home/ubuntu/outstock-manager.js hr-backend-server:/app/server/outstock-manager.js
sudo docker cp /home/ubuntu/hr-backend.js hr-backend-server:/app/server/hr-backend.js
sudo docker cp /home/ubuntu/eda-drugeye-catalog.js hr-backend-server:/app/server/eda-drugeye-catalog.js 2>/dev/null || true

echo "=== [3/4] Restarting hr-backend-server Container ==="
sudo docker restart hr-backend-server
sleep 6

echo "=== [4/4] Verifying System Services & Health ==="
sudo docker ps
echo ""
curl -s http://127.0.0.1:5000/api/health || true
echo ""
echo "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
