# หารดี — เว็บแบ่งบิลตามรายการ

เว็บภาษาไทยสำหรับเลือกคนหารแยกแต่ละรายการ รองรับหารเท่า สัดส่วน และระบุยอดเอง พัฒนาด้วย Next.js App Router, React, TypeScript strict และ Supabase

โหมด Guest ใช้งานได้ทันทีโดยไม่ต้องตั้งค่าฐานข้อมูล ส่วนระบบสมาชิกมีโค้ดและ migration พร้อม แต่ต้องเชื่อม Supabase ของคุณก่อน

## เปิดเว็บที่เครื่อง

ใช้ Node.js ตาม engines ใน package.json (เครื่องที่พัฒนาใช้ Node.js 24.19.0)


~~~powershell
cd C:\Users\krail\OneDrive\Desktop\web02
npm.cmd ci
npm.cmd run dev
~~~

เปิด http://localhost:3000 แล้วกด “ลองบิลตัวอย่าง” หรือสร้างบิลของคุณเอง


ใช้ npm.cmd บน Windows เพื่อหลีกเลี่ยง execution policy ของ npm.ps1

## การใช้งาน

- **Guest:** เพิ่มคนได้ 4 คน เลือกคนหารต่อรายการ ตั้ง service/VAT/ส่วนลด ดูยอดรายคนและรายละเอียด ดาวน์โหลด PNG มีลายน้ำ และแชร์รูปผ่าน Web Share เมื่อเบราว์เซอร์รองรับ
- บิล Guest รวมถึงข้อมูลที่กรอกไม่ครบ บันทึกใน localStorage อัตโนมัติ มีประวัติ ค้นหาชื่อ กรองวันที่ และสำรอง/นำเข้า JSON ข้อมูลอยู่ในเบราว์เซอร์นี้ การล้างข้อมูลเบราว์เซอร์อาจลบบิล จึงควรสำรองข้อมูล
- **สมาชิก:** เข้าระบบผ่าน magic link หรือ Google เพิ่มคนได้มากกว่า 4 คน มีปุ่มบันทึกบิลเข้าบัญชี ประวัติบนคลาวด์ รายชื่อเพื่อน ผู้จ่ายหน้าร้าน สถานะโอน QR พร้อมเพย์ ลิงก์อ่านอย่างเดียวที่เพิกถอนได้ และภาพสรุปไม่มีลายน้ำ
- เมื่อเข้าสู่ระบบจะมีแถบเสนอย้ายบิล Guest ที่คำนวณได้เข้าบัญชี ผู้ใช้กดยืนยันย้ายได้ ข้อมูลเดิมในเครื่องยังคงอยู่ บิลที่กรอกไม่ครบต้องแก้ให้ครบก่อนย้าย
- มีเทมเพลตมื้ออาหาร/ปิ้งย่าง/ทริป ธีมมืด สรุปรายเดือน ยอดค้าง และคำนวณยอดสุทธิเพื่อลดการโอน โดยใช้เพื่อนที่บันทึกเป็นตัวเชื่อมคนข้ามบิล
- สถานะ “โอนแล้ว” เป็นการทำเครื่องหมายด้วยตนเอง ไม่มีการตรวจรายการธนาคาร QR ใช้เลขพร้อมเพย์ในโปรไฟล์ ต้องตั้งให้ตรงกับผู้จ่ายหน้าร้านและตรวจชื่อผู้รับในแอปธนาคาร

## ตั้งค่า Supabase เพื่อเปิดระบบสมาชิก

1. สร้าง Supabase project แล้วคัดลอก Project URL และ publishable key จากแดชบอร์ด
2. คัดลอก .env.example เป็น .env.local แล้วใส่ค่า:

~~~dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
~~~

ใช้เฉพาะ public publishable key ห้ามใส่ service-role/secret key ใน NEXT_PUBLIC_* หรือ commit .env.local

3. รันไฟล์ supabase/migrations/202610180001_initial.sql ใน SQL Editor ของ project ใหม่ ไฟล์นี้สร้างตาราง RLS, RPC, index และเพิ่ม bills เข้า supabase_realtime ถ้า publication นี้มีอยู่แล้ว ใช้ pgcrypto ใน schema extensions ตามค่าปกติของ Supabase
4. ใน Authentication ตั้ง Site URL เป็น http://localhost:3000 และเพิ่ม http://localhost:3000/auth/callback ใน Redirect URLs เมื่อนำขึ้นเซิร์ฟเวอร์ให้เพิ่ม URL ของเว็บจริงด้วย
5. เปิด Email provider สำหรับ magic link เว็บใช้ PKCE และแลก code ที่ /auth/callback จึงควรเปิดลิงก์ในเบราว์เซอร์ที่เริ่มขอเข้าสู่ระบบ
6. ถ้าต้องการ Google ให้เปิด Google provider ใน Supabase ใส่ OAuth client ID/secret และตั้ง Authorized redirect URI ใน Google Cloud ตาม callback ที่แสดงใน Supabase Dashboard จากนั้นอนุญาต app callback ตามข้อ 4
7. เริ่มเซิร์ฟเวอร์ใหม่หลังเปลี่ยน env ถ้ารัน production ให้ build ใหม่ด้วย เพราะ NEXT_PUBLIC_* ถูกรวมใน client bundle

