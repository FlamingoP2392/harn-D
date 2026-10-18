-- Split bills: canonical JSON for editing plus relational projections for reporting.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name)<=80),
  promptpay_id text not null default '' check (promptpay_id='' or promptpay_id ~ '^0[0-9]{9}$' or promptpay_id ~ '^[0-9]{13}$')
);
create table public.friends (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 1 and 60)
);
create index friends_owner_idx on public.friends(owner_id);
create table public.bills (
  id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 1 and 120), bill_date date not null,
  service_bps integer not null check(service_bps between 0 and 10000), vat_bps integer not null check(vat_bps between 0 and 10000),
  vat_included boolean not null, discount_satang bigint not null check(discount_satang between 0 and 99999999999),
  paid_by uuid, draft jsonb not null, share_hash text unique, share_promptpay text not null default '',
  updated_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(id,owner_id)
);
create index bills_owner_date_idx on public.bills(owner_id,bill_date desc);
create table public.people (
  id uuid primary key, bill_id uuid not null references public.bills(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 1 and 60), position integer not null check(position>=0),
  friend_id uuid references public.friends(id) on delete set null,
  unique(id,bill_id), unique(bill_id,position)
);
create index people_bill_idx on public.people(bill_id);
create index people_friend_idx on public.people(friend_id);
create table public.items (
  id uuid primary key, bill_id uuid not null references public.bills(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 1 and 120), amount_satang bigint not null check(amount_satang between 0 and 99999999999),
  mode text not null check(mode in ('equal','weight','fixed')), position integer not null check(position>=0), unique(id,bill_id)
);
create index items_bill_idx on public.items(bill_id);
create table public.item_participants (
  item_id uuid not null, person_id uuid not null, bill_id uuid not null,
  weight bigint not null check(weight between 1 and 999999999999), fixed_amount_satang bigint check(fixed_amount_satang between 0 and 99999999999),
  primary key(item_id,person_id),
  foreign key(item_id,bill_id) references public.items(id,bill_id) on delete cascade,
  foreign key(person_id,bill_id) references public.people(id,bill_id) on delete cascade
);
create index participants_person_idx on public.item_participants(person_id);
create index participants_bill_idx on public.item_participants(bill_id);
create table public.payments (
  bill_id uuid not null, person_id uuid not null, paid boolean not null default false, updated_at timestamptz not null default now(),
  primary key(bill_id,person_id), foreign key(person_id,bill_id) references public.people(id,bill_id) on delete cascade
);
create index payments_person_idx on public.payments(person_id);
alter table public.bills add constraint bills_payer_fk foreign key(paid_by,id) references public.people(id,bill_id) deferrable initially deferred;

alter table public.profiles enable row level security;
alter table public.friends enable row level security;
alter table public.bills enable row level security;
alter table public.people enable row level security;
alter table public.items enable row level security;
alter table public.item_participants enable row level security;
alter table public.payments enable row level security;
create policy own_profile on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy own_friends on public.friends for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy own_bills on public.bills for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy own_people on public.people for all to authenticated using(exists(select 1 from public.bills b where b.id=bill_id and b.owner_id=auth.uid())) with check(exists(select 1 from public.bills b where b.id=bill_id and b.owner_id=auth.uid()) and (friend_id is null or exists(select 1 from public.friends f where f.id=friend_id and f.owner_id=auth.uid())));
create policy own_items on public.items for all to authenticated using(exists(select 1 from public.bills b where b.id=bill_id and b.owner_id=auth.uid())) with check(exists(select 1 from public.bills b where b.id=bill_id and b.owner_id=auth.uid()));
create policy own_participants on public.item_participants for all to authenticated using(exists(select 1 from public.bills b where b.id=bill_id and b.owner_id=auth.uid())) with check(exists(select 1 from public.bills b where b.id=bill_id and b.owner_id=auth.uid()));
create policy own_payments on public.payments for all to authenticated using(exists(select 1 from public.bills b where b.id=bill_id and b.owner_id=auth.uid())) with check(exists(select 1 from public.bills b where b.id=bill_id and b.owner_id=auth.uid()));
grant select,insert,update,delete on public.profiles,public.friends,public.bills,public.people,public.items,public.item_participants,public.payments to authenticated;
revoke all on public.profiles,public.friends,public.bills,public.people,public.items,public.item_participants,public.payments from anon;

