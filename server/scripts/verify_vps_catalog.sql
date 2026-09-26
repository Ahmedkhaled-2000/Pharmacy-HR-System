-- 1. فحص كبار الأصناف والمستحضرات الحيوية والتسعيرة الجديدة وعدد الشرائط
SELECT 
  id, 
  trade_name_ar, 
  trade_name_en, 
  dosage_form, 
  pack_size, 
  unit_name, 
  public_price, 
  unit_price
FROM public.outstock_medications
WHERE id IN (
  'eg-441',    -- Alphintern 30 tabs
  'eg-1126',   -- Augmentin 1g 14 tabs
  'eg-2151',   -- Cataflam 50mg 20 tabs
  'eg-15545',  -- Brufen 600mg 30 tabs
  'eg-1768',   -- Brufen 600mg 20 eff sachets
  'eg-799',    -- Antinal 200mg 24 caps
  'eg-800',    -- Antinal susp 60ml
  'eg-2979',   -- Congestal 20 tabs
  'eg-2978',   -- Congestal syrup 120ml
  'eg-2975',   -- Concor 5mg 30 tabs
  'eg-2',      -- 1 2 3 (20 tabs)
  'eg-14631',  -- Augmentin 625mg
  'eg-16941',  -- Curam 1g 12 tabs
  'eg-6093',   -- Hibiotic 1g 16 tabs
  'eg-49',     -- Acetylcysteine 200mg 10 sachets
  'eg-2484'    -- Catafast 50mg 9 sachets
)
ORDER BY trade_name_ar;

-- 2. إحصائيات توزيع وحدات التجزئة في الكتالوج بالكامل
SELECT 
  unit_name, 
  count(*) as total_items,
  round(avg(pack_size), 1) as avg_pack_size,
  min(pack_size) as min_pack_size,
  max(pack_size) as max_pack_size
FROM public.outstock_medications
GROUP BY unit_name
ORDER BY total_items DESC;

-- 3. فحص سلامة البيانات: التأكد من عدم وجود أسعار أو أحجام عبوات صفرية
SELECT 
  count(*) FILTER (WHERE pack_size <= 0) as invalid_pack_size,
  count(*) FILTER (WHERE public_price <= 0) as zero_public_price,
  count(*) FILTER (WHERE unit_price <= 0) as zero_unit_price,
  count(*) as total_medications
FROM public.outstock_medications;
