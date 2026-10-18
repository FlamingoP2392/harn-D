'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRight, FileText, X } from 'lucide-react';
import { Modal } from './modal';
import { LEGAL_UPDATED_LABEL, TERMS_STORAGE_KEY, TERMS_VERSION, termsSections } from '@/lib/legal';

const TermsContext = createContext<{ openTerms: () => void }>({ openTerms: () => undefined });
export function useTerms() { return useContext(TermsContext); }

export function TermsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const acceptedThisVisit = useRef(false);
  const [accepted, setAccepted] = useState(false);
  const [open, setOpen] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');

  useEffect(() => {
    let stored = false;
    try { stored = localStorage.getItem(TERMS_STORAGE_KEY) === TERMS_VERSION; } catch { /* Acceptance can still last for this visit. */ }
    const hasAccepted = acceptedThisVisit.current || stored;
    acceptedThisVisit.current = hasAccepted;
    setAccepted(hasAccepted);
    // Keep the policy readable before acceptance, including direct visits.
    setOpen(pathname !== '/policy' && !hasAccepted);
  }, [pathname]);

  function acceptTerms() {
    try { localStorage.setItem(TERMS_STORAGE_KEY, TERMS_VERSION); }
    catch { setStorageNotice('ยอมรับเงื่อนไขแล้ว แต่เบราว์เซอร์ไม่อนุญาตให้บันทึก ครั้งถัดไปจะแสดงให้ยอมรับอีกครั้ง'); }
    acceptedThisVisit.current = true;
    setAccepted(true);
    setOpen(false);
  }

  return <TermsContext.Provider value={{ openTerms: () => setOpen(true) }}>
    {children}
    {open && <Modal title="เงื่อนไขการใช้งาน" onClose={() => setOpen(false)} dismissible={accepted} wide className="terms-modal">
      <div className="terms-intro">
        <span className="legal-icon"><FileText size={25} /></span>
        <div><span className="eyebrow">TERMS OF SERVICE</span><p>ก่อนเริ่มหาร มาทำความเข้าใจตรงกัน</p></div>
      </div>
      <p className="legal-updated">ปรับปรุงล่าสุด {LEGAL_UPDATED_LABEL}</p>
      <div className="terms-copy" role="region" aria-label="รายละเอียดเงื่อนไขการใช้งาน" tabIndex={0}>
        {termsSections.map(section => <section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}
      </div>
      <p className="terms-policy-note">อ่านเพิ่มเติมเกี่ยวกับข้อมูลของคุณที่ <a className="legal-link" href="/policy" target="_blank" rel="noopener noreferrer">Privacy Policy (เปิดแท็บใหม่)</a></p>
      {accepted
        ? <button className="primary full-width" onClick={() => setOpen(false)}>อ่านเรียบร้อยแล้ว</button>
        : <><p className="terms-accept-note">เมื่อกดปุ่มด้านล่าง คุณยอมรับเงื่อนไขการใช้งานฉบับนี้</p><button className="primary full-width" onClick={acceptTerms}>ยอมรับและเริ่มใช้งาน<ArrowRight size={17} /></button></>}
    </Modal>}
    {storageNotice && <div className="toast" role="status"><span>{storageNotice}</span><button aria-label="ปิดข้อความการยอมรับ" onClick={() => setStorageNotice('')}><X size={16} /></button></div>}
  </TermsContext.Provider>;
}