create function public.decimal_scaled(value text, places integer) returns bigint language plpgsql immutable set search_path='' as $$
begin
  if places not between 0 and 6 or value is null or char_length(value)>24 or value !~ ('^[0-9]+([.][0-9]{1,'||places::text||'})?$') then raise exception 'Invalid decimal input'; end if;
  return (split_part(value,'.',1)::bigint * (('1'||repeat('0',places))::bigint)) + coalesce(nullif(rpad(split_part(value,'.',2),places,'0'),''),'0')::bigint;
end $$;

-- Keep the editable JSON in sync with the nullable friend foreign key.
create function public.detach_deleted_friend() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  update public.bills b set
    draft=jsonb_set(jsonb_set(b.draft,'{people}',(select jsonb_agg(case when p->>'friendId'=old.id::text then jsonb_set(p,'{friendId}','null'::jsonb) else p end order by ord) from jsonb_array_elements(b.draft->'people') with ordinality as people(p,ord))),'{updatedAt}',to_jsonb(to_char(greatest(clock_timestamp(),(b.draft->>'updatedAt')::timestamptz+interval '1 millisecond') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),updated_at=now()
  where b.owner_id=auth.uid() and b.draft->'people' @> jsonb_build_array(jsonb_build_object('friendId',old.id::text));
  return old;
end $$;
create trigger friend_deleted before delete on public.friends for each row execute function public.detach_deleted_friend();
revoke all on function public.detach_deleted_friend() from public;

-- INVOKER preserves RLS even when called directly via PostgREST.
create function public.save_bill(payload jsonb, expected_updated_at text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare bid uuid; person jsonb; item jsonb; participant jsonb; paid_person jsonb; pos integer; itempos integer; subtotal bigint; fees bigint; taxes bigint; disc bigint; fixed_sum bigint; existing_time text; saved jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if pg_column_size(payload)>2000000 then raise exception 'Bill too large'; end if;
  bid := (payload->>'id')::uuid;
  select draft->>'updatedAt' into existing_time from public.bills where id=bid for update;
  if found and existing_time is distinct from expected_updated_at then raise exception 'Bill changed on another device' using errcode='40001'; end if;
  payload:=jsonb_set(payload,'{updatedAt}',to_jsonb(to_char(greatest(clock_timestamp(),coalesce(existing_time::timestamptz,'-infinity'::timestamptz)+interval '1 millisecond') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  if jsonb_array_length(payload->'people')<1 or jsonb_array_length(payload->'items')<1 then raise exception 'People and items required'; end if;
  subtotal:=0;
  for item in select value from jsonb_array_elements(payload->'items') loop
    subtotal:=subtotal+public.decimal_scaled(item->>'amount',2);
    if jsonb_array_length(item->'participants')<1 then raise exception 'Item needs participants'; end if;
    if item->>'mode'='fixed' then
      select sum(public.decimal_scaled(value->>'fixed',2)) into fixed_sum from jsonb_array_elements(item->'participants');
      if fixed_sum<>public.decimal_scaled(item->>'amount',2) then raise exception 'Fixed total mismatch'; end if;
    end if;
  end loop;
  fees:=floor((subtotal::numeric * public.decimal_scaled(payload->>'service',2) + 5000)/10000)::bigint;
  taxes:=floor(((case when (payload->>'vatIncluded')::boolean then fees else subtotal+fees end)::numeric * public.decimal_scaled(payload->>'vat',2)+5000)/10000)::bigint;
  disc:=public.decimal_scaled(payload->>'discount',2);
  if disc>subtotal+fees+taxes then raise exception 'Discount exceeds total'; end if;
  insert into public.bills(id,owner_id,title,bill_date,service_bps,vat_bps,vat_included,discount_satang,paid_by,draft)
  values(bid,auth.uid(),payload->>'title',(payload->>'date')::date,public.decimal_scaled(payload->>'service',2)::integer,public.decimal_scaled(payload->>'vat',2)::integer,(payload->>'vatIncluded')::boolean,disc,null,payload)
  on conflict(id) do update set title=excluded.title,bill_date=excluded.bill_date,service_bps=excluded.service_bps,vat_bps=excluded.vat_bps,vat_included=excluded.vat_included,discount_satang=excluded.discount_satang,paid_by=null,draft=excluded.draft,updated_at=now();
  delete from public.items where bill_id=bid;
  delete from public.people where bill_id=bid;
  pos:=0;
  for person in select value from jsonb_array_elements(payload->'people') loop
    insert into public.people(id,bill_id,name,position,friend_id) values((person->>'id')::uuid,bid,person->>'name',pos,(person->>'friendId')::uuid);
    pos:=pos+1;
    insert into public.payments(bill_id,person_id,paid) values(bid,(person->>'id')::uuid,(payload->'paid') ? (person->>'id'));
  end loop;
  for paid_person in select value from jsonb_array_elements(payload->'paid') loop
    if not exists(select 1 from public.people where bill_id=bid and id=(paid_person#>>'{}')::uuid) then raise exception 'Unknown payment person'; end if;
  end loop;
  itempos:=0;
  for item in select value from jsonb_array_elements(payload->'items') loop
    insert into public.items(id,bill_id,name,amount_satang,mode,position) values((item->>'id')::uuid,bid,item->>'name',public.decimal_scaled(item->>'amount',2),item->>'mode',itempos);
    itempos:=itempos+1;
    for participant in select value from jsonb_array_elements(item->'participants') loop
      insert into public.item_participants(item_id,person_id,bill_id,weight,fixed_amount_satang) values((item->>'id')::uuid,(participant->>'personId')::uuid,bid,public.decimal_scaled(participant->>'weight',6),public.decimal_scaled(participant->>'fixed',2));
    end loop;
  end loop;
  update public.bills set paid_by=(payload->>'paidBy')::uuid where id=bid;
  select draft into saved from public.bills where id=bid;
  return saved;
end $$;

create function public.mark_payment(target_bill uuid,target_person uuid,is_paid boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; previous_time text;
begin
  select draft->>'updatedAt' into previous_time from public.bills where id=target_bill and owner_id=auth.uid() for update;
  if not found then raise exception 'Bill not found'; end if;
  update public.payments set paid=is_paid,updated_at=now() where bill_id=target_bill and person_id=target_person;
  if not found then raise exception 'Person not found'; end if;
  update public.bills set draft=jsonb_set(jsonb_set(draft,'{paid}',coalesce((select jsonb_agg(person_id::text order by person_id) from public.payments where bill_id=target_bill and paid),'[]'::jsonb)),'{updatedAt}',to_jsonb(to_char(greatest(clock_timestamp(),previous_time::timestamptz+interval '1 millisecond') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),updated_at=now() where id=target_bill returning draft into saved;
  return saved;
end $$;

create function public.create_share_link(target_bill uuid) returns text language plpgsql security definer set search_path='' as $$
declare token text;
begin
  if not exists(select 1 from public.bills where id=target_bill and owner_id=auth.uid()) then raise exception 'Bill not found'; end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  update public.bills set share_hash=encode(extensions.digest(token,'sha256'),'hex'),share_promptpay=coalesce((select promptpay_id from public.profiles where id=auth.uid()),'') where id=target_bill and owner_id=auth.uid();
  return token;
end $$;
create function public.revoke_share_link(target_bill uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.bills where id=target_bill and owner_id=auth.uid()) then raise exception 'Bill not found'; end if;
  update public.bills set share_hash=null,share_promptpay='' where id=target_bill and owner_id=auth.uid();
end $$;
create function public.read_shared_bill(token text) returns jsonb language plpgsql security definer stable set search_path='' as $$
declare result jsonb;
begin
  if token !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object('bill',jsonb_set(draft,'{people}',(select jsonb_agg(p - 'friendId') from jsonb_array_elements(draft->'people') p)), 'promptpayId',share_promptpay)
  into result from public.bills where share_hash=encode(extensions.digest(token,'sha256'),'hex');
  return result;
end $$;
revoke all on function public.save_bill(jsonb,text),public.mark_payment(uuid,uuid,boolean),public.create_share_link(uuid),public.revoke_share_link(uuid),public.read_shared_bill(text),public.decimal_scaled(text,integer) from public;
grant execute on function public.save_bill(jsonb,text),public.mark_payment(uuid,uuid,boolean),public.create_share_link(uuid),public.revoke_share_link(uuid),public.decimal_scaled(text,integer) to authenticated;
grant execute on function public.read_shared_bill(text) to anon,authenticated;

-- Realtime only broadcasts rows permitted by the subscriber's RLS.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.bills;
  end if;
end $$;
