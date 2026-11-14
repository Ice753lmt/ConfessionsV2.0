-- CONFESSIONS THCS & THPT NGÃ SÁU
-- BẢN SQL TỔNG HỢP: schema + gộp CFS + likes RLS + comments + admin.
-- Chạy toàn bộ một lần trong Supabase > SQL Editor > New query.
-- Có thể chạy lại an toàn trên cơ sở dữ liệu đã có các bảng bên dưới.

create extension if not exists pgcrypto;

-- 1. BẢNG DỮ LIỆU
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default 'Người dùng',
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.confessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 3000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  post_number bigint,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- Bổ sung cột cho các project đã tạo bảng từ phiên bản cũ.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text not null default 'Người dùng';
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.confessions add column if not exists post_number bigint;
alter table public.confessions add column if not exists approved_at timestamptz;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Bổ sung parent_id cho bảng comments ở các bản cũ chưa có cột trả lời.
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create table if not exists public.likes (
  confession_id uuid not null references public.confessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (confession_id, user_id)
);

create sequence if not exists public.confession_post_number_seq start 1;

-- 2. CHO PHÉP NHIỀU CFS CÙNG THUỘC MỘT BÀI VIẾT
alter table public.confessions
  drop constraint if exists confessions_post_number_key;
drop index if exists public.confessions_post_number_key;

create index if not exists confessions_post_number_idx
  on public.confessions(post_number);
create index if not exists confessions_status_created_idx
  on public.confessions(status, created_at desc);
create index if not exists comments_confession_parent_created_idx
  on public.comments(confession_id, parent_id, created_at);

-- Đồng bộ sequence với số bài đã có để tránh cấp lại số cũ.
select setval(
  'public.confession_post_number_seq',
  greatest(coalesce((select max(post_number) from public.confessions), 0) + 1, 1),
  false
);

-- 3. TỰ TẠO PROFILE KHI CÓ TÀI KHOẢN AUTH MỚI
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'Người dùng')
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 4. HÀM KIỂM TRA ADMIN
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 5. DUYỆT NHIỀU CFS THÀNH MỘT BÀI VIẾT
-- Chỉ duyệt CFS đang pending; bỏ qua ID đã duyệt/từ chối/xóa.
-- Tất cả CFS được duyệt trong cùng lần bấm sẽ có chung post_number.
create or replace function public.approve_confessions(confession_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_post_number bigint;
  approved_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Bạn không có quyền duyệt bài';
  end if;

  if confession_ids is null or cardinality(confession_ids) = 0 then
    raise exception 'Bạn chưa chọn confession nào';
  end if;

  -- Chỉ cấp số bài khi có ít nhất một CFS pending trong danh sách.
  if not exists (
    select 1
    from public.confessions c
    where c.id = any(confession_ids)
      and c.status = 'pending'
  ) then
    raise exception 'Không có confession chờ duyệt trong lựa chọn này';
  end if;

  new_post_number := nextval('public.confession_post_number_seq');

  update public.confessions c
  set status = 'approved',
      post_number = new_post_number,
      approved_at = now()
  where c.id = any(confession_ids)
    and c.status = 'pending';

  get diagnostics approved_count = row_count;

  if approved_count = 0 then
    raise exception 'Không có confession chờ duyệt trong lựa chọn này';
  end if;
end;
$$;

-- 6. XÓA TÀI KHOẢN CỦA CHÍNH NGƯỜI DÙNG
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- 7. BẬT RLS
alter table public.profiles enable row level security;
alter table public.confessions enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;

-- 8. POLICIES PROFILES
drop policy if exists "profiles readable by signed in" on public.profiles;
create policy "profiles readable by signed in"
on public.profiles for select to authenticated
using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = 'user');

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles"
on public.profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 9. POLICIES CONFESSIONS
drop policy if exists "confessions visible approved or own or admin" on public.confessions;
create policy "confessions visible approved or own or admin"
on public.confessions for select to authenticated
using (status = 'approved' or user_id = auth.uid() or public.is_admin());

drop policy if exists "users create confession" on public.confessions;
create policy "users create confession"
on public.confessions for insert to authenticated
with check (user_id = auth.uid() and status = 'pending' and post_number is null);

drop policy if exists "admins moderate confession" on public.confessions;
create policy "admins moderate confession"
on public.confessions for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins delete confession" on public.confessions;
create policy "admins delete confession"
on public.confessions for delete to authenticated
using (public.is_admin());

-- 10. POLICIES COMMENTS
drop policy if exists "comments visible on approved posts" on public.comments;
create policy "comments visible on approved posts"
on public.comments for select to authenticated
using (
  exists (
    select 1 from public.confessions c
    where c.id = confession_id and c.status = 'approved'
  )
);

drop policy if exists "signed users comment on approved posts" on public.comments;
create policy "signed users comment on approved posts"
on public.comments for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.confessions c
    where c.id = confession_id and c.status = 'approved'
  )
  and (
    parent_id is null
    or exists (
      select 1 from public.comments parent
      where parent.id = parent_id
        and parent.confession_id = confession_id
    )
  )
);

-- 11. POLICIES LIKES
-- Xóa các policy cũ trên likes để tránh policy permissive cũ vô tình mở quyền.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'likes'
  loop
    execute format('drop policy if exists %I on public.likes', pol.policyname);
  end loop;
end;
$$;

create policy "likes_select_approved"
on public.likes for select to authenticated
using (
  exists (
    select 1 from public.confessions c
    where c.id = confession_id and c.status = 'approved'
  )
);

create policy "likes_insert_approved"
on public.likes for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.confessions c
    where c.id = confession_id and c.status = 'approved'
  )
);

create policy "likes_delete_own"
on public.likes for delete to authenticated
using (user_id = auth.uid());

-- 12. QUYỀN TRUY CẬP
grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.confessions to authenticated;
grant select, insert on public.comments to authenticated;
grant select, insert, delete on public.likes to authenticated;

grant usage, select on sequence public.confession_post_number_seq to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.approve_confessions(uuid[]) to authenticated;
grant execute on function public.delete_own_account() to authenticated;

-- 13. ĐẶT TÀI KHOẢN ADMIN
-- Địa chỉ email admin bạn đã cung cấp.
insert into public.profiles(id, email, full_name, role)
select id, email, 'Quản trị viên', 'admin'
from auth.users
where lower(email) = lower('chantu427@gmail.com')
on conflict (id) do update
set email = excluded.email,
    full_name = 'Quản trị viên',
    role = 'admin';

-- Kiểm tra kết quả: truy vấn phải trả về tài khoản admin và role = admin.
select id, email, full_name, role
from public.profiles
where lower(email) = lower('chantu427@gmail.com');

-- Nếu truy vấn cuối không có dòng nào:
-- tài khoản chantu427@gmail.com chưa tồn tại trong Authentication > Users.
-- Hãy tạo tài khoản đó rồi chạy lại riêng khối INSERT ... SELECT ở mục 13.
