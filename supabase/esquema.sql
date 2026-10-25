-- Portal de cuentas: tablas, permisos y archivos de comprobantes.
-- Pegar entero en Supabase → SQL Editor → Run. Se puede volver a correr sin perder datos.
--
-- Quién ve qué:
--  - Administradores (tú): ven y editan todo.
--  - Cada cuenta (inmueble o personal) tiene una lista de "accesos" por correo:
--    rol 'ver' (la dueña ve sus números) o 'editar' (además puede cargar movimientos).
--  - Cualquier otro usuario que se registre no ve nada.

create extension if not exists pgcrypto;

create table if not exists administradores (
  email text primary key check (email = lower(email))
);

create table if not exists cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'inmueble' check (tipo in ('personal', 'inmueble')),
  direccion text,
  moneda text not null default 'USD',
  comision_pct numeric(5, 2) not null default 0 check (comision_pct between 0 and 100),
  inquilino text,
  alquiler numeric(14, 2),
  contrato_fin date,
  notas text,
  archivada boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists accesos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas on delete cascade,
  email text not null check (email = lower(email)),
  nombre text,
  rol text not null default 'ver' check (rol in ('ver', 'editar')),
  unique (cuenta_id, email)
);

-- Cobros y pagos que se repiten cada mes (alquiler, expensas, entrega a la dueña…).
create table if not exists fijos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'gasto', 'egreso')),
  categoria text not null,
  descripcion text,
  monto numeric(14, 2) not null check (monto > 0),
  dia smallint not null default 1 check (dia between 1 and 31),
  activo boolean not null default true
);

create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas on delete cascade,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('ingreso', 'gasto', 'egreso')),
  categoria text not null,
  descripcion text,
  monto numeric(14, 2) not null check (monto > 0),
  fijo_id uuid references fijos on delete set null,
  comprobante text,
  creado_por text default lower(auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index if not exists movimientos_cuenta_fecha on movimientos (cuenta_id, fecha);
create index if not exists accesos_email on accesos (email);

-- ---------- Funciones de permisos ----------

create or replace function mi_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administradores where email = mi_email())
$$;

create or replace function puede_ver(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (select 1 from accesos where cuenta_id = c and email = mi_email())
$$;

create or replace function puede_editar(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (select 1 from accesos where cuenta_id = c and email = mi_email() and rol = 'editar')
$$;

create or replace function hay_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administradores)
$$;

-- El primer usuario que lo pide queda como administrador (sólo si todavía no hay ninguno).
create or replace function reclamar_admin() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if mi_email() = '' then return false; end if;
  lock table administradores in exclusive mode;
  if exists (select 1 from administradores) then return false; end if;
  insert into administradores (email) values (mi_email());
  return true;
end $$;

-- Las rutas de comprobantes son "<id de la cuenta>/<archivo>".
create or replace function cuenta_de_ruta(ruta text) returns uuid
language sql immutable as $$
  select case when split_part(ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(ruta, '/', 1)::uuid end
$$;

-- ---------- Permisos por fila ----------

alter table administradores enable row level security;
alter table cuentas enable row level security;
alter table accesos enable row level security;
alter table fijos enable row level security;
alter table movimientos enable row level security;

drop policy if exists "ver administradores" on administradores;
create policy "ver administradores" on administradores for select using (email = mi_email() or es_admin());
drop policy if exists "editar administradores" on administradores;
create policy "editar administradores" on administradores for all using (es_admin()) with check (es_admin());

drop policy if exists "ver cuentas" on cuentas;
create policy "ver cuentas" on cuentas for select using (puede_ver(id));
drop policy if exists "editar cuentas" on cuentas;
create policy "editar cuentas" on cuentas for all using (es_admin()) with check (es_admin());

drop policy if exists "ver accesos" on accesos;
create policy "ver accesos" on accesos for select using (es_admin() or email = mi_email());
drop policy if exists "editar accesos" on accesos;
create policy "editar accesos" on accesos for all using (es_admin()) with check (es_admin());

drop policy if exists "ver fijos" on fijos;
create policy "ver fijos" on fijos for select using (puede_ver(cuenta_id));
drop policy if exists "editar fijos" on fijos;
create policy "editar fijos" on fijos for all using (puede_editar(cuenta_id)) with check (puede_editar(cuenta_id));

drop policy if exists "ver movimientos" on movimientos;
create policy "ver movimientos" on movimientos for select using (puede_ver(cuenta_id));
drop policy if exists "editar movimientos" on movimientos;
create policy "editar movimientos" on movimientos for all using (puede_editar(cuenta_id)) with check (puede_editar(cuenta_id));

-- ---------- Comprobantes (fotos y PDF de facturas y recibos) ----------

insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

drop policy if exists "comprobantes ver" on storage.objects;
create policy "comprobantes ver" on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and puede_ver(cuenta_de_ruta(name)));
drop policy if exists "comprobantes subir" on storage.objects;
create policy "comprobantes subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and puede_editar(cuenta_de_ruta(name)));
drop policy if exists "comprobantes borrar" on storage.objects;
create policy "comprobantes borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'comprobantes' and puede_editar(cuenta_de_ruta(name)));
