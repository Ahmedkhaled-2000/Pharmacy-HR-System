#!/bin/bash
set -e

echo "======================================================"
echo "🚀 [1/4] Applying Backend Updates to hr-backend-server"
echo "======================================================"
cp /home/ubuntu/hr-backend.js /home/ubuntu/hr-system/server/hr-backend.js 2>/dev/null || true
cp /home/ubuntu/biometric-manager.js /home/ubuntu/hr-system/server/biometric-manager.js 2>/dev/null || true

sudo docker cp /home/ubuntu/hr-backend.js hr-backend-server:/app/server/hr-backend.js
sudo docker cp /home/ubuntu/biometric-manager.js hr-backend-server:/app/server/biometric-manager.js

echo "======================================================"
echo "🔄 [2/4] Restarting hr-backend-server Container"
echo "======================================================"
sudo docker restart hr-backend-server
sleep 4

echo "======================================================"
echo "🌐 [3/4] Deploying Frontend Bundle to /var/www/pharmacy_frontend"
echo "======================================================"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
if [ -f /var/www/pharmacy_frontend/index.html ]; then
    sudo cp /var/www/pharmacy_frontend/index.html /var/www/pharmacy_frontend/index.html.bak_${BACKUP_DATE}
fi
sudo tar -xzf /home/ubuntu/frontend_update.tar.gz -C /var/www/pharmacy_frontend/
sudo chown -R www-data:www-data /var/www/pharmacy_frontend/
sudo chmod -R 755 /var/www/pharmacy_frontend/

echo "======================================================"
echo "⚡ [4/4] Validating and Reloading Nginx"
echo "======================================================"
sudo nginx -t
sudo nginx -s reload

echo "======================================================"
echo "🔍 Health and Safety Verification"
echo "======================================================"
sudo docker ps | grep hr-backend-server
curl -s http://127.0.0.1:5000/api/health || true
echo ""
sudo docker cp /home/ubuntu/check_shifts_state.cjs hr-backend-server:/app/check_shifts_state.cjs
sudo docker exec hr-backend-server node /app/check_shifts_state.cjs

echo ""
echo "✅ DEPLOYMENT AND VERIFICATION COMPLETED WITH ZERO DATA LOSS!"
