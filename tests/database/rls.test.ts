import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFile} from 'node:fs/promises';
import {sampleBill} from '../../src/lib/draft';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
let db:PGlite;const a=sampleBill();const b=sampleBill();a.paidBy=a.people[0]!.id;b.paidBy=b.people[0]!.id;
async function asUser(id:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function save(draft:typeof a){const existing=(await db.query<{time:string}>("select draft->>'updatedAt' as time from public.bills where id=$1",[draft.id])).rows[0]?.time??null;return db.query('select public.save_bill($1::jsonb,$2)',[JSON.stringify(draft),existing]);}
beforeAll(async()=>{
 db=new PGlite({extensions:{pgcrypto}});
 await db.exec("create role authenticated nologin; create role anon nologin; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;");
 await db.query('insert into auth.users(id) values($1),($2)',[A,B]);
 await db.exec(await readFile(new URL('../../supabase/migrations/202610180001_initial.sql',import.meta.url),'utf8'));
 await asUser(A);await save(a);await db.query("insert into public.profiles(id,display_name,promptpay_id) values($1,'A','0812345678')",[A]);
 await asUser(B);await save(b);await db.query("insert into public.profiles(id,display_name) values($1,'B')",[B]);
},60000);
afterAll(async()=>{await db?.close();});
describe('actual PostgreSQL RLS with authenticated and anonymous roles',()=>{
 it('A and B each see only their own bill and all child tables',async()=>{
  for(const [user,draft] of [[A,a],[B,b]] as const){await asUser(user);const rows=await db.query<{id:string}>('select id from public.bills');expect(rows.rows.map(r=>r.id)).toEqual([draft.id]);for(const table of ['people','items','item_participants','payments']){const result=await db.query<{bill_id:string}>('select distinct bill_id from public.'+table);expect(result.rows.map(r=>r.bill_id)).toEqual([draft.id]);}expect((await db.query<{id:string}>('select id from public.profiles')).rows.map(r=>r.id)).toEqual([user]);}
 });
 it('A cannot update, delete or overwrite B bills via the RPC',async()=>{await asUser(A);expect((await db.query('update public.bills set title=$1 where id=$2 returning id',['hacked',b.id])).rows).toHaveLength(0);expect((await db.query('delete from public.bills where id=$1 returning id',[b.id])).rows).toHaveLength(0);await expect(save({...b,title:'hacked'})).rejects.toThrow();await asUser(B);expect((await db.query<{title:string}>('select title from public.bills where id=$1',[b.id])).rows[0]?.title).toBe(b.title);});
 it('cannot insert a child or payment into another user bill',async()=>{await asUser(A);await expect(db.query('insert into public.people(id,bill_id,name,position) values($1,$2,$3,99)',[crypto.randomUUID(),b.id,'hacked'])).rejects.toThrow();await expect(db.query('select public.mark_payment($1,$2,true)',[b.id,b.people[1]!.id])).rejects.toThrow();});
 it('validates direct RPC inputs and rolls back incomplete writes',async()=>{await asUser(A);const invalid={...a,title:'bad',items:a.items.map((i,index)=>index===0?{...i,participants:[]}:i)};await expect(save(invalid)).rejects.toThrow('participants');await expect(save({...a,service:'100.01'})).rejects.toThrow();await expect(save({...a,discount:'99999999'})).rejects.toThrow();expect((await db.query<{title:string}>('select title from public.bills where id=$1',[a.id])).rows[0]?.title).toBe(a.title);});
 it('preserves payer references when an existing bill is edited',async()=>{await asUser(A);await save({...a,title:'edited'});await save(a);expect((await db.query<{paid_by:string}>('select paid_by from public.bills where id=$1',[a.id])).rows[0]?.paid_by).toBe(a.paidBy);});
 it('rejects an outdated save instead of overwriting another change',async()=>{await asUser(A);const before=(await db.query<{time:string}>("select draft->>'updatedAt' as time from public.bills where id=$1",[a.id])).rows[0]!.time;await db.query('select public.mark_payment($1,$2,true)',[a.id,a.people[1]!.id]);await expect(db.query('select public.save_bill($1::jsonb,$2)',[JSON.stringify(a),before])).rejects.toThrow('changed on another device');await save(a);});
 it('payment update changes only the owned bill',async()=>{await asUser(A);const person=a.people[1]!.id;await db.query('select public.mark_payment($1,$2,true)',[a.id,person]);const row=(await db.query<{draft:{paid:string[]}}>('select draft from public.bills where id=$1',[a.id])).rows[0];expect(row?.draft.paid).toEqual([person]);await db.query('select public.mark_payment($1,$2,false)',[a.id,person]);});
 it('shares only through a revocable read RPC and denies anonymous table reads',async()=>{await asUser(A);const token=(await db.query<{token:string}>('select public.create_share_link($1) as token',[a.id])).rows[0]!.token;expect(token).toMatch(/^[0-9a-f]{64}$/);await asUser(B);await expect(db.query('select public.create_share_link($1)',[a.id])).rejects.toThrow();await expect(db.query('select public.revoke_share_link($1)',[a.id])).rejects.toThrow();await db.exec('reset role;set role anon');await expect(db.query('select * from public.bills')).rejects.toThrow();await expect(db.query('select public.save_bill($1::jsonb,null)',[JSON.stringify(a)])).rejects.toThrow();const shared=(await db.query<{data:{bill:{id:string;people:Record<string,unknown>[]};promptpayId:string}}>('select public.read_shared_bill($1) as data',[token])).rows[0]!.data;expect(shared.bill.id).toBe(a.id);expect(shared.promptpayId).toBe('0812345678');expect(shared.bill.people.every(p=>!('friendId' in p))).toBe(true);await asUser(A);await db.query('select public.revoke_share_link($1)',[a.id]);await db.exec('reset role;set role anon');expect((await db.query<{data:unknown}>('select public.read_shared_bill($1) as data',[token])).rows[0]?.data).toBeNull();});
 it('deleting a saved friend detaches editable drafts and permits the next save',async()=>{
  await asUser(A);const id=(await db.query<{id:string}>("insert into public.friends(owner_id,name) values($1,'friend to remove') returning id",[A])).rows[0]!.id;
  await save({...a,people:a.people.map((p,i)=>i===1?{...p,friendId:id}:p)});
  const before=(await db.query<{draft:typeof a}>('select draft from public.bills where id=$1',[a.id])).rows[0]!.draft;
  await db.query('delete from public.friends where id=$1',[id]);
  const after=(await db.query<{draft:typeof a}>('select draft from public.bills where id=$1',[a.id])).rows[0]!.draft;
  expect(after.people[1]?.friendId).toBeNull();expect(after.updatedAt>before.updatedAt).toBe(true);await save(after);
 });
 it('blocks cross-bill participant references and other-user friends',async()=>{await asUser(B);const friend=(await db.query<{id:string}>("insert into public.friends(owner_id,name) values($1,'B friend') returning id",[B])).rows[0]!.id;await asUser(A);await expect(db.query('insert into public.item_participants(item_id,person_id,bill_id,weight) values($1,$2,$3,1)',[a.items[0]!.id,b.people[0]!.id,a.id])).rejects.toThrow();await expect(save({...a,people:a.people.map((p,i)=>i===0?{...p,friendId:friend}:p)})).rejects.toThrow();});
 it('seed script works for an existing authenticated account',async()=>{
  await db.exec('reset role');const sql=(await readFile(new URL('../../supabase/seed.sql',import.meta.url),'utf8')).replace("'REPLACE_WITH_AUTH_USER_UUID', true", "'"+A+"', true");await db.exec(sql);await asUser(A);
  const rows=await db.query<{title:string}>("select title from public.bills where title like 'มื้อทดสอบ%'");expect(rows.rows).toHaveLength(1);
 });
});
