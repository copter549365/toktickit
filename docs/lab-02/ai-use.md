# Lab 2 AI Use and Reflection

**Tools & Models Used:**
- **IDE:** Antigravity IDE
- **Models:** Claude 3.7 Sonnet (Thinking), Gemini 2.5 Pro (Thinking), Gemini 3.7 Flash

---

## 1. Selected Key Prompts (Prompt Table)

| # | Prompt Name | Actual Prompt Text / Intent | My Reflection & Verification |
|:---:|---|---|---|
| **1** | **Spec-DD Engineering Contract (Issue 1)** | *สร้างเอกสาร Specification, API Spec, UI Spec และ Test Plan สำหรับ Lab 2 ตามแนวทาง Spec-Driven Development* | AI ช่วยร่างเอกสาร Spec และ API Contract อย่างละเอียด ทั้ง Error codes, Payload shapes, และ State transitions ช่วยลดความกำกวมก่อนเริ่มเขียนโค้ดจริง |
| **2** | **Prisma Schema & Zen Green Design System (Issue 2)** | *ออกแบบ Prisma Schema สำหรับ RequesterUser, Ticket, Attachment, RelatedSystem และสร้าง Zen Green CSS Variables* | AI สร้าง Migration และ Seed Data ได้อย่างแม่นยำ พร้อมโครงสร้างสี Zen Green ตาม WCAG Contrast แต่ต้องตรวจสอบความสัมพันธ์ของ Model (1:N, foreign keys) ด้วยตนเอง |
| **3** | **Requester Context & Header Propagation (Issue 3)** | *สร้าง Context จัดการ Requester Selection และ Middleware ตรวจสอบ `x-requester-id`* | AI ออกแบบ Context และ Axios Interceptor ให้แนบ `x-requester-id` ทุก Request อัตโนมัติ พร้อม Return `400/401` เมื่อ Context ไม่ถูกต้อง |
| **4** | **Create Ticket & File Upload Pipeline (Issue 4)** | *ทำหน้า Create Ticket พร้อม Form Validation, รหัสตั๋วแบบ `TICK-YYYYMM-XXXX`, และระบบแนบไฟล์รูปภาพ/PDF ขนาดไม่เกิน 5MB* | AI ช่วยเขียน Multer Middleware และจัดเก็บไฟล์ลงใน `uploads/` พร้อมคำนวณ Sequential Ticket Number แบบ Atomic ได้ถูกต้องตามเกณฑ์ |
| **5** | **My Tickets & Owner Isolation (Issue 5)** | *ทำหน้า My Tickets พร้อม Search, Category/Status Filters, Sorting, Pagination (10 ต่อหน้า) และกรองเฉพาะตั๋วของ Requester ปัจจุบัน* | AI ช่วยจัดการ Query Params ซิงค์กับ URL และเขียน Unit/Integration Tests ตรวจสอบว่า Requester ไม่สามารถเห็นตั๋วของคนอื่นได้ |
| **6** | **Ticket Detail & Soft-Remove Attachment (Issue 6)** | *สร้างหน้ารายละเอียดตั๋วแบบ Read-only, การดาวน์โหลดไฟล์แนบ และฟังก์ชัน Soft-Remove พร้อมบันทึกเหตุผล 3–200 ตัวอักษร* | AI ออกแบบ Logic การ Soft-delete ได้ถูกต้อง (เก็บ `removedAt`, `removalReason` และบล็อกไม่ให้ดาวน์โหลดไฟล์ที่ถูกลบ) |
| **7** | **Playwright E2E & Responsive Screenshots (Issue 7)** | *เขียน Playwright E2E Tests ครอบคลุม User Journey และแคปเจอร์ 42 Screenshots ตาม Viewport (Desktop, Tablet, Mobile)* | AI ช่วยสร้าง E2E Spec และตรวจพบ Bug จริง 2 จุด (Focus Outline ของปุ่มหายไป และ Attachment text wrapping ในจอมือถือ) ซึ่งได้รับการแก้ไขจริง |
| **8** | **Git Release & Staging Flow** | *แก้ปัญหาการ Merge และเตรียม Release Pull Request จาก `lab2-staging` เข้า `main`* | AI ช่วยตรวจสอบ Git tree, แนะนำคำสั่ง Reset `main` ที่ปลอดภัยเพื่อเปิด PR ให้เพื่อนตรวจได้อย่างถูกต้องตาม Flow ของวิชา |

---

## 2. Reflection & Key Takeaways

### 1. สิ่งที่ AI ช่วยเพิ่มประสิทธิภาพ (Strengths & Benefits)
- **TDD & Test Coverage:** AI ช่วยเขียน Test Suites ทั้ง Unit Test (Vitest/Jest), API Integration Test (Supertest) และ E2E Test (Playwright) ได้อย่างครอบคลุม ทั้งกรณี Happy Path, Validation Errors และ Boundary Conditions
- **Catching Real UI Defects:** การใช้ AI ช่วยเขียน Playwright รันและตรวจสอบ Responsive Screenshots ช่วยให้พบ Defect ของหน้าตา UI จริง เช่น Keyboard Focus Visibility และ Flexbox Text Overflow ใน Mobile Breakpoint
- **Code Consistency & Architecture:** ช่วยควบคุมการตั้งชื่อตัวแปร รูปแบบ API Responses และ Design Tokens ให้สอดคล้องกันตลอดทั้งโปรเจกต์

### 2. ข้อจำกัดและสิ่งที่ต้องควบคุมด้วยตนเอง (Human-in-the-Loop Oversight)
- **Business Logic & Security Edge Cases:** การตรวจสอบสิทธิ์การเข้าถึงข้อมูล (Owner Isolation) และ Logic การลบไฟล์แนบ (Soft-remove) ต้องมี Human Review เพื่อยืนยันว่าไม่มีช่องโหว่ด้าน IDOR หรือ Path Traversal
- **Git Strategy & Pull Request Discipline:** การควบคุม Branching Strategy (Feature Branch $\rightarrow$ Staging $\rightarrow$ Main) และการประสานงาน Code Review ระหว่างเพื่อนในทีม ต้องอาศัยความเข้าใจและวินัยในการทำ Git Workflow ของมนุษย์
- **Visual Design Fine-Tuning:** แม้ AI จะสร้าง Layout และ CSS ได้ แต่การตรวจเช็คความสบายตา ความลื่นไหลในการใช้งาน (UX) และการจัดสัดส่วน Typography ยังต้องอาศัยการทดลองใช้งานจริงผ่านเบราว์เซอร์
