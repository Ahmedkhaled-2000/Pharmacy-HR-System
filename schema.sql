-- إنشاء جدول app_settings لحفظ بيانات التطبيق كـ Key-Value
create table if not exists public.app_settings (
    key text primary key,
    value jsonb,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- تفعيل Row Level Security (RLS) للحماية
alter table public.app_settings enable row level security;

-- إنشاء سياسات الوصول (Policies) للسماح بالقراءة والكتابة للجميع
drop policy if exists "السماح بالوصول للقراءة للجميع" on public.app_settings;
create policy "السماح بالوصول للقراءة للجميع" on public.app_settings
    for select using (true);

drop policy if exists "السماح بالإدخال للجميع" on public.app_settings;
create policy "السماح بالإدخال للجميع" on public.app_settings
    for insert with check (true);

drop policy if exists "السماح بالتحديث للجميع" on public.app_settings;
create policy "السماح بالتحديث للجميع" on public.app_settings
    for update using (true);

-- التأكد من وجود supabase_realtime publication
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- إضافة جدول app_settings إلى Realtime بأمان
do $$
begin
  alter publication supabase_realtime add table public.app_settings;
exception
  when others then null;
end $$;

-- إنشاء جدول مخصص لبصمات الوجه واليد
create table if not exists public.employee_faces (
    employee_id text primary key,
    descriptor jsonb,
    hand_descriptor jsonb,
    biometric_type text default 'face',
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- تفعيل Row Level Security (RLS)
alter table public.employee_faces enable row level security;

-- إنشاء سياسات الوصول (Policies) لحماية وبث بيانات بصمات الموظفين
drop policy if exists "السماح بالوصول للقراءة للجميع" on public.employee_faces;
create policy "السماح بالوصول للقراءة للجميع" on public.employee_faces
    for select using (true);

drop policy if exists "السماح بالإدخال للجميع" on public.employee_faces;
create policy "السماح بالإدخال للجميع" on public.employee_faces
    for insert with check (true);

drop policy if exists "السماح بالتحديث للجميع" on public.employee_faces;
create policy "السماح بالتحديث للجميع" on public.employee_faces
    for update using (true);

-- إضافة جدول employee_faces إلى publication الخاص بـ Realtime بأمان
do $$
begin
  alter publication supabase_realtime add table public.employee_faces;
exception
  when others then null;
end $$;
