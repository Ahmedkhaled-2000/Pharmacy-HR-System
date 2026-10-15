docker exec hr-postgres psql -U postgres -d postgres -c "SELECT DISTINCT device_user_pin, employee_name FROM biometric_raw_punches LIMIT 50;"
docker exec hr-postgres psql -U postgres -d postgres -c "SELECT * FROM biometric_employees WHERE employee_code = '102' OR name LIKE '%صبري%';"
