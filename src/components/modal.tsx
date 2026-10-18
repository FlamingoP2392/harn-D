'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
export function Modal({title,onClose,children,wide=false,dismissible=true,className=""}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean;dismissible?:boolean;className?:string}){
  const dialog=useRef<HTMLDialogElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const titleId=useId();
  useEffect(()=>{const element=dialog.current;const previous=document.activeElement;element?.showModal();heading.current?.focus();return()=>{element?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
  return <dialog ref={dialog} aria-labelledby={titleId} className={'modal '+(wide?'modal-wide ':'')+className} onCancel={event=>{event.preventDefault();if(dismissible)onClose();}} onClick={event=>{if(dismissible&&event.target===event.currentTarget)onClose();}}><div className="modal-head"><h2 ref={heading} tabIndex={-1} id={titleId}>{title}</h2>{dismissible&&<button className="icon-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><X size={20}/></button>}</div>{children}</dialog>;
}
