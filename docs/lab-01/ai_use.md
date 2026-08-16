# Lab 1 AI Use and Reflection
ผมใช้ **Antigravity IDE** โดยเลือกโมเดลที่ใช้เป็น **Claude Sonnet 4.6 (thinking)** และ **gemini 3 pro**(thinking) แบบchat บน browser

## Selected Key Prompts

| # | Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|---|
| 1 | สรุปเนื้อหาของ Lab1_Labsheet.md | สรุปเนื้อหาของ Lab1_Labsheet.md | AI สรุปออกมาได้สั้นลงและกระชับขึ้น แต่ต้อง recheck ด้วยตัวเองอีกที |
| 2 | Setup Prisma และ Database | Bootstrap ยังไม่ถูกใช้งานจริง / Prisma ยังไม่ถูกตั้งค่า / .env.example เหมือนจะยังว่างอยู่ | AI วิเคราะห์สาเหตุได้ตรงจุด แก้ Prisma v7 config และปรับปรุง README ให้ถูกต้องตาม architecture จริง |
| 3 | Implement Health Check API & UI (Issue 2) | ตอนนี้อยู่ที่ issue 2 ค่อยๆเริ่มทำตามสเต็ปในไฟล์เน้นทำตาม Requiment | AI แตกงานตาม Acceptance Criteria ของ Issue 2: สร้าง `feature/2-health-check`, ทำ endpoint `GET /api/health`, เขียน Supertest, ทำ UI Check System บน React พร้อม Vitest tests |
| 4 | Create and Seed Categories (Issue 3) | ทำissue 3 ให้ได้ตามrequiment | AI ทำการเพิ่ม Category model บน Prisma schema, สร้าง migration `init_category`, เขียน seed script แบบ idempotent ด้วย `upsert` ครบทั้ง 4 หมวดหมู่ และทดสอบรันซ้ำเพื่อยืนยันว่าไม่มี duplicate |
| 5 | Display Category List (Issue 4) | ต่อ issue 4 เลย | AI นำความต้องการจาก Lab Sheet สร้าง endpoint `GET /api/categories` โดยดึงข้อมูลจาก PostgreSQL ผ่าน Prisma Client v7 (จัดเรียงตาม id จากน้อยไปมาก), เขียน Supertest `api-02-categories.test.ts`, อัปเดต React UI ให้เรียก API ทั้งคู่และแสดงผลรายการ Supported Request Categories แบบไดนามิก พร้อมเขียน Vitest UI tests (`UI-01`, `UI-02`, `UI-03`) ผ่านครบ 100% |
| 6 | Debug Database Connection & Test Failures | แก้Error | AI วิเคราะห์ stack trace จาก Vitest และพบว่าเกิด `ECONNREFUSED` เพราะ PostgreSQL Docker container ยังไม่ได้เปิดทำงาน และข้อมูล Category ยังไม่ได้ seed AI จึงช่วยสั่งรัน `docker compose up -d`, `npx prisma migrate dev`, และ `npx tsx prisma/seed.ts` จน tests ทั้งฝั่ง Server และ Client ผ่านครบทั้งหมด |
| 7 | Git Workflow & Branch Synchronization | push error  / แก้ไข fatal: pathspec did not match | AI ช่วย pull อัปเดตล่าสุดจาก GitHub (`feature/4-category-list`) มารวมกับโค้ด local และช่วยแนะนำคำสั่งในการ resolve path ของ Git ขณะรันจากโฟลเดอร์ `server` ไปยัง root |

---

## Reflection & Key Takeaways

### 1. สิ่งที่ AI ช่วยเพิ่มประสิทธิภาพ (Strengths & Benefits)
- **Scaffolding & Boilerplate Generation:** AI สามารถสร้างโค้ดตามโครงสร้างของโปรเจกต์ได้อย่างรวดเร็ว ทั้ง Prisma schema, Express endpoints, React components รวมถึงการคอนฟิก TypeScript ให้ทำงานร่วมกันได้อย่างราบรื่น
- **Automated Testing:** การให้ AI ช่วยเขียน Supertest และ Vitest ช่วยครอบคลุม Acceptance Criteria ทั้ง Happy path และ Failure case ทำให้มั่นใจในคุณภาพของโค้ดก่อนส่ง Pull Request
- **Fast Troubleshooting & Error Analysis:** เมื่อเกิดข้อผิดพลาด เช่น `ECONNREFUSED` หรือปัญหาเรื่อง Directory path ของ Git การให้ AI ช่วยวิเคราะห์ error log ทำให้ระบุสาเหตุและแนวทางแก้ไขได้อย่างแม่นยำ

### 2. ข้อจำกัดและสิ่งที่ต้องควบคุมด้วยตนเอง (Human-in-the-Loop Oversight)
- **Infrastructure & Environment State:** AI อาจไม่ทราบสถานะเบื้องหลังของระบบ (เช่น Docker container กำลังรันอยู่หรือไม่ หรือ Service ภายนอกพร้อมใช้งานหรือยัง) ผู้พัฒนาจึงต้องเข้าใจ architecture และตรวจสอบ runtime environment ควบคู่ไปด้วย
- **Verification of AI Output:** ต้องมีการรัน Unit Test, Integration Test และ manual test ซ้ำเสมอ เพื่อป้องกันกรณีที่ AI hallucinate หรือเขียน logic ที่ไม่ตรงตามเงื่อนไขของ Lab Sheet
- **Git & Collaboration Control:** การจัดการ Branch, Merge conflicts, และการทำ Code Review ยังคงต้องอาศัยการตัดสินใจและการสื่อสารระหว่างคนในทีมเป็นหลัก
