import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TermsProvider } from '@/components/terms-provider';
export const metadata: Metadata = { title:'หารดี — มื้อดี ๆ หารกันได้', description:'แบ่งบิลตามรายการ ใครกินอะไร จ่ายแค่นั้น คำนวณตรงทุกสตางค์ พร้อมสรุปและแชร์ให้เพื่อน', manifest:'/manifest.webmanifest', icons:{icon:'/icon.svg',apple:'/icon-192.png'} };
export const viewport: Viewport = {width:'device-width',initialScale:1,themeColor:'#edf1e6'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="th" suppressHydrationWarning><body><TermsProvider>{children}</TermsProvider></body></html>; }
