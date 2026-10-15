import zipfile
import os
import subprocess

zip_path = '/home/ubuntu/frontend_update.zip' if os.path.exists('/home/ubuntu/frontend_update.zip') else '/home/ubuntu/frontend_dist.zip'
dest = '/var/www/pharmacy_frontend'

print("=== [1/3] Extracting zip with forward-slash path normalization ===")
with zipfile.ZipFile(zip_path, 'r') as z:
    for m in z.infolist():
        clean_name = m.filename.replace('\\', '/').strip('/')
        if not clean_name:
            continue
        target = os.path.join(dest, clean_name)
        if m.is_dir() or m.filename.endswith('/') or m.filename.endswith('\\'):
            os.makedirs(target, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as f:
                f.write(z.read(m))

print("=== [2/3] Setting permissions ===")
os.system("sudo chown -R www-data:www-data " + dest)
os.system("sudo chmod -R 755 " + dest)

print("=== [3/3] Testing and reloading Nginx ===")
os.system("sudo nginx -t && sudo nginx -s reload")

print("=== DEPLOYMENT_COMPLETE_SUCCESSFULLY ===")
