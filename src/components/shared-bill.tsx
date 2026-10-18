'use client';
import {useState} from 'react';
import {Leaf,ReceiptText,Share2} from 'lucide-react';
import {Summary} from './summary';
import {Modal} from './modal';
import {calculateBill} from '@/lib/split/calculate-bill';
import {type BillDraft,toSplitBill} from '@/lib/validation/bill';
import {promptpayPayload} from '@/lib/qr';
import {baht} from '@/lib/money';
export function SharedBill({bill,promptpayId}:{bill:BillDraft;promptpayId:string}){
  const [qr,setQr]=useState<{image:string;amount:bigint;name:string}|null>(null);
  const [error,setError]=useState('');
  const result=calculateBill(toSplitBill(bill));
  async function showQr(id:string,amount:bigint){
    try{const {toDataURL}=await import('qrcode');setQr({image:await toDataURL(promptpayPayload(promptpayId,amount),{width:320,margin:2}),amount,name:bill.people.find(p=>p.id===id)?.name??''});}catch{setError('สร้าง QR ไม่สำเร็จ กรุณาลองใหม่');}
  }
  return <main className="shared-page" style={{maxWidth:480,margin:'0 auto',padding:'35px 20px'}}><a href="/" className="brand" style={{justifyContent:'center',marginBottom:30}}><span className="brand-mark"><ReceiptText size={25}/></span><span>หารดี<small>มื้อดี ๆ หารกันได้</small></span></a><div style={{textAlign:'center',marginBottom:23}}><span className="eyebrow">A GOOD MEAL, FAIRLY SHARED</span><h1 style={{fontSize:25,marginTop:8}}>{bill.title}</h1><p className="muted" style={{fontSize:12,marginTop:6}}>{new Date(bill.date+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'})} · ดูได้อย่างเดียว</p></div><div className="summary-card"><div className="summary-paper-top"/><Summary bill={bill} result={result} guest={false} readOnly {...(promptpayId?{onQr:(id:string,amount:bigint)=>{void showQr(id,amount);}}:{})}/><div style={{height:24}}/></div>{error&&<p role="alert" className="field-error">{error}</p>}<p className="privacy-note"><Leaf size={16}/>แบ่งเฉพาะค่าใช้จ่าย เก็บความทรงจำไว้ด้วยกัน</p><button className="secondary full-width" onClick={()=>{void (async()=>{try{if(navigator.share)await navigator.share({title:bill.title,url:location.href});else{await navigator.clipboard.writeText(location.href);setError('คัดลอกลิงก์แล้ว');}}catch{/* Sharing can be cancelled. */}})();}}><Share2 size={16}/>แชร์สรุปนี้</button>{qr&&<Modal title={'QR สำหรับ '+qr.name} onClose={()=>setQr(null)}><div className="qr-content"><span className="promptpay-label">PromptPay · พร้อมเพย์</span><img src={qr.image} alt="QR พร้อมเพย์"/><strong>฿{baht(qr.amount)}</strong><p>โอนให้ {bill.people.find(p=>p.id===bill.paidBy)?.name}</p><span>{promptpayId}</span><small>ตรวจชื่อผู้รับในแอปธนาคารก่อนยืนยัน</small></div></Modal>}</main>;
}
