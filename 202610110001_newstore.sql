-- NewStore initial schema. Apply with Supabase CLI or SQL Editor.
create extension if not exists pgcrypto;

create type public.app_role as enum ('customer', 'admin');
create type public.order_status as enum ('pending', 'paid', 'cancelled', 'refunded', 'failed');
create type public.support_status as enum ('open', 'waiting_admin', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'customer',
  banned_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 160),
  description text,
  category text not null default 'Gift Cards',
  price_cents integer not null check (price_cents >= 0),
  image_url text,
  stock integer check (stock is null or stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_settings (
  id integer primary key default 1 check (id = 1),
  store_name text not null default 'NewStore',
  primary_color text not null default '#8b5cf6' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#2563eb' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  promo_banner text,
  updated_at timestamptz not null default now()
);
insert into public.store_settings(id) values (1) on conflict do nothing;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1 check (quantity between 1 and 20),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status public.order_status not null default 'pending',
  mp_payment_id text unique,
  mp_preference_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default 'Atendimento NewStore',
  status public.support_status not null default 'open',
  assigned_admin uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_kind text not null check (sender_kind in ('customer','admin','ai','system')),
  body text not null check (length(body) between 1 and 6000),
  created_at timestamptz not null default now()
);

create table public.support_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid references public.support_tickets(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique(user_id, ticket_id)
);

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(reason) between 5 and 2000),
  status text not null default 'requested' check (status in ('requested','approved','rejected','processed')),
  admin_note text,
  mp_refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index products_active_created_idx on public.products(active, created_at desc);
create index orders_user_created_idx on public.orders(user_id, created_at desc);
create index tickets_user_created_idx on public.support_tickets(user_id, created_at desc);
create index messages_ticket_created_idx on public.support_messages(ticket_id, created_at);
create index refunds_user_idx on public.refund_requests(user_id, created_at desc);

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.banned_at is null
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger products_touch before update on public.products for each row execute procedure public.touch_updated_at();
create trigger settings_touch before update on public.store_settings for each row execute procedure public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute procedure public.touch_updated_at();
create trigger refunds_touch before update on public.refund_requests for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.store_settings enable row level security;
alter table public.orders enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_reviews enable row level security;
alter table public.refund_requests enable row level security;
alter table public.audit_logs enable row level security;

create policy "Profiles visible to owner or admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_admin());
create policy "Owner can update own basic profile" on public.profiles for update to authenticated
using (id = (select auth.uid()) and not public.is_admin())
with check (id = (select auth.uid()) and role = 'customer' and banned_at is null);
create policy "Active products public read" on public.products for select to anon, authenticated
using (active or public.is_admin());
create policy "Admins insert products" on public.products for insert to authenticated with check (public.is_admin());
create policy "Admins update products" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete products" on public.products for delete to authenticated using (public.is_admin());
create policy "Store settings public read" on public.store_settings for select to anon, authenticated using (true);
create policy "Admins update settings" on public.store_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Owners read orders" on public.orders for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
-- Clients cannot insert/update payment orders directly. Edge Functions use service role after validation.
create policy "Owners read tickets" on public.support_tickets for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Customers create own tickets" on public.support_tickets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Admins update tickets" on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Ticket messages visible to participants" on public.support_messages for select to authenticated
using (public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));
create policy "Customers send own ticket messages" on public.support_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and sender_kind = 'customer' and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()) and t.status <> 'closed'));
create policy "Admins send ticket messages" on public.support_messages for insert to authenticated
with check (public.is_admin() and sender_id = (select auth.uid()) and sender_kind = 'admin');
create policy "Users create own reviews" on public.support_reviews for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()) and t.status = 'closed'));
create policy "Reviews visible to admin and owner" on public.support_reviews for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Users read own refund requests" on public.refund_requests for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "Users request refund for own order" on public.refund_requests for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()) and o.status = 'paid'));
create policy "Admins update refund requests" on public.refund_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins read audit logs" on public.audit_logs for select to authenticated using (public.is_admin());

-- Realtime publication: visible rows remain protected by RLS.
do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.store_settings;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

grant select on public.products, public.store_settings to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.orders to authenticated;
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select, insert on public.support_reviews to authenticated;
grant select, insert, update on public.refund_requests to authenticated;
grant select on public.audit_logs to authenticated;

-- Bootstrap admin safely: use the Supabase SQL editor after creating your own account.
-- Replace the UUID with the user ID shown under Authentication > Users.
-- update public.profiles set role = 'admin' where id = 'YOUR_AUTH_USER_UUID';
-- Never expose service_role or let users choose their own role.
