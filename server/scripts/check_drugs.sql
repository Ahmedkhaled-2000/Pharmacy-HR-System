SELECT conname, conrelid::regclass, confrelid::regclass 
FROM pg_constraint 
WHERE confrelid = 'public.outstock_medications'::regclass;
