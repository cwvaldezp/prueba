-- Portal de barberías: tablas, permisos y archivos de documentos.
-- Pegar entero en Supabase → SQL Editor → Run. Se puede volver a correr sin perder datos.
-- Puede ir en el mismo proyecto que esquema.sql (Mis cuentas): no comparten tablas.
--
-- Quién ve qué:
--  - Superadministradores: revisan las barberías y sus documentos; aprueban, piden corrección,
--    rechazan o suspenden, siempre con un motivo. No ven las citas ni los clientes.
--  - Dueño: todo lo de su barbería. Sólo cambia documentos antes de enviar o cuando le piden corrección.
--  - Barbero (el dueño lo agrega con su correo): ve sus citas y las marca como atendidas.
--  - Cliente: entra con el enlace o QR de invitación; ve sólo las barberías a las que se unió,
--    sus propias citas y las horas ocupadas (sin saber de quién son).
-- Las reservas, cancelaciones y decisiones pasan por funciones (bar_*) que revisan las reglas.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create or replace function bar_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function bar_codigo() returns text
language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '' order by i)
  from (select gen_random_bytes(8) as b) x, generate_series(0, 7) as i
$$;

create table if not exists superadmins (
  email text primary key check (email = lower(email))
);

create table if not exists barberias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text,
  telefono text,
  descripcion text,
  dueno_email text not null default bar_email() check (dueno_email = lower(dueno_email)),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'en_revision', 'correccion', 'aprobada', 'rechazada', 'suspendida')),
  motivo text,
  codigo text not null unique default bar_codigo(),
  cancelar_horas numeric(4, 1) not null default 2 check (cancelar_horas between 0 and 72),
  zona_horaria text not null default 'America/Lima',
  enviada_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias on delete cascade,
  tipo text not null,
  archivo text,
  nombre_archivo text,
  vence date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptado', 'rechazado')),
  observacion text,
  created_at timestamptz not null default now()
);

-- Historial: quién envió, aprobó o rechazó, cuándo y por qué.
create table if not exists revisiones (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias on delete cascade,
  estado text not null,
  motivo text,
  por_email text not null default bar_email(),
  created_at timestamptz not null default now()
);

-- horario: {"1": [["09:00","13:00"],["15:00","19:00"]], …, "7": []}  (1 = lunes … 7 = domingo)
create table if not exists barberos (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias on delete cascade,
  nombre text not null,
  email text check (email = lower(email)),
  horario jsonb not null default '{}',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias on delete cascade,
  nombre text not null,
  duracion_min int not null check (duracion_min between 5 and 480),
  precio numeric(10, 2),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists afiliaciones (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias on delete cascade,
  cliente_email text not null default bar_email() check (cliente_email = lower(cliente_email)),
  nombre text not null,
  telefono text,
  created_at timestamptz not null default now(),
  unique (barberia_id, cliente_email)
);

create table if not exists citas (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias on delete cascade,
  barbero_id uuid not null references barberos,
  servicio_id uuid references servicios on delete set null,
  servicio_nombre text not null,
  cliente_email text,
  cliente_nombre text not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  estado text not null default 'reservada' check (estado in ('reservada', 'completada', 'no_asistio', 'cancelada')),
  nota text,
  cancelada_por text,
  motivo_cancelacion text,
  creada_por text not null default bar_email(),
  created_at timestamptz not null default now(),
  check (fin > inicio),
  -- Un barbero no puede tener dos citas a la misma hora (aunque dos personas reserven a la vez).
  constraint citas_sin_cruce exclude using gist (barbero_id with =, tstzrange(inicio, fin) with &&)
    where (estado in ('reservada', 'completada'))
);
create index if not exists citas_barberia_inicio on citas (barberia_id, inicio);
create index if not exists citas_cliente on citas (cliente_email);

create table if not exists lista_espera (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references barberias on delete cascade,
  cliente_email text not null default bar_email(),
  cliente_nombre text,
  fecha date not null,
  barbero_id uuid references barberos on delete set null,   -- vacío = con cualquiera
  servicio_id uuid references servicios on delete set null,
  desde time,
  hasta time,
  estado text not null default 'esperando' check (estado in ('esperando', 'atendida', 'cancelada')),
  avisos int not null default 0,
  created_at timestamptz not null default now(),
  check (desde is null or hasta is null or desde < hasta)
);
create unique index if not exists espera_una_por_dia on lista_espera (barberia_id, cliente_email, fecha) where estado = 'esperando';

create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  barberia_id uuid references barberias on delete cascade,
  tipo text not null,
  titulo text not null,
  texto text,
  enlace text,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notificaciones_email on notificaciones (email, created_at desc);

-- ---------- Quién es quién ----------

create or replace function bar_es_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from superadmins where email = bar_email())
$$;