ข้อมูลตัวอย่าง: สร้าง/เข้าสู่ระบบบัญชีทดสอบก่อน คัดลอก UUID จาก Authentication > Users แล้วแทน REPLACE_WITH_AUTH_USER_UUID ใน supabase/seed.sql จึงรันใน SQL Editor ทุกครั้งที่รันจะเพิ่มบิลตัวอย่างใหม่หนึ่งบิล และไม่ตั้งเลขพร้อมเพย์จริงให้

## สูตรและการปัดเศษ

แกนคำนวณอยู่ที่ src/lib/split/ เป็น pure functions และใช้ bigint หน่วยสตางค์ทั้งหมด JSON ส่งค่าทศนิยมเป็นข้อความ และฐานข้อมูลเก็บยอดเป็น bigint หน่วยสตางค์

- เงินรับทศนิยมไม่เกิน 2 ตำแหน่ง สูงสุด 999,999,999.99 บาทต่อค่าที่กรอก น้ำหนักต้องมากกว่า 0 มีทศนิยมได้ 6 ตำแหน่ง เปอร์เซ็นต์ 0–100 มีทศนิยมได้ 2 ตำแหน่ง กรอกเกินจะแจ้งข้อผิดพลาด
- Largest Remainder กระจายเศษให้ผลรวมตรงทุกสตางค์ เมื่อเศษเท่ากันใช้ลำดับคนที่เพิ่มเข้าบิล รายการใช้ลำดับที่แสดง
- ค่าบริการคิดจากราคารวมและปัด half-up ที่ระดับบิล จากนั้นกระจายตามราคารายการ และตามส่วนแบ่งของคนในรายการ
- ราคา **ไม่รวม VAT**: VAT คิดจากราคา + ค่าบริการ ตัวอย่าง 100 + service 10% + VAT 7% = **117.70 บาท**
- ราคา **รวม VAT แล้ว**: ไม่บวก VAT ของอาหารซ้ำ แต่คิด VAT เพิ่มบนค่าบริการ ตัวอย่าง 100 + service 10% + VAT 7% = **110.70 บาท** ตัวเลข VAT ในราคาที่แสดงเป็นข้อมูลประกอบ
- ส่วนลดหักหลังค่าบริการและ VAT กระจายตามยอดก่อนลดของแต่ละคน ห้ามเกินยอดบิล
- โหมดระบุยอดเองต้องรวมเท่าราคารายการ หากไม่เท่าจะแสดงส่วนต่าง รายการที่ไม่มีคนหารจะมีข้อผิดพลาดให้แก้
- การจับคู่ยอดสุทธิใช้ deterministic greedy settlement ช่วยลดการโอนโดยไม่รับประกันว่าจำนวนครั้งน้อยที่สุดในทุกกรณี

## ฐานข้อมูลและการบันทึก

profiles เก็บโปรไฟล์/พร้อมเพย์; friends เก็บเพื่อน; bills เก็บเจ้าของ วันที่ ค่าบริการ ภาษี JSON สำหรับแก้ไข และ hash ของลิงก์แชร์; people/items เป็นรายการลูกของบิล; item_participants เชื่อมคนกับรายการ; payments เก็บสถานะโอน

item_participants เป็น many-to-many เพราะหนึ่งรายการมีหลายคนหาร และคนหนึ่งร่วมหลายรายการได้ พร้อมน้ำหนัก/ยอดที่ต่างกันในแต่ละรายการ

เปิด RLS ทั้ง 7 ตาราง ผูกสิทธิ์เจ้าของผ่าน auth.uid() และบิลแม่ ไม่เปิดอ่านตารางสาธารณะ ลิงก์แชร์ใช้ token สุ่ม 256 บิต เก็บเฉพาะ SHA-256 hash และอ่านผ่าน security-definer RPC ซึ่งคืนเฉพาะข้อมูลสรุปกับพร้อมเพย์ ผู้มีลิงก์สามารถอ่านข้อมูลเหล่านี้ได้จนเพิกถอน

การบันทึกผ่าน save_bill เป็น transaction ปรับ JSON และตารางลูกพร้อมกัน API ตรวจข้อมูลด้วย Zod และคำนวณซ้ำบน server ใช้ expectedUpdatedAt ตรวจเวอร์ชัน หากอีกหน้าต่างแก้ไปแล้วจะตอบ 409 เพื่อป้องกันบันทึกทับโดยไม่รู้ตัว Realtime แจ้งให้เปิดฉบับล่าสุด; ไม่รวมการแก้ไขขัดกันอัตโนมัติ

Guest บันทึกในเครื่องอัตโนมัติ ส่วนสมาชิกต้องกดบันทึกเข้าบัญชีหลังแก้บิล ก่อนสร้างลิงก์หรือเปลี่ยนสถานะโอน เว็บจะบันทึกฉบับที่แก้ก่อน การเปลี่ยนสถานะโอนแสดงทันทีและคืนสถานะเดิมถ้า server ไม่สำเร็จ

