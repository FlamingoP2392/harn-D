'use client';
export default function ErrorPage({reset}:{error:Error & {digest?:string};reset:()=>void}){return <main className="app-loading"><h1 style={{fontSize:25}}>มีบางอย่างสะดุดนิดหน่อย</h1><p>ลองใหม่อีกครั้ง ข้อมูลที่บันทึกในเครื่องยังอยู่</p><button className="primary" onClick={reset}>ลองอีกครั้ง</button></main>;}
