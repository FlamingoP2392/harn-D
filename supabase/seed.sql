-- Run AFTER the initial migration in Supabase SQL Editor.
-- Create/sign in to a test account first, then replace the UUID below with
-- that account's Authentication > Users ID. No password or service key is needed.
-- Each run creates one new sample bill. The entire operation is transactional.
begin;
select set_config('request.jwt.claim.sub', 'REPLACE_WITH_AUTH_USER_UUID', true);
do $$ begin
  if current_setting('request.jwt.claim.sub')='REPLACE_WITH_AUTH_USER_UUID' then
    raise exception 'Replace REPLACE_WITH_AUTH_USER_UUID with an existing Auth user ID before running seed.sql';
  end if;
  if not exists(select 1 from auth.users where id=auth.uid()) then
    raise exception 'The selected Auth user does not exist';
  end if;
end $$;
set local role authenticated;
insert into public.profiles(id,display_name,promptpay_id)
values(auth.uid(),'ผู้ใช้ทดสอบ','') on conflict(id) do nothing;
with ids as (
  select gen_random_uuid() as bill, gen_random_uuid() as a,gen_random_uuid() as b,gen_random_uuid() as c,gen_random_uuid() as item
), payload as (
  select jsonb_build_object(
    'id',bill,'title','มื้อทดสอบ · 100 บาท หาร 3 คน','date',current_date::text,
    'people',jsonb_build_array(
      jsonb_build_object('id',a,'name','คุณ','friendId',null),
      jsonb_build_object('id',b,'name','เมย์','friendId',null),
      jsonb_build_object('id',c,'name','ต้น','friendId',null)),
    'items',jsonb_build_array(jsonb_build_object('id',item,'name','อาหาร','amount','100','mode','equal','participants',jsonb_build_array(
      jsonb_build_object('personId',a,'weight','1','fixed','0'),
      jsonb_build_object('personId',b,'weight','1','fixed','0'),
      jsonb_build_object('personId',c,'weight','1','fixed','0')))),
    'service','10','vat','7','vatIncluded',false,'discount','0',
    'paidBy',a,'paid','[]'::jsonb,
    'updatedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) as draft from ids
)
select public.save_bill(draft,null) as seeded_bill from payload;
commit;
-- Expected bill total: 117.70 THB. No share link or PromptPay recipient is created.
