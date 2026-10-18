'use client';
import { useState } from 'react';
import { Check, ChevronDown, QrCode, ReceiptText } from 'lucide-react';
import { baht } from '@/lib/money';
import type { BillDraft } from '@/lib/validation/bill';
import type { BillTotal } from '@/lib/split/calculate-bill';

export function Avatar({ name, index = 0, small = false }: { name:string; index?:number; small?:boolean }) {
  return <span className={'avatar avatar-' + (index % 6).toString() + (small ? ' avatar-small' : '')}>{name.slice(0, 1) || '?'}</span>;
}
export function Summary({ bill, result, guest, onPaid, onQr, readOnly = false }: {
  bill:BillDraft; result:BillTotal; guest:boolean; readOnly?:boolean;
  onPaid?:(id:string)=>void; onQr?:(id:string,amount:bigint)=>void;
}) {
  const [expanded,setExpanded] = useState<string | null>(null);
  const payer = bill.people.find(p=>p.id===bill.paidBy);
  return <div className="summary-content">
    <div className="summary-topline"><span className="eyebrow">BILL SUMMARY</span><span className="mini-badge"><span className="status-dot"/>ยอดตรงทุกสตางค์</span></div>
    <div className="summary-total"><span>ยอดรวมที่ต้องจ่าย</span><strong><small>฿</small>{baht(result.total)}</strong><p>{bill.people.length} คน · {bill.items.length} รายการ · แบ่งตามที่กินจริง</p></div>
    <div className="receipt-lines">
      <div><span>รวมรายการอาหาร</span><span>฿{baht(result.subtotal)}</span></div>
      {result.service > 0n && <div><span>ค่าบริการ {bill.service}%</span><span>฿{baht(result.service)}</span></div>}
      {result.vat > 0n && <div><span>{bill.vatIncluded ? 'VAT ของค่าบริการ' : 'VAT'} {bill.vat}%</span><span>฿{baht(result.vat)}</span></div>}
      {bill.vatIncluded && <div className="muted"><span>VAT ที่รวมในราคาแล้ว</span><span>฿{baht(result.includedVat)}</span></div>}
      {result.discount > 0n && <div className="green"><span>ส่วนลดทั้งบิล</span><span>−฿{baht(result.discount)}</span></div>}
    </div>
    <div className="receipt-divider"/>
    <div className="section-label"><h3>แต่ละคนจ่ายเท่าไหร่?</h3><span>แตะเพื่อดูรายละเอียด</span></div>
    <div className="person-totals">{result.people.map((person,index)=>{
      const paid = bill.paid.includes(person.id);
      const isPayer = person.id === bill.paidBy;
      return <div className="person-total" key={person.id}>
        <button type="button" className="person-total-button" onClick={()=>setExpanded(expanded===person.id?null:person.id)} aria-expanded={expanded===person.id}>
          <Avatar name={person.name} index={index}/><span className="person-total-name"><strong>{person.name}{isPayer && <em>ผู้จ่ายหน้าร้าน</em>}</strong><small>{person.breakdown.length} รายการ{!guest && !isPayer && payer ? paid ? ' · โอนแล้ว' : ' · ยังไม่โอน' : ''}</small></span>
          <strong className="person-amount">฿{baht(person.total)}</strong><ChevronDown size={15} className={expanded===person.id?'rotate':''}/>
        </button>
        {expanded===person.id && <div className="breakdown">{person.breakdown.map(row=><div key={row.itemId}><span>{row.name}</span><span>฿{baht(row.base)}</span></div>)}
          {person.service>0n&&<div><span>ค่าบริการตามสัดส่วน</span><span>฿{baht(person.service)}</span></div>}
          {person.vat>0n&&<div><span>VAT เพิ่มตามสัดส่วน</span><span>฿{baht(person.vat)}</span></div>}
          {person.discount>0n&&<div className="green"><span>ส่วนลดตามสัดส่วน</span><span>−฿{baht(person.discount)}</span></div>}
        </div>}
        {!guest && payer && !isPayer && person.total>0n && <div className="payment-controls"><span>โอนให้ {payer.name}</span>{onQr && <button className="text-button" onClick={()=>onQr(person.id,person.total)}><QrCode size={14}/> QR โอนเงิน</button>}{!readOnly && onPaid && <button aria-label={'สถานะโอนของ '+person.name} className={'paid-button '+(paid?'is-paid':'')} onClick={()=>onPaid(person.id)}>{paid?<><Check size={13}/>โอนแล้ว</>:'ยังไม่โอน'}</button>}</div>}
      </div>;
    })}</div>
    {guest && <div className="watermark"><ReceiptText size={14}/> หารดี · มื้อดี ๆ หารกันได้</div>}
    {!guest && <p className="summary-note">หารดี · เก็บความทรงจำ แบ่งค่าใช้จ่าย</p>}
  </div>;
}
