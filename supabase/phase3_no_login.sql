-- Phase 3: โหมดไม่มี login (ใช้คนเดียว)
-- ทุกคนที่เปิดเว็บใช้ข้อมูลชุดเดียวกัน ไม่ต้องสมัครหรือเข้าสู่ระบบ
-- รันครั้งเดียวใน SQL Editor หลัง schema.sql และ phase2.sql
-- ข้อมูลเดิมที่เคยบันทึกไว้ด้วยบัญชีเก่าจะถูกย้ายมารวมให้อัตโนมัติ

do $$
declare
  t text;
  owner uuid := '00000000-0000-0000-0000-000000000001';
begin
  foreach t in array array['habits', 'habit_logs', 'categories', 'transactions', 'moods', 'budgets', 'ai_usage'] loop
    execute format('alter table %I drop constraint if exists %I', t, t || '_user_id_fkey');
    execute format('update %I set user_id = %L', t, owner);
    execute format('alter table %I alter column user_id set default %L', t, owner);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "open access" on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;

-- ไม่มีการสมัครแล้ว จึงเลิกสร้างหมวดหมู่อัตโนมัติตอนสมัคร
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.seed_categories();

-- ใส่หมวดหมู่เริ่มต้น (เฉพาะเมื่อยังไม่มีหมวดเลย)
insert into categories (name, type, emoji)
select * from (values
  ('อาหาร', 'expense', '🍜'),
  ('เดินทาง', 'expense', '🚌'),
  ('ที่พัก', 'expense', '🏠'),
  ('ช้อปปิ้ง', 'expense', '🛍️'),
  ('สุขภาพ', 'expense', '💊'),
  ('บันเทิง', 'expense', '🎬'),
  ('เงินเดือน', 'income', '💼'),
  ('ฟรีแลนซ์', 'income', '💻'),
  ('อื่นๆ', 'income', '✨')
) as v(name, type, emoji)
where not exists (select 1 from categories);
