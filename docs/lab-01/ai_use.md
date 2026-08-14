# Lab 1 AI Use and Reflection
ผมใช้ **Antigravity IDE** โดยเลือกโมเดลที่ใช้เป็น **Claude Sonnet 4.6 (thinking)** และ **gemini 3 pro**(thinking) แบบchat บน browser

## Selected Key Prompts

| # | Prompt Name | Actual Prompt Text | My Reflection |
|---|---|---|---|
| 1 | สรุปเนื้อหาของ Lab1_Labsheet.md | สรุปเนื้อหาของ Lab1_Labsheet.md | AI สรุปออกมาได้สั้นลงและกระชับขึ้น แต่ต้อง recheck ด้วยตัวเองอีกที |
| 2 | Setup Prisma และ Database | Bootstrap ยังไม่ถูกใช้งานจริง / Prisma ยังไม่ถูกตั้งค่า / .env.example เหมือนจะยังว่างอยู่ | AI วิเคราะห์สาเหตุได้ตรงจุด แก้ Prisma v7 config และปรับปรุง README ให้ถูกต้องตาม architecture จริง |
| 3 | Implement Health Check API & UI (Issue 2) | ตอนนี้อยู่ที่ issue 2 ค่อยๆเริ่มทำตามสเต็ปในไฟล์เน้นทำตาม Requiment | AI แตกงานตาม Acceptance Criteria ของ Issue 2: สร้าง `feature/2-health-check`, ทำ endpoint `GET /api/health`, เขียน Supertest, ทำ UI Check System บน React พร้อม Vitest tests |
| 4 | TODO (Issue 3 / 4) | | |

---