## ทดสอบ

~~~powershell
npm.cmd run check
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
~~~

- check รวม TypeScript, ESLint และ Vitest ทั้ง unit/property tests, validation, storage, PromptPay payload และ PostgreSQL/RLS
- npm.cmd run test:rls รันเฉพาะฐานข้อมูลด้วย PGlite ซึ่งรัน PostgreSQL จริง พร้อมจำลอง auth schema/roles ไม่ต้องใช้ Supabase credentials ครอบคลุมผู้ใช้ A/B, ตารางลูก, RPC, ลิงก์แชร์, stale save, ลบเพื่อน และ seed
- E2E เปิด production server ให้เองที่พอร์ต 3000 ครอบคลุมคำนวณ บันทึก/เรียกประวัติ จำกัด Guest ระบุยอด ลบคน PNG หน้าจอเดสก์ท็อป/มือถือ ธีมมืด offline และลิงก์ผิด
- การเข้าสู่ระบบจริง การส่งอีเมล Google OAuth และ Realtime บน Supabase hosted ต้องทดสอบกับ project ที่ตั้งค่าแล้ว ยังไม่ผ่านการทดสอบกับบัญชีจริงในเครื่องนี้
- PromptPay ทดสอบ payload/CRC และยอดแบบจำนวนเต็มแล้ว ยังไม่ได้ตรวจสแกนกับแอปธนาคารจริง

## PWA และการใช้งาน production

~~~powershell
npm.cmd run build
npm.cmd run start
~~~

Service worker ลงทะเบียนเฉพาะ production หลังเปิดเว็บออนไลน์และ worker พร้อมแล้ว จึงใช้ Guest แบบ offline ได้ การติดตั้ง PWA/Web Share ต้องใช้เบราว์เซอร์ที่รองรับและ secure context (HTTPS หรือ localhost) ระบบสมาชิกและลิงก์แชร์ต้องมีอินเทอร์เน็ต

เมื่อนำขึ้นโฮสต์ Next.js ให้ตั้ง env ทั้งสามค่า ตั้ง NEXT_PUBLIC_SITE_URL เป็น origin ของเว็บจริง แล้วเพิ่ม callback ใน Supabase Auth ก่อน build ไฟล์ .env.local ใช้เฉพาะเครื่องพัฒนา

## โครงสร้าง

~~~text
src/app/                 หน้าเว็บ, API Route Handlers, auth callback, share page
src/components/          หน้าจัดการบิล, สรุป, modal
src/lib/split/           คำนวณเงิน/กระจายเศษ/ยอดสุทธิ
src/lib/validation/      Zod ที่ client/server ใช้ร่วมกัน
src/lib/supabase/        Supabase browser/server clients
src/lib/draft.ts         บิลเริ่มต้น เทมเพลต versioned localStorage
supabase/migrations/     schema, constraints, RLS และ RPC
supabase/seed.sql        ข้อมูลตัวอย่างผ่าน RPC จริง
tests/database/          PostgreSQL/RLS integration tests
tests/e2e/               Playwright flows เดสก์ท็อปและมือถือ
public/                  ฟอนต์ ไอคอน manifest และ service worker
docs/                    ข้อตกลงสูตรและรายละเอียด allocation
~~~

## Privacy Policy และ Terms of Service

- หน้า /policy แสดงนโยบายความเป็นส่วนตัวภาษาไทย อ่านได้ก่อนยอมรับเงื่อนไข ลิงก์อยู่หน้าล็อกอินและท้ายเว็บ
- Terms of Service แสดงเป็นหน้าต่างก่อนเริ่มใช้เว็บ กดยอมรับแล้วจำเวอร์ชันใน localStorage (handi:terms:accepted) เมื่อเข้าเว็บอีกครั้งในเบราว์เซอร์เดิมจะไม่ขึ้นซ้ำ
- ล้างข้อมูลเว็บไซต์ เปลี่ยนเบราว์เซอร์ หรือแก้ TERMS_VERSION ใน src/lib/legal.ts จะแสดงให้ยอมรับใหม่ เปิดอ่านซ้ำได้จากหน้าล็อกอินและท้ายเว็บ
- หน้าล็อกอินต้องติ๊กยอมรับเงื่อนไขและรับทราบนโยบายก่อนใช้ Google หรืออีเมล โดยตรวจทั้งสถานะปุ่มและฟังก์ชันล็อกอิน เปิดหน้าล็อกอินรอบใหม่จะต้องติ๊กใหม่ การยอมรับ Terms ตอนเข้าเว็บไม่ติ๊กช่องนี้แทนผู้ใช้
- สถานะยอมรับเก็บเฉพาะเบราว์เซอร์ ไม่ได้บันทึกเป็นประวัติการยอมรับต่อบัญชีในฐานข้อมูล และไม่เปิดใช้งาน Supabase แทนการตั้งค่าจริง