create or replace function bar_hay_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from superadmins)
$$;

-- El primer usuario que lo pide queda como superadministrador (sólo si todavía no hay ninguno).
create or replace function bar_reclamar_super() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if bar_email() = '' then return false; end if;
  lock table superadmins in exclusive mode;
  if exists (select 1 from superadmins) then return false; end if;
  insert into superadmins (email) values (bar_email());
  return true;
end $$;

create or replace function bar_es_dueno(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from barberias where id = b and dueno_email = bar_email())
$$;

create or replace function bar_es_barbero(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from barberos where barberia_id = b and email = bar_email() and activo)
$$;

create or replace function bar_es_afiliado(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from afiliaciones where barberia_id = b and cliente_email = bar_email())
$$;

create or replace function bar_puede_ver(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select bar_es_super() or bar_es_dueno(b) or bar_es_barbero(b) or bar_es_afiliado(b)
$$;

-- El dueño puede cambiar documentos sólo antes de enviar o cuando le piden corrección.
create or replace function bar_editable(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from barberias where id = b and dueno_email = bar_email() and estado in ('borrador', 'correccion'))
$$;

create or replace function bar_es_su_barbero(br uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from barberos where id = br and email = bar_email())
$$;

-- Las rutas de los documentos son "<id de la barbería>/<archivo>".
create or replace function bar_de_ruta(ruta text) returns uuid
language sql immutable as $$
  select case when split_part(ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(ruta, '/', 1)::uuid end
$$;

create or replace function bar_notificar(p_email text, p_barberia uuid, p_tipo text, p_titulo text, p_texto text, p_enlace text)
returns void language sql security definer set search_path = public as $$
  insert into notificaciones (email, barberia_id, tipo, titulo, texto, enlace)
  select p_email, p_barberia, p_tipo, p_titulo, p_texto, p_enlace where coalesce(p_email, '') <> ''
$$;
revoke execute on function bar_notificar(text, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function bar_texto_cita(c citas, tz text) returns text
language sql stable security definer set search_path = public as $$
  select to_char(c.inicio at time zone tz, 'DD/MM') || ' a las ' || to_char(c.inicio at time zone tz, 'HH24:MI') ||
         coalesce(' con ' || (select nombre from barberos where id = c.barbero_id), '')
$$;

-- ---------- Protecciones ----------

-- El estado, el motivo, el dueño y el código sólo cambian por las funciones bar_* (no editando la fila).
create or replace function bar_proteger_barberia() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('bar.interno', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.estado := 'borrador'; new.motivo := null; new.enviada_at := null;
    new.dueno_email := bar_email(); new.codigo := bar_codigo();
    perform now() at time zone new.zona_horaria;  -- falla si la zona horaria no existe
  else
    new.estado := old.estado; new.motivo := old.motivo; new.enviada_at := old.enviada_at;
    new.dueno_email := old.dueno_email; new.codigo := old.codigo; new.zona_horaria := coalesce(new.zona_horaria, old.zona_horaria);
  end if;
  return new;
end $$;
drop trigger if exists bar_proteger_barberia on barberias;
create trigger bar_proteger_barberia before insert or update on barberias for each row execute function bar_proteger_barberia();

create or replace function bar_proteger_documento() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('bar.interno', true), '') = '1' then return new; end if;
  new.estado := 'pendiente'; new.observacion := null;
  return new;
end $$;
drop trigger if exists bar_proteger_documento on documentos;
create trigger bar_proteger_documento before insert or update on documentos for each row execute function bar_proteger_documento();

create or replace function bar_preparar_espera() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.cliente_email := bar_email(); new.estado := 'esperando'; new.avisos := 0;
  new.cliente_nombre := (select nombre from afiliaciones where barberia_id = new.barberia_id and cliente_email = new.cliente_email);
  if new.fecha < (now() at time zone (select zona_horaria from barberias where id = new.barberia_id))::date then
    raise exception 'Esa fecha ya pasó.';
  end if;
  return new;
end $$;
drop trigger if exists bar_preparar_espera on lista_espera;
create trigger bar_preparar_espera before insert on lista_espera for each row execute function bar_preparar_espera();

-- ---------- Permisos por fila ----------

alter table superadmins enable row level security;
alter table barberias enable row level security;
alter table documentos enable row level security;
alter table revisiones enable row level security;
alter table barberos enable row level security;
alter table servicios enable row level security;
alter table afiliaciones enable row level security;
alter table citas enable row level security;
alter table lista_espera enable row level security;
alter table notificaciones enable row level security;

drop policy if exists "ver superadmins" on superadmins;
create policy "ver superadmins" on superadmins for select using (email = bar_email() or bar_es_super());
drop policy if exists "editar superadmins" on superadmins;
create policy "editar superadmins" on superadmins for all using (bar_es_super()) with check (bar_es_super());

drop policy if exists "ver barberias" on barberias;
create policy "ver barberias" on barberias for select using (bar_puede_ver(id));
drop policy if exists "crear barberia" on barberias;
create policy "crear barberia" on barberias for insert to authenticated with check (bar_email() <> '');
drop policy if exists "editar barberia" on barberias;
create policy "editar barberia" on barberias for update using (dueno_email = bar_email() or bar_es_super());
drop policy if exists "borrar barberia" on barberias;
create policy "borrar barberia" on barberias for delete using (bar_es_super() or (dueno_email = bar_email() and estado = 'borrador'));

drop policy if exists "ver documentos" on documentos;
create policy "ver documentos" on documentos for select using (bar_es_super() or bar_es_dueno(barberia_id));
drop policy if exists "subir documentos" on documentos;
create policy "subir documentos" on documentos for insert with check (bar_editable(barberia_id));
drop policy if exists "borrar documentos" on documentos;
create policy "borrar documentos" on documentos for delete using (bar_editable(barberia_id));

drop policy if exists "ver revisiones" on revisiones;
create policy "ver revisiones" on revisiones for select using (bar_es_super() or bar_es_dueno(barberia_id));

drop policy if exists "ver barberos" on barberos;
create policy "ver barberos" on barberos for select using (bar_puede_ver(barberia_id));
drop policy if exists "editar barberos" on barberos;
create policy "editar barberos" on barberos for all using (bar_es_dueno(barberia_id)) with check (bar_es_dueno(barberia_id));

drop policy if exists "ver servicios" on servicios;
create policy "ver servicios" on servicios for select using (bar_puede_ver(barberia_id));
drop policy if exists "editar servicios" on servicios;
create policy "editar servicios" on servicios for all using (bar_es_dueno(barberia_id)) with check (bar_es_dueno(barberia_id));

drop policy if exists "ver afiliaciones" on afiliaciones;
create policy "ver afiliaciones" on afiliaciones for select
  using (cliente_email = bar_email() or bar_es_dueno(barberia_id) or bar_es_barbero(barberia_id));
drop policy if exists "borrar afiliaciones" on afiliaciones;
create policy "borrar afiliaciones" on afiliaciones for delete using (cliente_email = bar_email() or bar_es_dueno(barberia_id));

-- Las citas se crean, cancelan y marcan sólo con bar_reservar, bar_cancelar y bar_marcar.
drop policy if exists "ver citas" on citas;
create policy "ver citas" on citas for select
  using (cliente_email = bar_email() or bar_es_dueno(barberia_id) or bar_es_su_barbero(barbero_id));

drop policy if exists "ver espera" on lista_espera;
create policy "ver espera" on lista_espera for select using (cliente_email = bar_email() or bar_es_dueno(barberia_id));
drop policy if exists "anotarse espera" on lista_espera;
create policy "anotarse espera" on lista_espera for insert to authenticated with check (bar_es_afiliado(barberia_id));
drop policy if exists "salir espera" on lista_espera;
create policy "salir espera" on lista_espera for delete using (cliente_email = bar_email() or bar_es_dueno(barberia_id));

drop policy if exists "ver notificaciones" on notificaciones;
create policy "ver notificaciones" on notificaciones for select using (email = bar_email());
drop policy if exists "leer notificaciones" on notificaciones;
create policy "leer notificaciones" on notificaciones for update using (email = bar_email()) with check (email = bar_email());
drop policy if exists "borrar notificaciones" on notificaciones;
create policy "borrar notificaciones" on notificaciones for delete using (email = bar_email());

-- ---------- Revisión de barberías ----------

create or replace function bar_enviar(p_barberia uuid) returns barberias
language plpgsql security definer set search_path = public as $$
declare b barberias;
begin
  select * into b from barberias where id = p_barberia for update;
  if b.id is null or b.dueno_email <> bar_email() then raise exception 'No tienes permiso para hacer eso.'; end if;
  if b.estado not in ('borrador', 'correccion') then raise exception 'Esta barbería ya fue enviada.'; end if;
  perform set_config('bar.interno', '1', true);
  update barberias set estado = 'en_revision', motivo = null, enviada_at = now() where id = b.id returning * into b;
  insert into revisiones (barberia_id, estado) values (b.id, 'en_revision');
  perform bar_notificar(s.email, b.id, 'revision', 'Nueva barbería para revisar', b.nombre || ' envió sus documentos.', '#revision/' || b.id)
    from superadmins s;
  perform set_config('bar.interno', '', true);
  return b;
end $$;

create or replace function bar_decidir(p_barberia uuid, p_estado text, p_motivo text) returns barberias
language plpgsql security definer set search_path = public as $$
declare b barberias; v_motivo text := nullif(trim(coalesce(p_motivo, '')), ''); v_txt text;
begin
  if not bar_es_super() then raise exception 'No tienes permiso para hacer eso.'; end if;
  select * into b from barberias where id = p_barberia for update;
  if b.id is null then raise exception 'Esa barbería no existe.'; end if;
  if not ((b.estado = 'en_revision' and p_estado in ('aprobada', 'correccion', 'rechazada'))
       or (b.estado = 'aprobada' and p_estado = 'suspendida')
       or (b.estado = 'suspendida' and p_estado = 'aprobada')) then
    raise exception 'No se puede pasar de % a %.', b.estado, p_estado;
  end if;
  if p_estado <> 'aprobada' and v_motivo is null then raise exception 'Escribe el motivo para el dueño.'; end if;
  perform set_config('bar.interno', '1', true);
  update barberias set estado = p_estado, motivo = v_motivo where id = b.id returning * into b;
  insert into revisiones (barberia_id, estado, motivo) values (b.id, p_estado, v_motivo);
  v_txt := case p_estado when 'aprobada' then '✅ ' || b.nombre || ': aprobada'
                         when 'correccion' then '✏️ ' || b.nombre || ': requiere corrección'
                         when 'rechazada' then '⛔ ' || b.nombre || ': rechazada'
                         else '⏸️ ' || b.nombre || ': suspendida' end;
  perform bar_notificar(b.dueno_email, b.id, 'revision', v_txt,
    coalesce(v_motivo, '¡Ya puedes invitar a tus clientes y recibir citas!'), '#b/' || b.id || '/datos');
  perform set_config('bar.interno', '', true);
  return b;
end $$;

create or replace function bar_revisar_documento(p_documento uuid, p_estado text, p_observacion text) returns documentos
language plpgsql security definer set search_path = public as $$
declare d documentos; v_obs text := nullif(trim(coalesce(p_observacion, '')), '');
begin
  if not bar_es_super() then raise exception 'No tienes permiso para hacer eso.'; end if;
  if p_estado not in ('pendiente', 'aceptado', 'rechazado') then raise exception 'Estado no válido.'; end if;
  if p_estado = 'rechazado' and v_obs is null then raise exception 'Escribe qué está mal en el documento.'; end if;
  perform set_config('bar.interno', '1', true);
  update documentos set estado = p_estado, observacion = v_obs where id = p_documento returning * into d;
  perform set_config('bar.interno', '', true);
  return d;
end $$;

create or replace function bar_nuevo_codigo(p_barberia uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not bar_es_dueno(p_barberia) then raise exception 'No tienes permiso para hacer eso.'; end if;
  perform set_config('bar.interno', '1', true);
  update barberias set codigo = bar_codigo() where id = p_barberia returning codigo into v;
  perform set_config('bar.interno', '', true);
  return v;
end $$;

-- ---------- Clientes ----------

-- Lo que ve quien abre un enlace de invitación (aunque todavía no haya entrado).
create or replace function bar_invitacion(p_codigo text)
returns table (id uuid, nombre text, direccion text, ya_afiliado boolean)
language sql stable security definer set search_path = public as $$
  select b.id, b.nombre, b.direccion, bar_es_afiliado(b.id) from barberias b
  where b.codigo = upper(trim(p_codigo)) and b.estado = 'aprobada'
$$;

create or replace function bar_unirme(p_codigo text, p_nombre text, p_telefono text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b barberias; v_nuevo boolean;
begin
  if bar_email() = '' then raise exception 'Primero entra con tu correo.'; end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then raise exception 'Escribe tu nombre.'; end if;
  select * into b from barberias where codigo = upper(trim(p_codigo)) and estado = 'aprobada';
  if b.id is null then raise exception 'Ese código no existe o la barbería no está disponible.'; end if;
  v_nuevo := not bar_es_afiliado(b.id);
  insert into afiliaciones (barberia_id, cliente_email, nombre, telefono) values (b.id, bar_email(), trim(p_nombre), p_telefono)
  on conflict (barberia_id, cliente_email) do update set nombre = excluded.nombre, telefono = excluded.telefono;
  if v_nuevo then
    perform bar_notificar(b.dueno_email, b.id, 'cliente', 'Nuevo cliente', trim(p_nombre) || ' se unió a ' || b.nombre || '.', '#b/' || b.id || '/clientes');
  end if;
  return b.id;
end $$;

-- ---------- Citas ----------

-- Horas ocupadas de una barbería, sin datos de los clientes.
create or replace function bar_ocupados(p_barberia uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (barbero_id uuid, inicio timestamptz, fin timestamptz, estado text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not bar_puede_ver(p_barberia) then raise exception 'No tienes permiso para hacer eso.'; end if;
  return query select c.barbero_id, c.inicio, c.fin, c.estado from citas c
    where c.barberia_id = p_barberia and c.estado in ('reservada', 'completada') and c.inicio < p_hasta and c.fin > p_desde;
end $$;

create or replace function bar_reservar(p_barberia uuid, p_barbero uuid, p_servicio uuid, p_inicio timestamptz,
  p_cliente_email text, p_cliente_nombre text, p_nota text) returns citas
language plpgsql security definer set search_path = public as $$
declare
  b barberias; br barberos; s servicios; c citas;
  v_staff boolean; v_email text; v_nombre text; v_ini timestamp; v_fin timestamp;
begin
  select * into b from barberias where id = p_barberia;
  if b.id is null then raise exception 'No tienes permiso para hacer eso.'; end if;
  v_staff := bar_es_dueno(b.id) or bar_es_barbero(b.id);
  if not v_staff and not bar_es_afiliado(b.id) then raise exception 'No tienes permiso para hacer eso.'; end if;
  if b.estado <> 'aprobada' then raise exception 'La barbería no está habilitada para recibir citas.'; end if;
  select * into s from servicios where id = p_servicio and barberia_id = b.id and activo;
  if s.id is null then raise exception 'Elige un servicio.'; end if;
  select * into br from barberos where id = p_barbero and barberia_id = b.id and activo;
  if br.id is null then raise exception 'Elige un barbero.'; end if;
  if p_inicio <= now() then raise exception 'Esa hora ya pasó.'; end if;

  v_ini := p_inicio at time zone b.zona_horaria;
  v_fin := v_ini + make_interval(mins => s.duracion_min);
  if v_fin::date <> v_ini::date or not exists (
    select 1 from jsonb_array_elements(coalesce(br.horario -> extract(isodow from v_ini)::int::text, '[]'::jsonb)) f
    where (f ->> 0)::time <= v_ini::time and v_fin::time <= (f ->> 1)::time
  ) then
    raise exception '% no atiende a esa hora.', br.nombre;
  end if;

  if v_staff then
    v_email := nullif(lower(trim(coalesce(p_cliente_email, ''))), '');
  else
    v_email := bar_email();
  end if;
  v_nombre := coalesce((select nombre from afiliaciones where barberia_id = b.id and cliente_email = v_email),
                       nullif(trim(coalesce(p_cliente_nombre, '')), ''));
  if v_nombre is null then raise exception 'Escribe el nombre del cliente.'; end if;

  begin
    insert into citas (barberia_id, barbero_id, servicio_id, servicio_nombre, cliente_email, cliente_nombre, inicio, fin, nota)
    values (b.id, br.id, s.id, s.nombre, v_email, v_nombre, p_inicio, p_inicio + make_interval(mins => s.duracion_min),
            nullif(trim(coalesce(p_nota, '')), ''))
    returning * into c;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar. Elige otro.';
  end;

  if v_email is not null then
    update lista_espera set estado = 'atendida'
    where barberia_id = b.id and cliente_email = v_email and fecha = v_ini::date and estado = 'esperando';
  end if;
  if not v_staff then
    perform bar_notificar(b.dueno_email, b.id, 'cita', '📅 Nueva cita',
      v_nombre || ' reservó ' || s.nombre || ' el ' || bar_texto_cita(c, b.zona_horaria) || '.', '#b/' || b.id || '/agenda/' || v_ini::date);
    if br.email is not null and br.email <> b.dueno_email then
      perform bar_notificar(br.email, b.id, 'cita', '📅 Nueva cita',
        v_nombre || ' reservó ' || s.nombre || ' el ' || bar_texto_cita(c, b.zona_horaria) || '.', '#agenda');
    end if;
  elsif v_email is not null and v_email <> bar_email() then
    perform bar_notificar(v_email, b.id, 'cita', '📅 Te agendaron una cita',
      s.nombre || ' en ' || b.nombre || ' el ' || bar_texto_cita(c, b.zona_horaria) || '.', '#citas');
  end if;
  return c;
end $$;

-- El cliente cancela hasta cancelar_horas antes; la barbería, siempre que no haya empezado.
-- Al liberarse el horario se avisa a la lista de espera de ese día (el primero que reserva se lo queda).
create or replace function bar_cancelar(p_cita uuid, p_motivo text) returns citas
language plpgsql security definer set search_path = public as $$
declare
  c citas; b barberias; br barberos; e lista_espera;
  v_staff boolean; v_cuando text; v_ini timestamp; v_fin timestamp;
begin
  select * into c from citas where id = p_cita for update;
  if c.id is null then raise exception 'No tienes permiso para hacer eso.'; end if;
  select * into b from barberias where id = c.barberia_id;
  select * into br from barberos where id = c.barbero_id;
  v_staff := b.dueno_email = bar_email() or br.email = bar_email();
  if not v_staff and coalesce(c.cliente_email, '') <> bar_email() then raise exception 'No tienes permiso para hacer eso.'; end if;
  if c.estado <> 'reservada' or c.inicio <= now() then raise exception 'Esta cita ya no se puede cancelar.'; end if;
  if not v_staff and c.inicio - now() < make_interval(secs => b.cancelar_horas * 3600) then
    raise exception 'Sólo se puede cancelar hasta % h antes. Comunícate con la barbería.', trim_scale(b.cancelar_horas);
  end if;

  update citas set estado = 'cancelada', cancelada_por = bar_email(), motivo_cancelacion = nullif(trim(coalesce(p_motivo, '')), '')
  where id = c.id returning * into c;
  v_cuando := bar_texto_cita(c, b.zona_horaria);
  v_ini := c.inicio at time zone b.zona_horaria;
  v_fin := c.fin at time zone b.zona_horaria;

  if v_staff and c.cliente_email is not null and c.cliente_email <> bar_email() then
    perform bar_notificar(c.cliente_email, b.id, 'cita', '❌ Tu cita fue cancelada',
      b.nombre || ' canceló tu cita del ' || v_cuando || '.' || coalesce(' Motivo: ' || c.motivo_cancelacion, ''), '#reservar/' || b.id);
  end if;
  if not v_staff then
    perform bar_notificar(b.dueno_email, b.id, 'cita', '❌ Cita cancelada',
      c.cliente_nombre || ' canceló su cita del ' || v_cuando || '.', '#b/' || b.id || '/agenda/' || v_ini::date);
    if br.email is not null and br.email <> b.dueno_email then
      perform bar_notificar(br.email, b.id, 'cita', '❌ Cita cancelada', c.cliente_nombre || ' canceló su cita del ' || v_cuando || '.', '#agenda');
    end if;
  end if;

  for e in
    select * from lista_espera l
    where l.barberia_id = b.id and l.estado = 'esperando' and l.fecha = v_ini::date
      and (l.barbero_id is null or l.barbero_id = c.barbero_id)
      and l.cliente_email is distinct from c.cliente_email
      and (l.desde is null or v_fin::time > l.desde or v_fin::date > v_ini::date)
      and (l.hasta is null or v_ini::time < l.hasta)
    order by l.created_at
  loop
    update lista_espera set avisos = avisos + 1 where id = e.id;
    perform bar_notificar(e.cliente_email, b.id, 'espera', '🔔 ¡Se liberó un horario!',
      'En ' || b.nombre || ' el ' || v_cuando || '. El primero que reserva se lo queda.', '#reservar/' || b.id || '/' || e.fecha);
  end loop;
  return c;
end $$;

create or replace function bar_marcar(p_cita uuid, p_estado text) returns citas
language plpgsql security definer set search_path = public as $$
declare c citas;
begin
  select * into c from citas where id = p_cita for update;
  if c.id is null or not (bar_es_dueno(c.barberia_id) or bar_es_su_barbero(c.barbero_id)) then
    raise exception 'No tienes permiso para hacer eso.';
  end if;
  if p_estado not in ('reservada', 'completada', 'no_asistio') or c.estado = 'cancelada' then
    raise exception 'No se puede cambiar esa cita.';
  end if;
  update citas set estado = p_estado where id = c.id returning * into c;
  return c;
end $$;

-- ---------- Documentos (fotos y PDF) ----------

insert into storage.buckets (id, name, public) values ('barberia-documentos', 'barberia-documentos', false)
on conflict (id) do nothing;

drop policy if exists "barberia documentos ver" on storage.objects;
create policy "barberia documentos ver" on storage.objects for select to authenticated
  using (bucket_id = 'barberia-documentos' and (bar_es_super() or bar_es_dueno(bar_de_ruta(name))));
drop policy if exists "barberia documentos subir" on storage.objects;
create policy "barberia documentos subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'barberia-documentos' and bar_editable(bar_de_ruta(name)));
drop policy if exists "barberia documentos borrar" on storage.objects;
create policy "barberia documentos borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'barberia-documentos' and bar_editable(bar_de_ruta(name)));
