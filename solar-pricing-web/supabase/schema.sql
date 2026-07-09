-- مخطط قاعدة بيانات Supabase لبرنامج تسعير الطاقة الشمسية — بلاد اوتو
-- انسخ كل هذا الملف والصقه في: Supabase → SQL Editor → New query → Run
-- (آمن لإعادة التشغيل: يستخدم IF NOT EXISTS ويحدّث السياسات)

-- ========== الجداول ==========
create table if not exists materials (
  id bigint generated always as identity primary key,
  category text not null check (category in ('panel','battery','inverter','secondary')),
  brand text,
  model text,
  full_description text not null,
  unit text not null check (unit in ('عدد','متر','قطعي')),
  watt_or_capacity real,
  price real not null default 0,
  warranty_months integer,
  warranty_note text,
  qty_per_panel real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists labor_tiers (
  id bigint generated always as identity primary key,
  system_amps real not null,
  price real not null,
  note text
);

create table if not exists company_profile (
  id integer primary key check (id = 1),
  company_name text,
  company_name_en text,
  email text,
  phone1 text,
  phone2 text,
  manager_name text,
  logo_path text,
  notes_default jsonb
);

create table if not exists settings (
  id integer primary key check (id = 1),
  system_voltage real not null default 220,
  system_efficiency real not null default 0.80,
  inverter_safety_factor real not null default 1.25,
  dod real not null default 0.90,
  night_coverage_hours real not null default 8,
  panel_area_m2 real not null default 2.7,
  currency text not null default 'دينار عراقي',
  quote_number_start integer not null default 7400,
  charge_panels_per_battery real not null default 1.5
);

create table if not exists quotes (
  id bigint generated always as identity primary key,
  quote_number integer not null unique,
  client_name text,
  client_phone text,
  location text,
  roof_area_m2 real,
  required_amp_day real,
  required_amp_night real,
  night_supply_hours real,
  selected_tier text check (selected_tier in ('economy','standard','premium')),
  total_price real not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists quote_items (
  id bigint generated always as identity primary key,
  quote_id bigint not null references quotes(id) on delete cascade,
  material_id bigint references materials(id) on delete set null,
  description_snapshot text not null,
  quantity real not null,
  unit text,
  unit_price real not null,
  subtotal real not null,
  sort_order integer not null default 0
);

create table if not exists quote_notes (
  id bigint generated always as identity primary key,
  quote_id bigint not null references quotes(id) on delete cascade,
  note_text text not null,
  sort_order integer not null default 0
);

-- ========== بيانات أولية ==========
insert into settings (id) values (1) on conflict (id) do nothing;

insert into company_profile (id, company_name, company_name_en, email, phone1, phone2, manager_name, notes_default)
values (
  1,
  'شركة بلاد اوتو للطاقة الشمسية والمقاولات العامة',
  'Bilad Utu for Energy Services',
  'Info@biladutu.com', '07770530070', '07809332469', 'أ.حيدر كاظم عبادي',
  '["مدة التجهيز تتراوح بين 1 يوم إلى 2 يوم من تاريخ دفع العربون","الدفعات تكون حسب اتفاق الطرفين","مدة التنفيذ تتراوح من 1 إلى 3 أيام مع تشغيل والبرمجة","ذرعة الكيبلات من المحتمل تغيرها لأنه لم يتم الكشف الموقعي","أي تغيير بالأسعار يتم نقاشه من قبل الطرفين"]'::jsonb
)
on conflict (id) do nothing;

-- مواد تجريبية (تُدرج مرة واحدة فقط إذا الجدول فارغ)
insert into materials (category, brand, model, full_description, unit, watt_or_capacity, price, warranty_months, warranty_note, qty_per_panel)
select * from (values
  ('panel','JINKO SOLAR','JINKO 650W Bifacial',
   E'تجهيز وتركيب وتنصيب ألواح شمسية ذو قدرة لا تقل عن 650 واط بقدرة ذات وجهين (Bifacial Module) نوع (JINKO SOLAR) بالمواصفات التالية:\n• النوع والتقنية المستخدمة: LONGI HX10   • القدرة: 650+ واط لكل لوح   • الكفاءة 23%\n• معامل الفقد الحراري 0.29% كل درجة مئوية   • نسبة تدهور الألواح 0.4% سنوياً\n• مواصفات إضافية: Pmpp, bifacial, PID resistance\n• الضمان: 10 سنوات لا يشمل الكسر',
   'عدد',650,185000,120,'ضمان الألواح 10 سنوات لا يشمل الكسر',null),
  ('inverter','COSPOWER','COSPOWER 6kW Hybrid Single Phase',
   E'تجهيز وتركيب وتنصيب انفيرتر نوع Single Phase Hybrid Inverter (COSPOWER) قدرة (6) كيلو واط أحادي الطور Low Voltage بالمواصفات أدناه:\n• منشأ الانفيرتر صيني أصلي   • 1MPPT   • شاشة LCD\n• يحتوي الانفيرتر على نظام إدارة البطارية الذكي BMS   • IP65\n• ضمان لا يقل عن 5 سنوات',
   'عدد',6000,650000,60,'ضمان الانفيرتر 5 سنوات',null),
  ('battery','COSPOWER','COSPOWER 16kWh Lithium',
   E'تجهيز بطاريات ليثيوم نوع (COSPOWER) بالمواصفات أدناه:\n• خلية ليثيوم فوسفات الحديد   • منشأ صيني أصلي   • تدعم البطارية نظام BMS من الانفيرتر\n• قدرة خزن بطارية (16kWh) للوحدة الواحدة\n• ضمان لا يقل عن 5 سنوات',
   'عدد',16,2750000,60,'ضمان البطارية 5 سنوات',null),
  ('secondary',null,'هيكل ألواح مغلون','هيكل الألواح مغلون بسمك 1.92-2 ملم لكل لوح، مقاوم للرياح، لكل لوح محمل مثبت على الأرض','عدد',null,65000,null,null,1),
  ('secondary',null,'صبات تثبيت الهياكل','صبات لتثبيت الهياكل','عدد',null,5000,null,null,1),
  ('secondary',null,'كيبل ألواح-انفيرتر 6مم','كيبلات ناقلة من الألواح إلى الانفيرتر بحجم 6 ملم بلونين الأحمر والأسود وحسب المواصفات','متر',null,2000,null,null,null),
  ('secondary',null,'بوردة حماية DC','بوردات الحماية للألواح والانفيرترات (DC)، الحماية للدخول وخروج الحمل','عدد',null,150000,null,null,0)
) as t
where not exists (select 1 from materials);

insert into labor_tiers (system_amps, price)
select * from (values (10,400000.0),(15,550000.0),(20,700000.0),(25,850000.0),(30,1000000.0)) as t
where not exists (select 1 from labor_tiers);

-- ========== الأمان (RLS): أي مستخدم مسجّل دخول يقرأ ويكتب ==========
alter table materials enable row level security;
alter table labor_tiers enable row level security;
alter table company_profile enable row level security;
alter table settings enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table quote_notes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['materials','labor_tiers','company_profile','settings','quotes','quote_items','quote_notes']
  loop
    execute format('drop policy if exists auth_all on %I', t);
    execute format('create policy auth_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
