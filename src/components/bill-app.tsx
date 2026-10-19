'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Cloud, Coffee, CreditCard, Download, History, LayoutDashboard, Leaf, LoaderCircle, LogIn, LogOut, Menu, Moon, Plus, ReceiptText, Search, Settings2, Share2, ShieldCheck, Sparkles, Sun, Trash2, Users, UtensilsCrossed, Wallet, X } from 'lucide-react';
import { Summary, Avatar } from './summary';
import { Modal } from './modal';
import { useTerms } from './terms-provider';
import { calculateBill, settleBalances, type BillTotal } from '@/lib/split/calculate-bill';
import { baht } from '@/lib/money';
import { billSchema, toSplitBill, type BillDraft, type ItemDraft, profileSchema } from '@/lib/validation/bill';
import { localDate, newBill, readLocalBills, sampleBill, STORAGE_KEY, writeLocalBills, editableStorageSchema } from '@/lib/draft';
import { browserClient, supabaseConfigured } from '@/lib/supabase/browser';
import { promptpayPayload } from '@/lib/qr';

type Page = 'bill' | 'history' | 'friends' | 'dashboard';
type Dialog = 'login' | 'profile' | 'help' | 'import' | 'export' | null;
type Friend = { id:string; name:string };
const friendsResponse=z.object({friends:z.array(z.object({id:z.uuid(),name:z.string()}))});
const cloudResponse=z.object({bills:z.array(z.object({draft:billSchema}))});
const profileResponse=z.object({profile:z.object({display_name:z.string(),promptpay_id:z.string()}).nullable()});
async function api(url:string,method='GET',body?:unknown):Promise<unknown>{
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data:unknown=await response.json();
  if(!response.ok){const parsed=z.object({error:z.string()}).safeParse(data);throw new Error(parsed.success?parsed.data.error:'เชื่อมต่อไม่สำเร็จ');}
  return data;
}
function getCalculation(bill:BillDraft | null):{result:BillTotal|null;errors:string[]}{
  if(!bill)return {result:null,errors:[]};
  const parsed=billSchema.safeParse(bill);
  if(!parsed.success)return {result:null,errors:[...new Set(parsed.error.issues.map(e=>e.message))]};
  try{return {result:calculateBill(toSplitBill(parsed.data)),errors:[]};}catch(error){return {result:null,errors:[error instanceof Error?error.message:'ตรวจสอบข้อมูลบิลอีกครั้ง']};}
}
function ThaiDate({value}:{value:string}){return <>{new Date(value+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</>;}

export function BillApp(){
  const {openTerms}=useTerms();
  const [loginAccepted,setLoginAccepted]=useState(false);
  const [captchaToken,setCaptchaToken]=useState<string|null>(null);
  const turnstileRef=useRef<TurnstileInstance>(null);
  const turnstileSiteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [bill,setBill]=useState<BillDraft|null>(null);
  const [localBills,setLocalBills]=useState<BillDraft[]>([]);
  const [cloudBills,setCloudBills]=useState<BillDraft[]>([]);
  const [ready,setReady]=useState(false);
  const [storageBlocked,setStorageBlocked]=useState(false);
  const [storageError,setStorageError]=useState<string|null>(null);
  const [page,setPage]=useState<Page>('bill');
  const [dialog,setDialog]=useState<Dialog>(null);
  const [user,setUser]=useState<User|null>(null);
  const [authReady,setAuthReady]=useState(!supabaseConfigured);
  const [busy,setBusy]=useState(false);
  const [cloudLoading,setCloudLoading]=useState(false);
  const [notice,setNotice]=useState('');
  const [email,setEmail]=useState('');
  const [friendName,setFriendName]=useState('');
  const [friends,setFriends]=useState<Friend[]>([]);
  const [displayName,setDisplayName]=useState('');
  const [promptpayId,setPromptpayId]=useState('');
  const [search,setSearch]=useState('');
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [month,setMonth]=useState(localDate().slice(0,7));
  const [savedAt,setSavedAt]=useState('');
  const [shareUrl,setShareUrl]=useState('');
  const [mobileMenu,setMobileMenu]=useState(false);
  const [dark,setDark]=useState(false);
  const [exportUrl,setExportUrl]=useState('');
  const [exportBusy,setExportBusy]=useState(false);
  const [qr,setQr]=useState<{name:string;amount:bigint;image:string}|null>(null);
  const [confirmDelete,setConfirmDelete]=useState<{personId:string;orphanNames:string[]}|null>(null);
  const [pendingPayments,setPendingPayments]=useState<string[]>([]);
  const [importedIds,setImportedIds]=useState<string[]>([]);
  const [realtimeWarning,setRealtimeWarning]=useState(false);
  const exportRef=useRef<HTMLDivElement>(null);
  const billRef=useRef<BillDraft|null>(null);
  const importInput=useRef<HTMLInputElement>(null);
  const revision=useRef(0);
  const previousUser=useRef<string|null>(null);
  const paymentLock=useRef(false);
  const requestRevision=useRef(0);
  const cloudVersions=useRef(new Map<string,string>());
  const cloudRequest=useRef(0);
  const {result,errors}=useMemo(()=>getCalculation(bill),[bill]);
  useEffect(()=>{billRef.current=bill;},[bill]);
  useEffect(()=>{
    const stored=readLocalBills();setLocalBills(stored.bills);setStorageError(stored.error);setStorageBlocked(Boolean(stored.error));
    setBill(stored.bills.find(b=>b.id===stored.activeId)??stored.bills[0]??newBill());setReady(true);
    try{const enabled=localStorage.getItem('handi:theme')==='dark';setDark(enabled);document.documentElement.dataset.theme=enabled?'dark':'light';}catch{/* Theme preference is optional. */}
    if(new URLSearchParams(location.search).has('auth_error'))setNotice('เข้าสู่ระบบไม่สำเร็จ กรุณาขอลิงก์ใหม่');
    if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js').catch(()=>undefined);
  },[]);
  useEffect(()=>{
    if(!ready||!bill||storageBlocked||user||!authReady)return;
    const next=[bill,...localBills.filter(b=>b.id!==bill.id)];
    const timer=setTimeout(()=>{const error=writeLocalBills(next,bill.id);setStorageError(error);if(!error)setSavedAt(new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}));},350);
    return()=>clearTimeout(timer);
  },[bill,ready,localBills,storageBlocked,user,authReady]);
  useEffect(()=>{
    const persist=()=>{if(ready&&bill&&!storageBlocked&&!user&&authReady)writeLocalBills([bill,...localBills.filter(b=>b.id!==bill.id)],bill.id);};
    window.addEventListener('pagehide',persist);return()=>window.removeEventListener('pagehide',persist);
  },[bill,ready,localBills,storageBlocked,user,authReady]);
  useEffect(()=>{
    if(!supabaseConfigured)return;
    const client=browserClient();
    void client.auth.getUser().then(({data})=>{setUser(data.user);setAuthReady(true);}).catch(()=>{setAuthReady(true);setNotice('ตรวจสอบบัญชีไม่สำเร็จ ยังใช้โหมด guest ได้');});
    const {data}=client.auth.onAuthStateChange((_event,session)=>{setUser(session?.user??null);setAuthReady(true);});
    return()=>data.subscription.unsubscribe();
  },[]);
  const loadCloud=useCallback(async()=>{
    const account=previousUser.current;if(!account)return;
    const request=++cloudRequest.current;
    setCloudLoading(true);
    try{
      const [billsData,friendsData,profileData]=await Promise.all([api('/api/bills'),api('/api/friends'),api('/api/profile')]);
      if(previousUser.current!==account||request!==cloudRequest.current)return;
      const list=cloudResponse.parse(billsData).bills.map(row=>row.draft);setCloudBills(list);
      setFriends(friendsResponse.parse(friendsData).friends);
      const profile=profileResponse.parse(profileData).profile;
      if(profile){setDisplayName(profile.display_name);setPromptpayId(profile.promptpay_id);}
      const current=billRef.current;
      const latest=current&&list.find(b=>b.id===current.id);
      if(latest&&latest.updatedAt===current.updatedAt&&!cloudVersions.current.has(latest.id))cloudVersions.current.set(latest.id,latest.updatedAt);
      if(latest&&latest.updatedAt!==current.updatedAt&&latest.updatedAt!==cloudVersions.current.get(latest.id))setRealtimeWarning(true);
      return list;
    }catch(error){if(previousUser.current===account)setNotice(error instanceof Error?error.message:'โหลดข้อมูลไม่สำเร็จ');}finally{if(previousUser.current===account&&request===cloudRequest.current)setCloudLoading(false);}
  },[]);
  useEffect(()=>{
    if(!user){
      if(previousUser.current){const stored=readLocalBills();setBill(stored.bills.find(b=>b.id===stored.activeId)??stored.bills[0]??newBill());setLocalBills(stored.bills);setShareUrl('');setQr(null);setPage('bill');setSavedAt('');}
      previousUser.current=null;cloudVersions.current.clear();setCloudLoading(false);setBusy(false);setExportUrl('');setDialog(null);setPendingPayments([]);setRealtimeWarning(false);setImportedIds([]);setCloudBills([]);setFriends([]);setPromptpayId('');setDisplayName('');return;
    }
    if(previousUser.current&&previousUser.current!==user.id){cloudVersions.current.clear();setExportUrl('');setDialog(null);setBill(newBill());setCloudBills([]);setShareUrl('');setQr(null);}
    previousUser.current=user.id;
    void loadCloud();
    const client=browserClient();
    const channel=client.channel('my-bills-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'bills',filter:'owner_id=eq.'+user.id},()=>{void loadCloud();}).subscribe();
    return()=>{void client.removeChannel(channel);};
  },[user,loadCloud]);
  useEffect(()=>{if(dialog!=='login'){setLoginAccepted(false);setCaptchaToken(null);}},[dialog]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>()=>{if(exportUrl)URL.revokeObjectURL(exportUrl);},[exportUrl]);
  function update(change:(current:BillDraft)=>BillDraft){revision.current++;setShareUrl('');setBill(current=>current?{...change(current),updatedAt:new Date().toISOString()}:current);}
  function patchItem(id:string,change:Partial<ItemDraft>){update(current=>({...current,items:current.items.map(item=>item.id===id?{...item,...change}:item)}));}
  function rememberCurrent(){if(bill&&!user)setLocalBills(current=>[bill,...current.filter(b=>b.id!==bill.id)]);}
  function openBill(next:BillDraft){rememberCurrent();if(cloudBills.some(b=>b.id===next.id&&b.updatedAt===next.updatedAt))cloudVersions.current.set(next.id,next.updatedAt);else cloudVersions.current.delete(next.id);setBill(next);setPage('bill');setShareUrl('');setRealtimeWarning(false);revision.current++;}
  function createBill(template?:'dinner'|'bbq'|'trip'){openBill(template?sampleBill(template):newBill());setNotice(template?'เติมตัวอย่างให้แล้ว แก้ให้เป็นมื้อของคุณได้เลย':'สร้างบิลใหม่แล้ว');}
  function addPerson(friend?:Friend){
    if(!bill)return;
    if(!user&&bill.people.length>=4){setDialog('login');return;}
    update(current=>({...current,people:[...current.people,{id:crypto.randomUUID(),name:friend?.name??'เพื่อน '+current.people.length.toString(),friendId:friend?.id??null}]}));
  }
  function removePerson(id:string){
    if(!bill)return;
    if(bill.people.length<=1){setNotice('บิลต้องมีคนอย่างน้อย 1 คน');return;}
    const orphanNames=bill.items.filter(item=>item.participants.length===1&&item.participants[0]?.personId===id).map(item=>item.name||'รายการยังไม่มีชื่อ');
    setConfirmDelete({personId:id,orphanNames});
  }
  function confirmRemovePerson(){
    if(!confirmDelete)return;
    const id=confirmDelete.personId;
    update(current=>({...current,people:current.people.filter(p=>p.id!==id),items:current.items.map(item=>({...item,participants:item.participants.filter(p=>p.personId!==id)})),paid:current.paid.filter(p=>p!==id),paidBy:current.paidBy===id?null:current.paidBy}));setConfirmDelete(null);
  }
  function addItem(){if(!bill)return;update(current=>({...current,items:[...current.items,{id:crypto.randomUUID(),name:'',amount:'',mode:'equal',participants:current.people.map(p=>({personId:p.id,weight:'1',fixed:'0'}))}]}));}
  function toggleParticipant(item:ItemDraft,id:string){patchItem(item.id,{participants:item.participants.some(p=>p.personId===id)?item.participants.filter(p=>p.personId!==id):[...item.participants,{personId:id,weight:'1',fixed:'0'}]});}
  async function saveCloud(current:BillDraft):Promise<boolean>{
    if(!user){setDialog('login');return false;}
    const calculation=getCalculation(current);if(!calculation.result){setNotice(calculation.errors[0]??'เพิ่มรายการก่อนบันทึก');return false;}
    const account=user.id;setBusy(true);const ownRequest=++requestRevision.current;const editRevision=revision.current;
    try{const saved=z.object({bill:billSchema}).parse(await api('/api/bills','POST',{bill:current,expectedUpdatedAt:cloudVersions.current.get(current.id)??null})).bill;if(previousUser.current!==account)return false;cloudVersions.current.set(saved.id,saved.updatedAt);setRealtimeWarning(false);setCloudBills(existing=>[saved,...existing.filter(b=>b.id!==current.id)]);if(revision.current===editRevision)setBill(active=>active?.id===saved.id?saved:active);if(ownRequest===requestRevision.current)setNotice('บันทึกบิลในบัญชีแล้ว');return true;}
    catch(error){if(previousUser.current===account)setNotice(error instanceof Error?error.message:'บันทึกไม่สำเร็จ');return false;}finally{if(previousUser.current===account)setBusy(false);}
  }
  async function markPaid(personId:string){
    if(!bill||!user||paymentLock.current||pendingPayments.length>0||busy)return;
    const account=user.id;const startingRevision=revision.current;paymentLock.current=true;
    if(!cloudBills.some(b=>b.id===bill.id)||cloudBills.find(b=>b.id===bill.id)?.updatedAt!==bill.updatedAt){if(!await saveCloud(bill)){paymentLock.current=false;return;}}
    if(previousUser.current!==account||startingRevision!==revision.current){paymentLock.current=false;return;}
    const oldPaid=bill.paid;const nextPaid=oldPaid.includes(personId)?oldPaid.filter(id=>id!==personId):[...oldPaid,personId];const id=bill.id;
    setBill(current=>current?.id===id?{...current,paid:nextPaid}:current);setPendingPayments(current=>[...current,personId]);
    const editRevision=revision.current;
    try{const saved=z.object({bill:billSchema}).parse(await api('/api/payments','PATCH',{billId:id,personId,paid:!oldPaid.includes(personId)})).bill;if(previousUser.current!==account)return;cloudVersions.current.set(saved.id,saved.updatedAt);setRealtimeWarning(false);setCloudBills(current=>current.map(b=>b.id===id?saved:b));if(revision.current===editRevision)setBill(current=>current?.id===id?saved:current);}
    catch(error){if(previousUser.current!==account)return;setBill(current=>current?.id===id?{...current,paid:oldPaid}:current);setNotice(error instanceof Error?error.message:'อัปเดตไม่สำเร็จ คืนสถานะเดิมแล้ว');}
    finally{paymentLock.current=false;setPendingPayments(current=>current.filter(p=>p!==personId));}
  }
  async function login(provider:'email'|'google'){
    if(!loginAccepted){setNotice('กรุณาติ๊กยอมรับเงื่อนไขและรับทราบนโยบายความเป็นส่วนตัวก่อนเข้าสู่ระบบ');return;}
    if(busy)return;
    if(!supabaseConfigured){setNotice('ตั้งค่า Supabase ใน .env.local เพื่อเปิดระบบสมาชิก');return;}
    if(provider==='email'&&!z.email().safeParse(email.trim()).success){setNotice('กรอกอีเมลให้ถูกต้อง');return;}
    rememberCurrent();
    if(provider==='email'&&turnstileSiteKey&&!captchaToken){setNotice('กรุณายืนยันว่าคุณไม่ใช่บอทก่อน');return;}
    if(bill)writeLocalBills([bill,...localBills.filter(b=>b.id!==bill.id)],bill.id);

    setBusy(true);try{
      const client=browserClient();const redirectTo=location.origin+'/auth/callback';
      const response=provider==='google'?await client.auth.signInWithOAuth({provider:'google',options:{redirectTo}}):await client.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:redirectTo,...(captchaToken?{captchaToken}:{})}});
      if(response.error)throw response.error;
      if(provider==='email')setNotice('ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว กรุณาตรวจกล่องจดหมาย');
    }catch(error){setNotice(error instanceof Error?error.message:'เข้าสู่ระบบไม่สำเร็จ');}finally{setBusy(false);}
  }
  async function exportImage(){
    if(!result||!bill){setNotice(errors[0]??'เพิ่มรายการก่อนบันทึกรูป');return;}
    setDialog('export');setExportBusy(true);
    try{
      const {toBlob}=await import('html-to-image');await document.fonts.ready;
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(!exportRef.current)throw new Error('ไม่พบหน้าสรุป');
      const blob=await toBlob(exportRef.current,{pixelRatio:2,backgroundColor:'#ffffff',cacheBust:true});
      if(!blob)throw new Error('สร้างรูปไม่สำเร็จ');
      if(exportUrl)URL.revokeObjectURL(exportUrl);setExportUrl(URL.createObjectURL(blob));
    }catch(error){setNotice(error instanceof Error?error.message:'สร้างรูปไม่สำเร็จ');}finally{setExportBusy(false);}
  }
  async function shareImage(){
    if(!exportUrl||!bill)return;
    try{const blob=await (await fetch(exportUrl)).blob();const file=new File([blob],'handi-'+bill.date+'.png',{type:'image/png'});
      if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:bill.title});
      else{const link=document.createElement('a');link.href=exportUrl;link.download='handi-'+bill.date+'.png';link.click();}
    }catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))setNotice('แชร์รูปไม่ได้ กรุณาใช้ปุ่มดาวน์โหลด');}
  }
  async function shareLink(){
    if(!user){setDialog('login');return;}if(!bill||!await saveCloud(bill))return;
    try{const data=z.object({token:z.string().regex(/^[0-9a-f]{64}$/)}).parse(await api('/api/share','POST',{billId:bill.id}));const url=location.origin+'/share/'+data.token;setShareUrl(url);try{await navigator.clipboard.writeText(url);setNotice('คัดลอกลิงก์แล้ว ผู้มีลิงก์ดูสรุปและ QR ได้');}catch{setNotice('สร้างลิงก์แล้ว คัดลอกจากช่องใต้สรุปได้เลย');}}
    catch(error){setNotice(error instanceof Error?error.message:'สร้างลิงก์ไม่สำเร็จ');}
  }
  async function revokeLink(){if(!bill)return;try{await api('/api/share?id='+bill.id,'DELETE');setShareUrl('');setNotice('เพิกถอนลิงก์เดิมแล้ว');}catch(error){setNotice(error instanceof Error?error.message:'เพิกถอนไม่สำเร็จ');}}
  async function showQr(personId:string,amount:bigint){
    if(!promptpayId){setDialog('profile');setNotice('บันทึกเลขพร้อมเพย์ของผู้จ่ายก่อนสร้าง QR');return;}
    try{const {toDataURL}=await import('qrcode');const image=await toDataURL(promptpayPayload(promptpayId,amount),{width:320,margin:2,errorCorrectionLevel:'M'});setQr({name:bill?.people.find(p=>p.id===personId)?.name??'',amount,image});}
    catch(error){setNotice(error instanceof Error?error.message:'สร้าง QR ไม่สำเร็จ');}
  }
  function backup(){try{const content=storageBlocked?(localStorage.getItem(STORAGE_KEY)??'{}'):JSON.stringify({version:1,bills:historyBills,activeId:bill?.id??null},null,2);const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='handi-backup-'+localDate()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setNotice('ดาวน์โหลดข้อมูลไม่สำเร็จ');}}
  async function importBackup(file:File){
    try{if(file.size>2_000_000)throw new Error('ไฟล์ต้องไม่เกิน 2 MB');const data=editableStorageSchema.parse(JSON.parse(await file.text()));if(!user&&data.bills.some(b=>b.people.length>4))throw new Error('Guest รองรับสูงสุด 4 คนต่อบิล');const merged=new Map(localBills.map(b=>[b.id,b]));data.bills.forEach(b=>merged.set(b.id,b));setLocalBills([...merged.values()]);if(data.bills[0])setBill(data.bills[0]);setStorageBlocked(false);setStorageError(null);setNotice('นำเข้าข้อมูลสำรองแล้ว');}catch{setNotice('ไฟล์สำรองไม่ถูกต้องหรือไม่ใช่เวอร์ชันที่รองรับ');}
  }
  async function importGuests(){
    const account=previousUser.current;if(!account)return;
    setBusy(true);let count=0;
    const drafts=bill&&!cloudBills.some(b=>b.id===bill.id)?[bill,...localBills.filter(b=>b.id!==bill.id)]:localBills;
    for(const draft of drafts){if(previousUser.current!==account)return;if(importedIds.includes(draft.id)||cloudBills.some(b=>b.id===draft.id))continue;if(!getCalculation(draft).result)continue;try{const saved=z.object({bill:billSchema}).parse(await api('/api/bills','POST',{bill:draft,expectedUpdatedAt:null})).bill;if(previousUser.current!==account)return;cloudVersions.current.set(saved.id,saved.updatedAt);if(billRef.current?.id===saved.id&&billRef.current.updatedAt===draft.updatedAt)setBill(saved);count++;setImportedIds(ids=>[...ids,draft.id]);}catch(error){if(previousUser.current!==account)return;setNotice(error instanceof Error?error.message:'ย้ายบิลบางส่วนไม่สำเร็จ');setBusy(false);return;}}
    await loadCloud();if(previousUser.current!==account)return;setBusy(false);setDialog(null);setNotice('ย้ายบิลสำเร็จ '+count.toString()+' บิล');
  }
  async function deleteHistory(id:string){
    if(!window.confirm('ลบบิลนี้ถาวรใช่ไหม?'))return;
    try{if(user&&cloudBills.some(b=>b.id===id))await api('/api/bills?id='+id,'DELETE');setCloudBills(current=>current.filter(b=>b.id!==id));const remaining=localBills.filter(b=>b.id!==id);setLocalBills(remaining);if(bill?.id===id)setBill(remaining[0]??newBill());setNotice('ลบบิลแล้ว');}catch(error){setNotice(error instanceof Error?error.message:'ลบบิลไม่สำเร็จ');}
  }
  async function saveProfile(){const parsed=profileSchema.safeParse({displayName,promptpayId});if(!parsed.success){setNotice(parsed.error.issues[0]?.message??'ตรวจสอบข้อมูล');return;}setBusy(true);try{await api('/api/profile','PUT',parsed.data);setDialog(null);setNotice('บันทึกโปรไฟล์แล้ว');}catch(error){setNotice(error instanceof Error?error.message:'บันทึกไม่สำเร็จ');}finally{setBusy(false);}}
  async function addFriend(){if(!friendName.trim())return;setBusy(true);try{await api('/api/friends','POST',{name:friendName});setFriendName('');await loadCloud();}catch(error){setNotice(error instanceof Error?error.message:'เพิ่มเพื่อนไม่สำเร็จ');}finally{setBusy(false);}}
  async function deleteFriend(friend:Friend){
    const current=billRef.current;const linked=current?.people.some(p=>p.friendId===friend.id);const account=previousUser.current;
    if(linked&&current&&cloudBills.some(b=>b.id===current.id)&&!await saveCloud(current))return;
    const editRevision=revision.current;
    await api('/api/friends?id='+friend.id,'DELETE');if(previousUser.current!==account)return;
    setFriends(existing=>existing.filter(f=>f.id!==friend.id));
    const list=await loadCloud();
    if(linked&&current&&editRevision===revision.current){
      const latest=list?.find(b=>b.id===current.id);
      if(latest){cloudVersions.current.set(latest.id,latest.updatedAt);setBill(latest);setRealtimeWarning(false);}
      else update(b=>({...b,people:b.people.map(p=>p.friendId===friend.id?{...p,friendId:null}:p)}));
    }
  }
  function toggleTheme(){const next=!dark;setDark(next);document.documentElement.dataset.theme=next?'dark':'light';try{localStorage.setItem('handi:theme',next?'dark':'light');}catch{/* Optional preference. */}}
  const historyBills=useMemo(()=>{
    const map=new Map<string,BillDraft>();localBills.forEach(b=>map.set(b.id,b));cloudBills.forEach(b=>map.set(b.id,b));if(bill)map.set(bill.id,bill);
    return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
  },[bill,localBills,cloudBills]);
  const filteredBills=historyBills.filter(b=>b.title.toLowerCase().includes(search.toLowerCase())&&(!dateFrom||b.date>=dateFrom)&&(!dateTo||b.date<=dateTo));
  const monthlyBills=historyBills.filter(b=>b.date.startsWith(month)).map(b=>({bill:b,result:getCalculation(b).result})).filter((entry):entry is {bill:BillDraft;result:BillTotal}=>entry.result!==null);
  const monthlyTotal=monthlyBills.reduce((sum,entry)=>sum+entry.result.total,0n);
  const unpaid=monthlyBills.flatMap(entry=>entry.result.transfers.filter(t=>!entry.bill.paid.includes(t.from)).map(t=>({bill:entry.bill,from:entry.bill.people.find(p=>p.id===t.from)?.name??'',to:entry.bill.people.find(p=>p.id===t.to)?.name??'',amount:t.amount})));
  const crossBillSettlements=useMemo(()=>{
    const balances=new Map<string,bigint>();const labels=new Map<string,string>();
    for(const entry of monthlyBills)for(const transfer of entry.result.transfers){if(entry.bill.paid.includes(transfer.from))continue;const from=entry.bill.people.find(p=>p.id===transfer.from);const to=entry.bill.people.find(p=>p.id===transfer.to);if(!from||!to)continue;const fromKey=from.friendId??(from.name==='คุณ'?'self':from.id);const toKey=to.friendId??(to.name==='คุณ'?'self':to.id);labels.set(fromKey,from.name);labels.set(toKey,to.name);balances.set(fromKey,(balances.get(fromKey)??0n)-transfer.amount);balances.set(toKey,(balances.get(toKey)??0n)+transfer.amount);}
    return settleBalances([...balances].map(([personId,balance])=>({personId,balance}))).map(t=>({...t,from:labels.get(t.from)??t.from,to:labels.get(t.to)??t.to}));
  },[monthlyBills]);
  const storedGuestCount=(bill?[bill,...localBills.filter(b=>b.id!==bill.id)]:localBills).filter(b=>!cloudBills.some(c=>c.id===b.id)&&getCalculation(b).result).length;
  const nav=[{id:'bill' as const,label:'แบ่งบิล',icon:ReceiptText},{id:'history' as const,label:'ประวัติบิล',icon:History},{id:'friends' as const,label:'เพื่อนของฉัน',icon:Users},{id:'dashboard' as const,label:'สรุปรายเดือน',icon:LayoutDashboard}];
  if(!ready||!bill)return <div className="app-loading"><Leaf size={36}/><span>กำลังเตรียมโต๊ะให้คุณ…</span></div>;
  return <div className="app-shell">
    <aside className={'sidebar '+(mobileMenu?'sidebar-open':'')}><a className="brand" href="/" aria-label="หารดี หน้าหลัก"><span className="brand-mark"><ReceiptText size={25}/></span><span>หารดี<small>เรื่องบิล ให้เราช่วย</small></span></a>
      <button className="primary new-bill" onClick={()=>createBill()}><Plus size={18}/>สร้างบิลใหม่</button>
      <div className="nav-caption">พื้นที่ของคุณ</div><nav aria-label="เมนูหลัก">{nav.map(item=><button key={item.id} className={'nav-item '+(page===item.id?'active':'')} onClick={()=>{setPage(item.id);setMobileMenu(false);}}><item.icon size={20}/><span>{item.label}</span>{item.id==='history'&&historyBills.length>0&&<span className="nav-count">{historyBills.length}</span>}{item.id==='friends'&&!user&&<span className="pro-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-promo"><span className="promo-icon"><Sparkles size={19}/></span><strong>มื้อใหญ่แค่ไหน ก็หารได้</strong><p>เพิ่มเพื่อนไม่จำกัด เก็บทุกบิล<br/>พร้อม QR โอนเงินให้เพื่อน</p><button onClick={()=>setDialog(user?'profile':'login')}>{user?'ตั้งค่าบัญชีของคุณ':'สมัครสมาชิกฟรี'}<ArrowUpRight size={15}/></button></div>
      <button className="help-link" onClick={()=>setDialog('help')}><CircleHelp size={18}/>ใช้งานอย่างไร?</button><div className="sidebar-footer"><span>ทำด้วยความใส่ใจ <Leaf size={12}/></span><span>v1.0</span></div></div>
    </aside>
    {mobileMenu&&<button className="mobile-scrim" aria-label="ปิดเมนู" onClick={()=>setMobileMenu(false)}/>}
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu-button" aria-label="เปิดเมนู" onClick={()=>setMobileMenu(true)}><Menu size={21}/></button><span>พื้นที่ของคุณ</span><ChevronRight size={14}/><strong>{nav.find(n=>n.id===page)?.label}</strong></div><div className="topbar-actions"><span className="guest-pill"><span className="status-dot"/>{user?'บัญชีสมาชิก':'โหมด Guest'}</span><button className="icon-button theme-button" aria-label={dark?'ใช้ธีมสว่าง':'ใช้ธีมมืด'} onClick={toggleTheme}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="login-button" disabled={!authReady} onClick={()=>setDialog(user?'profile':'login')}>{user?<><Avatar name={displayName||user.email||'คุณ'} small/>{displayName||'บัญชีของฉัน'}</>:<>เข้าสู่ระบบ<ArrowUpRight size={15}/></>}</button></div></header>
      <main className="main-content">
        {storageError&&<div className="alert warning"><span>{storageError}</span><button onClick={backup}>ดาวน์โหลดสำรอง</button>{storageBlocked&&<button onClick={()=>{setStorageBlocked(false);setStorageError(null);}}>เริ่มเก็บข้อมูลชุดใหม่</button>}</div>}
        {user&&storedGuestCount>0&&<div className="import-banner"><Cloud size={18}/><span>มี {storedGuestCount} บิลในเครื่องที่ยังไม่ได้บันทึกเข้าบัญชี</span><button onClick={()=>setDialog('import')}>ย้ายเข้าบัญชี<ArrowRight size={15}/></button></div>}
        {realtimeWarning&&<div className="alert warning">บิลนี้มีการเปลี่ยนแปลงจากอีกอุปกรณ์<button onClick={()=>{const latest=cloudBills.find(b=>b.id===bill.id);if(latest)openBill(latest);}}>โหลดฉบับล่าสุด</button><button onClick={()=>setRealtimeWarning(false)}>เก็บฉบับที่กำลังแก้</button></div>}
        {page==='bill'&&<>
          <div className="page-heading"><div><div className="eyebrow greeting"><span/> LITTLE MOMENTS, FAIRLY SHARED</div><h1>มื้อดี ๆ <span>หารกันได้</span><span className="heading-leaf"><Leaf size={27}/></span></h1><p>ใครกินอะไร จ่ายแค่นั้น แบ่งบิลให้ลงตัวทุกมื้อ</p></div><div className="heading-actions"><button className="secondary" onClick={()=>{if(user)void saveCloud(bill);else backup();}} disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Cloud size={17}/>} {user?'บันทึกบิล':'สำรองข้อมูล'}</button></div></div>
          <div className="welcome-banner"><div className="welcome-illustration"><UtensilsCrossed size={31}/><span className="illustration-dot dot-one"/><span className="illustration-dot dot-two"/></div><div><strong>กินด้วยกัน ไม่จำเป็นต้องหารเท่ากัน</strong><p>เลือกคนหารแยกแต่ละรายการ ที่เหลือให้เราคิดให้เอง</p></div><button onClick={()=>createBill('dinner')}>ลองบิลตัวอย่าง<ArrowRight size={16}/></button><span className="banner-doodle"><Coffee size={66} strokeWidth={1}/></span></div>
          <div className="bill-layout"><div className="editor-column">
            <section className="card bill-info"><div className="section-title"><span className="step-number">01</span><h2>บิลนี้ของเรา</h2><span className="autosave"><CheckCheck size={14}/>{user?(cloudBills.some(b=>b.id===bill.id&&b.updatedAt===bill.updatedAt)?'บันทึกในบัญชีแล้ว':'กดบันทึกเพื่อเก็บเข้าบัญชี'):(savedAt?'บันทึกในเครื่องแล้ว':'เก็บในเครื่องอัตโนมัติ')}</span></div><div className="bill-info-fields"><label className="field bill-title-field">ชื่อบิล<input aria-label="ชื่อบิล" maxLength={120} value={bill.title} placeholder="เช่น มื้อเย็นวันศุกร์" onChange={e=>update(b=>({...b,title:e.target.value}))}/></label><label className="field date-field">วันที่<div className="input-with-icon"><CalendarDays size={16}/><input aria-label="วันที่บิล" type="date" value={bill.date} onChange={e=>update(b=>({...b,date:e.target.value}))}/></div></label></div></section>
            <section className="card people-card"><div className="section-title"><span className="step-number">02</span><h2>มื้อนี้มีใครบ้าง</h2><span className="section-counter">{bill.people.length} คน{!user?' / สูงสุด 4 คน':''}</span></div><div className="people-list">{bill.people.map((person,index)=><div className="person-chip" key={person.id}><Avatar name={person.name} index={index} small/><input aria-label={'ชื่อคนที่ '+(index+1).toString()} maxLength={60} value={person.name} onChange={e=>update(b=>({...b,people:b.people.map(p=>p.id===person.id?{...p,name:e.target.value}:p)}))}/><button aria-label={'ลบ '+person.name+' ออกจากบิล'} onClick={()=>removePerson(person.id)}><X size={13}/></button></div>)}<button className="add-person" onClick={()=>addPerson()}><Plus size={16}/>เพิ่มคน</button></div>{user&&friends.length>0&&<div className="friend-picker"><label htmlFor="friend-picker">เพิ่มจากเพื่อนที่บันทึกไว้</label><select id="friend-picker" value="" onChange={e=>{const friend=friends.find(f=>f.id===e.target.value);if(friend)addPerson(friend);}}><option value="">เลือกเพื่อน…</option>{friends.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>}<p className="subtle-note"><ShieldCheck size={13}/>{user?'รายชื่อเพื่อนที่บันทึกไว้ เลือกเพิ่มได้ทันที':'ไม่ต้องสมัครสมาชิก ก็แบ่งบิลได้เลย สูงสุด 4 คน'}</p></section>
            <section className="card items-card"><div className="section-title"><span className="step-number">03</span><h2>รายการที่สั่ง</h2><span className="section-counter">{bill.items.length} รายการ</span><button className="text-button" onClick={addItem}><Plus size={15}/>เพิ่มรายการ</button></div>
              {bill.items.length===0?<div className="empty-items"><span className="empty-icon"><UtensilsCrossed size={28}/></span><h3>มื้อนี้สั่งอะไรดี?</h3><p>เพิ่มรายการ แล้วเลือกคนที่ร่วมหารแต่ละจาน</p><button className="primary" onClick={addItem}><Plus size={16}/>เพิ่มรายการแรก</button><div className="template-options"><span>หรือเริ่มจาก</span><button onClick={()=>createBill('dinner')}>มื้อกับเพื่อน</button><button onClick={()=>createBill('bbq')}>ปิ้งย่าง</button><button onClick={()=>createBill('trip')}>ทริป</button></div></div>:
              <div className="item-list">{bill.items.map((item,index)=><article className="item-editor" key={item.id}><div className="item-main"><span className="item-number">{(index+1).toString().padStart(2,'0')}</span><label className="field item-name-field"><span className="sr-only">ชื่อรายการ {index+1}</span><input aria-label={'ชื่อรายการ '+(index+1).toString()} value={item.name} maxLength={120} placeholder="ชื่ออาหาร / รายการ" onChange={e=>patchItem(item.id,{name:e.target.value})}/></label><label className="field item-price-field"><span className="sr-only">ราคา {index+1}</span><span className="currency-input"><span>฿</span><input aria-label={'ราคารายการ '+(index+1).toString()} value={item.amount} inputMode="decimal" placeholder="0.00" maxLength={24} onChange={e=>patchItem(item.id,{amount:e.target.value})}/></span></label><button className="icon-button item-delete" aria-label={'ลบรายการ '+(index+1).toString()} onClick={()=>update(b=>({...b,items:b.items.filter(i=>i.id!==item.id)}))}><Trash2 size={16}/></button></div><div className="split-toolbar"><span>หารกับ</span><button onClick={()=>patchItem(item.id,{participants:bill.people.map(p=>item.participants.find(v=>v.personId===p.id)??{personId:p.id,weight:'1',fixed:'0'})})}>ทุกคน</button><span className="toolbar-separator">/</span><button onClick={()=>patchItem(item.id,{participants:[]})}>ล้างทั้งหมด</button><label className="split-mode"><span className="sr-only">วิธีหารรายการ {index+1}</span><select aria-label={'วิธีหารรายการ '+(index+1).toString()} value={item.mode} onChange={e=>patchItem(item.id,{mode:e.target.value as ItemDraft['mode']})}><option value="equal">หารเท่ากัน</option><option value="weight">ตามสัดส่วน</option><option value="fixed">ระบุยอดเอง</option></select><ChevronDown size={12}/></label></div><div className="participant-list">{bill.people.map((person,pIndex)=>{const selected=item.participants.some(p=>p.personId===person.id);return <label className={'participant '+(selected?'selected':'')} key={person.id}><input type="checkbox" checked={selected} aria-label={person.name+' ร่วมหารรายการ '+(index+1).toString()} onChange={()=>toggleParticipant(item,person.id)}/><span className={'participant-check avatar-'+(pIndex%6).toString()}>{selected?<Check size={12}/>:null}</span>{person.name||'ยังไม่มีชื่อ'}</label>;})}</div>{item.mode!=='equal'&&item.participants.length>0&&<div className="custom-splits">{bill.people.filter(p=>item.participants.some(v=>v.personId===p.id)).map(person=>{const part=item.participants.find(p=>p.personId===person.id);return <label key={person.id}>{person.name}<span>{item.mode==='fixed'?'฿':'×'}<input aria-label={(item.mode==='fixed'?'ยอด':'น้ำหนัก')+'ของ '+person.name+' รายการ '+(index+1).toString()} inputMode="decimal" maxLength={24} value={item.mode==='fixed'?part?.fixed??'0':part?.weight??'1'} onChange={e=>patchItem(item.id,{participants:item.participants.map(p=>p.personId===person.id?{...p,[item.mode==='fixed'?'fixed':'weight']:e.target.value}:p)})}/></span></label>;})}</div>}{item.participants.length===0&&<p className="field-error">กรุณาเลือกคนหารอย่างน้อย 1 คน</p>}</article>)}</div>}
              {bill.items.length>0&&<button className="add-item-bottom" onClick={addItem}><Plus size={17}/>เพิ่มรายการอาหาร / ค่าใช้จ่าย</button>}
            </section>
            <section className="card charges-card"><div className="section-title"><span className="step-number">04</span><h2>ปรับอีกนิด ให้พอดี</h2><Settings2 size={17} className="muted"/></div><div className="charge-fields"><label className="field">ค่าบริการ<span className="suffix-input"><input aria-label="ค่าบริการเปอร์เซ็นต์" inputMode="decimal" value={bill.service} onChange={e=>update(b=>({...b,service:e.target.value}))}/><span>%</span></span></label><label className="field">VAT<span className="suffix-input"><input aria-label="VAT เปอร์เซ็นต์" inputMode="decimal" value={bill.vat} onChange={e=>update(b=>({...b,vat:e.target.value}))}/><span>%</span></span></label><label className="field">ส่วนลดทั้งบิล<span className="suffix-input"><input aria-label="ส่วนลดทั้งบิล" inputMode="decimal" value={bill.discount} onChange={e=>update(b=>({...b,discount:e.target.value}))}/><span>฿</span></span></label></div><label className="checkbox-line"><input type="checkbox" checked={bill.vatIncluded} onChange={e=>update(b=>({...b,vatIncluded:e.target.checked}))}/>ราคาในรายการรวม VAT แล้ว</label><p className="subtle-note">ค่าบริการ ภาษี และส่วนลด กระจายตามสัดส่วนที่แต่ละคนจ่าย</p>{user&&<label className="field payer-field"><span><CreditCard size={15}/>ใครจ่ายหน้าร้าน?</span><select aria-label="ผู้จ่ายหน้าร้าน" value={bill.paidBy??''} onChange={e=>update(b=>({...b,paidBy:e.target.value||null}))}><option value="">ยังไม่ระบุผู้จ่าย</option>{bill.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>QR ใช้เลขพร้อมเพย์ในโปรไฟล์ของคุณ โปรดตั้งให้ตรงกับผู้จ่าย</small></label>}</section>
          </div>
          <aside className="summary-column"><div className="summary-card"><div className="summary-paper-top"/>{result?<Summary bill={bill} result={result} guest={!user} onPaid={id=>{void markPaid(id);}} onQr={(id,amount)=>{void showQr(id,amount);}}/>:<div className="summary-placeholder"><div className="summary-topline"><span className="eyebrow">BILL SUMMARY</span><ReceiptText size={17}/></div><span className="summary-empty-art"><ReceiptText size={42} strokeWidth={1.2}/></span><h3>สรุปมื้อนี้อยู่ตรงนี้</h3><p>{bill.items.length===0?'เพิ่มรายการ แล้วเราจะคำนวณส่วนแบ่งให้ทันที':'ตรวจข้อมูลอีกนิด เพื่อให้ยอดตรงทุกสตางค์'}</p>{bill.items.length>0&&<ul className="validation-errors" aria-live="polite">{errors.slice(0,5).map(message=><li key={message}>{message}</li>)}</ul>}<div className="placeholder-total"><span>ยอดรวม</span><strong>฿ —</strong></div></div>}<div className="summary-actions"><button className="primary" disabled={!result||exportBusy} onClick={()=>{void exportImage();}}><ArrowDownToLine size={17}/>บันทึกสรุปเป็นรูป</button><button className="secondary" disabled={!result||busy} onClick={()=>{void shareLink();}}><Share2 size={16}/>แชร์ลิงก์ให้เพื่อน{!user&&<span className="member-tag">สมาชิก</span>}</button>{shareUrl&&<label className="share-url">ลิงก์อ่านอย่างเดียว<input readOnly value={shareUrl} onFocus={e=>e.target.select()}/></label>}{user&&<button className="text-button revoke-button" onClick={()=>{void revokeLink();}}>เพิกถอนลิงก์ของบิลนี้</button>}</div></div><div className="privacy-note"><ShieldCheck size={17}/><p>{user?'ข้อมูลบิลของคุณเข้าถึงได้เฉพาะบัญชีคุณ':'บิลนี้เก็บในเครื่องคุณเท่านั้น'}<span>{user?'แชร์ให้เพื่อนได้เมื่อคุณสร้างลิงก์':'ไม่ต้องล็อกอิน ไม่ต้องส่งข้อมูลส่วนตัว'}</span></p></div><div className="little-quote"><span>“</span><p>ความทรงจำเก็บไว้<br/>ค่าใช้จ่ายแบ่งกัน</p><Leaf size={22} strokeWidth={1.3}/></div></aside></div>
        </>}
        {page==='history'&&<><div className="page-heading"><div><span className="eyebrow">GOOD TIMES, KEPT HERE</span><h1>ทุกมื้อ <span>ยังอยู่ตรงนี้</span></h1><p>{user?'ประวัติบิลในบัญชีและในเครื่องของคุณ':'ประวัติบิลในเครื่องนี้ สำรองข้อมูลไว้เพื่อย้ายอุปกรณ์'}</p></div><button className="primary" onClick={()=>createBill()}><Plus size={17}/>สร้างบิลใหม่</button></div><section className="card history-card"><div className="history-filters"><label className="search-field"><Search size={18}/><input aria-label="ค้นหาชื่อบิล" placeholder="ค้นหาชื่อบิล…" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="field">ตั้งแต่<input aria-label="วันที่เริ่มต้น" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label><label className="field">ถึง<input aria-label="วันที่สิ้นสุด" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label></div>{cloudLoading&&<p className="loading-line"><LoaderCircle className="spin" size={17}/>กำลังโหลดบิลในบัญชี…</p>}{filteredBills.length===0?<div className="empty-state"><History size={32}/><h3>ยังไม่มีบิลที่ตรงกับการค้นหา</h3><p>ลองเปลี่ยนชื่อหรือช่วงวันที่</p></div>:filteredBills.map(entry=>{const calculation=getCalculation(entry).result;return <div className="history-row" key={entry.id}><span className="history-icon"><ReceiptText size={22}/></span><button className="history-open" onClick={()=>openBill(entry)}><strong>{entry.title||'บิลยังไม่มีชื่อ'}</strong><small><ThaiDate value={entry.date}/> · {entry.people.length} คน · {cloudBills.some(b=>b.id===entry.id)?'บันทึกในบัญชี':'ในเครื่อง'}</small></button><strong className="history-amount">{calculation?'฿'+baht(calculation.total):'กำลังแก้ไข'}</strong><button className="icon-button" aria-label={'ลบบิล '+entry.title} onClick={()=>{void deleteHistory(entry.id);}}><Trash2 size={17}/></button><button className="icon-button" aria-label={'เปิดบิล '+entry.title} onClick={()=>openBill(entry)}><ChevronRight size={19}/></button></div>;})}</section><div className="backup-actions"><button className="secondary" onClick={backup}><Download size={16}/>สำรองข้อมูล JSON</button><button className="secondary" onClick={()=>importInput.current?.click()}><ArrowUpRight size={16}/>นำเข้าข้อมูลสำรอง</button></div><input ref={importInput} type="file" accept="application/json,.json" className="sr-only" aria-label="ไฟล์สำรองบิล" onChange={event=>{const file=event.target.files?.[0];if(file)void importBackup(file);event.target.value='';}}/></>}
        {page==='friends'&&<><div className="page-heading"><div><span className="eyebrow">YOUR FAVORITE PEOPLE</span><h1>เพื่อนร่วมโต๊ะ <span>คนคุ้นเคย</span></h1><p>บันทึกรายชื่อไว้ แล้วเพิ่มเข้าบิลได้โดยไม่ต้องพิมพ์ใหม่</p></div></div>{!user?<MemberGate title="มื้อหน้า เพิ่มเพื่อนได้ในคลิกเดียว" text="สมัครสมาชิกเพื่อบันทึกรายชื่อเพื่อน เพิ่มคนไม่จำกัด และดูว่าใครยังค้างโอน" onLogin={()=>setDialog('login')}/>:<section className="card"><form className="friend-add-form" onSubmit={event=>{event.preventDefault();void addFriend();}}><label className="field">ชื่อเพื่อน<input aria-label="ชื่อเพื่อนใหม่" placeholder="ชื่อที่เรียกกัน" value={friendName} maxLength={60} onChange={e=>setFriendName(e.target.value)}/></label><button className="primary" disabled={busy||!friendName.trim()}><Plus size={17}/>บันทึกเพื่อน</button></form>{friends.length===0?<div className="empty-state"><Users size={34}/><h3>เริ่มจากเพื่อนคนแรก</h3><p>คนที่ไปกินข้าวด้วยกันบ่อย ๆ คือใคร?</p></div>:<div className="friends-grid">{friends.map((friend,index)=><div className="friend-card" key={friend.id}><Avatar name={friend.name} index={index}/><strong>{friend.name}</strong><button className="text-button" onClick={()=>{addPerson(friend);setPage('bill');}}>เพิ่มเข้าบิล<Plus size={14}/></button><button className="icon-button" aria-label={'ลบเพื่อน '+friend.name} onClick={()=>{void (async()=>{if(!window.confirm('ลบ '+friend.name+' จากรายชื่อเพื่อน?'))return;try{await deleteFriend(friend);}catch(error){setNotice(error instanceof Error?error.message:'ลบไม่สำเร็จ');}})();}}><X size={15}/></button></div>)}</div>}</section>}</>}
        {page==='dashboard'&&<><div className="page-heading"><div><span className="eyebrow">A LITTLE LOOK BACK</span><h1>เดือนนี้ <span>มีเรื่องดี ๆ</span></h1><p>ดูยอดค่าใช้จ่าย และติดตามเงินที่เพื่อนยังไม่ได้โอน</p></div><label className="field">เลือกเดือน<input aria-label="เดือนที่สรุป" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div>{!user?<MemberGate title="เก็บทุกมื้อไว้ ดูภาพรวมได้ทุกเดือน" text="สมัครสมาชิกเพื่อบันทึกบิลถาวร ติดตามยอดค้างโอน และสรุปค่าใช้จ่ายรายเดือน" onLogin={()=>setDialog('login')}/>:<><div className="stats-grid"><div className="card stat-card"><span><Wallet size={18}/>ยอดใช้จ่ายรวม</span><strong>฿{baht(monthlyTotal)}</strong><small>ยอดรวมของทุกคนในบิล</small></div><div className="card stat-card"><span><ReceiptText size={18}/>จำนวนบิล</span><strong>{monthlyBills.length}<em> บิล</em></strong><small>ทุกมื้อที่บันทึกไว้ในเดือนนี้</small></div><div className="card stat-card"><span><CreditCard size={18}/>ยอดยังไม่โอน</span><strong>฿{baht(unpaid.reduce((s,p)=>s+p.amount,0n))}</strong><small>{unpaid.length} รายการโอนที่ยังค้างอยู่</small></div></div><section className="card"><div className="section-title"><h2>ใครยังไม่ได้โอนบ้าง?</h2></div>{unpaid.length===0?<div className="empty-state"><CheckCheck size={32}/><h3>ไม่มีรายการค้างโอน</h3><p>สบายใจได้ ทุกยอดเรียบร้อยแล้ว</p></div>:unpaid.map((entry,index)=><div className="history-row" key={entry.bill.id+index.toString()}><Avatar name={entry.from} index={index}/><button className="history-open" onClick={()=>openBill(entry.bill)}><strong>{entry.from} → {entry.to}</strong><small>{entry.bill.title}</small></button><strong>฿{baht(entry.amount)}</strong></div>)}</section><section className="card settlement-card"><div className="section-title"><h2>รวมยอด ลดจำนวนครั้งที่โอน</h2></div><p className="subtle-note">จับคู่ข้ามบิลจากรายชื่อเพื่อนที่บันทึกไว้และชื่อ “คุณ” รายชื่ออื่นจะแยกตามบิลเพื่อไม่รวมคนชื่อซ้ำโดยผิดพลาด</p>{crossBillSettlements.length===0?<p className="empty-state">ยังไม่มียอดสุทธิที่ต้องโอน</p>:crossBillSettlements.map((transfer,index)=><div className="receipt-lines" key={index}><div><span>{transfer.from} → {transfer.to}</span><strong>฿{baht(transfer.amount)}</strong></div></div>)}</section></>}</>}
        <footer className="main-footer"><span><Leaf size={13}/>หารดี · ทุกความสัมพันธ์ ไม่ต้องคิดเล็กคิดน้อย</span><div className="footer-legal-links"><a href="/policy">Privacy Policy</a><button onClick={openTerms}>Terms of Service</button><button onClick={()=>setDialog('help')}>ช่วยเหลือและข้อมูล</button></div></footer>
      </main>
    </div>
    {notice&&<div className="toast" role="status"><span>{notice}</span><button aria-label="ปิดข้อความ" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {dialog==='login'&&<Modal title="หารกันได้มากกว่าเดิม" onClose={()=>setDialog(null)}>
      <div className="auth-intro"><span className="auth-icon"><Leaf size={29}/></span><h3>มื้อไหน ๆ ก็ไม่ต้องเริ่มใหม่</h3><p>เพิ่มคนไม่จำกัด เก็บประวัติบิล รายชื่อเพื่อน<br/>แชร์ลิงก์ พร้อม QR โอนเงิน สมัครฟรี</p></div>
      <div className="login-consent">
        <label className="consent-checkbox" htmlFor="login-consent"><input id="login-consent" type="checkbox" checked={loginAccepted} onChange={event=>setLoginAccepted(event.target.checked)}/><span>ฉันยอมรับเงื่อนไขการใช้งานและรับทราบนโยบายความเป็นส่วนตัว</span></label>
        <div className="login-legal-links"><button className="legal-link" type="button" onClick={openTerms}>Terms of Service</button><span aria-hidden="true">·</span><a className="legal-link" href="/policy" target="_blank" rel="noopener noreferrer">Privacy Policy (เปิดแท็บใหม่)</a></div>
      </div>
      {!supabaseConfigured&&<div className="setup-notice"><Cloud size={22}/><strong>ระบบสมาชิกยังไม่ได้เชื่อมต่อ</strong><p>โหมด guest ใช้งานได้ครบในเครื่องนี้ เจ้าของเว็บต้องตั้งค่า Supabase ก่อนเปิดสมัครสมาชิก</p></div>}
      <button className="secondary google-button" onClick={()=>{void login('google');}} disabled={busy||!loginAccepted||!supabaseConfigured}><span className="google-g" aria-hidden="true">G</span>ดำเนินการต่อด้วย Google</button>
      <div className="or-line"><span>หรือใช้อีเมล</span></div>
      <form onSubmit={event=>{event.preventDefault();void login('email');}}><label className="field">อีเมล<input aria-label="อีเมลเข้าสู่ระบบ" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>{turnstileSiteKey&&<Turnstile ref={turnstileRef} siteKey={turnstileSiteKey} onSuccess={setCaptchaToken} onExpire={()=>setCaptchaToken(null)} onError={()=>setCaptchaToken(null)}/>}<button className="primary full-width" disabled={busy||!loginAccepted||!supabaseConfigured||(Boolean(turnstileSiteKey)&&!captchaToken)}>{busy?<LoaderCircle className="spin" size={17}/>:<LogIn size={17}/>}ส่งลิงก์เข้าสู่ระบบ</button></form>
      <p className="subtle-note center">ไม่ต้องจำรหัสผ่าน เราจะส่งลิงก์ไปที่อีเมลของคุณ</p>
    </Modal>}
    {dialog==='profile'&&user&&<Modal title="บัญชีของฉัน" onClose={()=>setDialog(null)}><p className="profile-email">{user.email}</p><label className="field">ชื่อที่แสดง<input aria-label="ชื่อโปรไฟล์" value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={80}/></label><label className="field">เลขพร้อมเพย์ของผู้จ่าย<input aria-label="เลขพร้อมเพย์" inputMode="numeric" value={promptpayId} onChange={e=>setPromptpayId(e.target.value)} maxLength={13} placeholder="เบอร์โทร 10 หลัก / เลข 13 หลัก"/><small>เพื่อนจะเห็นเลขนี้เมื่อคุณสร้างลิงก์แชร์ ใช้เลขของคนจ่ายหน้าร้าน</small></label><button className="primary full-width" disabled={busy} onClick={()=>{void saveProfile();}}><Check size={17}/>บันทึกโปรไฟล์</button><button className="secondary full-width logout" onClick={()=>{void browserClient().auth.signOut().then(({error})=>{if(error){setNotice('ออกจากระบบไม่สำเร็จ');return;}setDialog(null);setNotice('ออกจากระบบแล้ว');});}}><LogOut size={16}/>ออกจากระบบ</button></Modal>}
    {dialog==='help'&&<Modal title="หารดี ใช้งานอย่างไร?" onClose={()=>setDialog(null)}><div className="help-content"><p><strong>1. ตั้งชื่อบิล แล้วเพิ่มคนร่วมโต๊ะ</strong><br/>Guest เพิ่มได้ 4 คน สมาชิกเพิ่มได้ไม่จำกัด</p><p><strong>2. เพิ่มรายการ แล้วเลือกคนหาร</strong><br/>หารเท่ากัน ตามน้ำหนัก หรือระบุยอดเองก็ได้</p><p><strong>3. ปรับค่าบริการ VAT และส่วนลด</strong><br/>คิดตามสัดส่วนแต่ละรายการ รวม VAT แล้วจะบวกภาษีเพิ่มเฉพาะค่าบริการ ส่วนลดหักหลังรวมทุกอย่าง</p><p><strong>4. ส่งสรุปให้เพื่อน</strong><br/>บันทึก PNG หรือสร้างลิงก์สำหรับสมาชิก แตะชื่อในสรุปเพื่อดูรายละเอียด</p><p>เงินคำนวณเป็นจำนวนเต็มสตางค์ เศษแจกตาม Largest Remainder และลำดับคนที่เพิ่มก่อน ยอดจึงตรงกันทุกครั้ง</p><p>โหมด guest เก็บข้อมูลในเบราว์เซอร์นี้ ควรสำรอง JSON ก่อนล้างข้อมูลหรือเปลี่ยนอุปกรณ์ โหมดออฟไลน์ใช้ได้หลังเคยเปิดเว็บออนไลน์ใน production แล้ว</p></div></Modal>}
    {dialog==='import'&&<Modal title="ย้ายบิลเข้าในบัญชี" onClose={()=>setDialog(null)}><p>มี {storedGuestCount} บิลที่คำนวณได้ในเครื่องนี้พร้อมย้ายเข้าบัญชี บิลที่ยังกรอกไม่ครบจะคงอยู่ในเครื่องเพื่อแก้ไขต่อ</p><button className="primary full-width" disabled={busy} onClick={()=>{void importGuests();}}>{busy?<LoaderCircle className="spin" size={17}/>:<Cloud size={17}/>}ย้ายบิลเข้าบัญชี</button></Modal>}
    {dialog==='export'&&<Modal title="สรุปสวย ๆ ส่งให้เพื่อน" onClose={()=>setDialog(null)} wide>{exportBusy?<div className="empty-state"><LoaderCircle className="spin" size={28}/><p>กำลังเตรียมภาพสรุป…</p></div>:exportUrl?<><div className="export-preview"><img src={exportUrl} alt={'สรุปบิล '+bill.title}/></div><div className="export-buttons"><a className="secondary" href={exportUrl} download={'handi-'+bill.date+'.png'}><Download size={17}/>ดาวน์โหลด PNG</a><button className="primary" onClick={()=>{void shareImage();}}><Share2 size={17}/>แชร์รูปให้เพื่อน</button></div></>:<p>ไม่สามารถสร้างรูปได้ กรุณาลองอีกครั้ง</p>}</Modal>}
    {qr&&<Modal title={'QR สำหรับ '+qr.name} onClose={()=>setQr(null)}><div className="qr-content"><span className="promptpay-label">พร้อมเพย์ · PromptPay</span><img src={qr.image} alt={'QR พร้อมเพย์ยอด '+baht(qr.amount)+' บาท'}/><strong>฿{baht(qr.amount)}</strong><p>โอนให้ {bill.people.find(p=>p.id===bill.paidBy)?.name??'ผู้จ่ายหน้าร้าน'}</p><span>{promptpayId}</span><small>ตรวจชื่อผู้รับในแอปธนาคารก่อนยืนยันโอน</small></div></Modal>}
    {confirmDelete&&<Modal title="ลบคนออกจากบิล?" onClose={()=>setConfirmDelete(null)}><p>ลบ {bill.people.find(p=>p.id===confirmDelete.personId)?.name} แล้วจะคำนวณส่วนแบ่งใหม่ทุกรายการที่เกี่ยวข้อง</p>{confirmDelete.orphanNames.length>0&&<div className="alert warning">รายการเหล่านี้จะไม่มีคนหาร กรุณาเลือกคนใหม่หลังลบ: {confirmDelete.orphanNames.join(', ')}</div>}<div className="export-buttons"><button className="secondary" onClick={()=>setConfirmDelete(null)}>เก็บไว้ก่อน</button><button className="danger-button" onClick={confirmRemovePerson}>ลบออกจากบิล</button></div></Modal>}
    {result&&<div className="export-stage" aria-hidden="true"><div ref={exportRef} className="export-receipt"><div className="export-brand"><span className="brand-mark"><ReceiptText size={24}/></span><strong>หารดี</strong><Leaf size={20}/></div><h2>{bill.title}</h2><p className="export-date"><ThaiDate value={bill.date}/></p><Summary bill={bill} result={result} guest={!user} readOnly/></div></div>}
  </div>;
}
function MemberGate({title,text,onLogin}:{title:string;text:string;onLogin:()=>void}){return <section className="card member-gate"><span className="auth-icon"><Sparkles size={32}/></span><h2>{title}</h2><p>{text}</p><button className="primary" onClick={onLogin}>สมัครสมาชิกฟรี<ArrowUpRight size={17}/></button></section>;}
