DELETE FROM public.outstock_medications WHERE id LIKE 'eg-eg%';
SELECT count(*) as remaining_medications FROM public.outstock_medications;
