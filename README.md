**Visual VN Editor - README (English / ไทย)**

**Project Overview**:
- **Name**: Visual VN Editor: a lightweight visual novel editor for creating chapters, frames, characters, backgrounds and story flow.
- **Purpose**: Build, preview and export VN scenes as JSON. Includes a node-based storyline editor (NodeGraphV2) and a live preview player.

**File Structure**:
- **index.html**: Main UI shell and layout.
- **style.css**: Project styling and preview styles.
- **settings.js**: App settings, theme and UI scale handling.
- **ui-overrides.js**: UI helpers (toasts, modals, loading) - exposes `showToast`, `showLoading`, `hideLoading` globally.
- **main.js**: Core editor logic: project model, editor actions, renderers, import/export, stage and inspector.
- **preview.js**: Runtime preview player and dialog typewriter logic.
- **node-graph-v2.js**: Storyline node graph editor for start/end, links and auto-apply to frames.

**Quick Start**:
- Open [index.html](index.html) in your browser (or run `live-server` in this folder).
- Use the menus / buttons to add characters, backgrounds and frames.
- Click "Play Preview" to open the preview modal and step through frames.

**Exporting & Importing Project JSON**:
- Export: Use the UI File → Export JSON (or the `exportJSON()` action in the app) to download the full project as a JSON file.
- Save: `saveJSON()` writes the project file using the app UI (uses localStorage auto-save by default).
- Import: File → Import JSON or the file input calls `importJSON(e)` which merges/validates project content.
- Images are embedded as data URLs in the exported JSON (optimized when `optimizeProjectImages()` is run).

**Processing the Exported File**:
- The exported JSON contains top-level keys: `assets`, `characters`, `chapters`.
- `chapters` → each chapter has `frames` (frame objects with `id`, `text`, `speakerId`, `background`, `slots`, `attributes`, `choices`).
- Use the `node-graph-v2` data (stored as `graphV2` inside a chapter) to reconstruct storyline links and start/end markers.
- To optimize images for production, run the `optimizeProjectImages()` logic (implemented in `main.js`) - it performs client-side compression on embedded images.

**Displaying / Previewing Results**:
- The preview player is implemented in `preview.js`. It reads the active chapter frames and renders characters into five slots (`pSlot0`..`pSlot4`).
- The preview supports text typing effect (`typeWriter`) and choices. Use `openPreview()` to launch the preview modal and `nextPreview()` to advance.
- For embedding exported JSON into other sites/apps, parse the JSON and replicate the preview rendering pipeline: background image, frame slots with `x/y/scale/mirror`, and dialog text.

**Development Notes & Further Work**:
- Node Graph: `node-graph-v2.js` maintains a local node graph and can apply link topology to frames. Use `openNodeGraphV2()` from the UI.
- Separation of concerns: Consider extracting preview renderer into a small library so external apps can reuse it (e.g., `vn-preview.js`).
- Save/Load: Project uses localStorage key `vnEditorProject_v1`. To add cloud sync, implement upload/download endpoints and serializing images to blobs.
- Tests: Add unit tests for `applyGraphLinksToFrames()` and for JSON import/validation.

**Troubleshooting**:
- "showToast is not defined": Ensure `ui-overrides.js` is included before `main.js` in `index.html`. After changes hard-refresh the browser (Ctrl+Shift+R) or restart your dev server.
- If imports fail for large images, enable the `showLoading()` / `hideLoading()` helpers (present in `ui-overrides.js`).

**Commands**:
- Start a dev server in this folder (example):
  - `npx live-server` or `live-server` (if installed globally)

**Contributing / Further guidance**:
- Fork and send PRs. Major improvements: componentize UI, split renderer, add export presets (separate images), add unit tests.

**License & Credits**:
- This repository contains the Visual VN Editor source. Credit the original project author(s) when reusing or publishing.

---

**เอกสารโครงการ (ภาษาไทย)**

**ภาพรวมโครงการ**:
- **ชื่อ**: Visual VN Editor - ตัวแก้ไขนิยายภาพแบบเบา ใช้สร้างบท ตัวละคร ภูมิหลัง และลำดับเรื่อง
- **จุดประสงค์**: สร้าง ดูตัวอย่าง และส่งออกฉากในรูปแบบ JSON พร้อมเครื่องมือตกแต่ง storyline แบบกราฟ

**โครงสร้างไฟล์**:
- **index.html**: โครง UI หลัก
- **style.css**: สไตล์ของโปรเจกต์
- **settings.js**: จัดการการตั้งค่าแอป (ธีม, ขนาด UI)
- **ui-overrides.js**: ฟังก์ชันช่วย UI (toast, modal, loading) - ให้ `showToast`/`showLoading`/`hideLoading` เป็น global
- **main.js**: โลจิกหลักของ editor (โมเดลโปรเจกต์, การเรนเดอร์, นำเข้า/ส่งออก)
- **preview.js**: ตัวเล่นตัวอย่าง (typewriter, แสดงตัวละคร)
- **node-graph-v2.js**: ตัวแก้ไขโหนดสำหรับ storyline

**วิธีเริ่มต้นใช้งาน**:
- เปิด [index.html](index.html) ในเบราว์เซอร์ หรือรัน `live-server` ในโฟลเดอร์นี้
- สร้าง/แก้ไขตัวละคร ฉาก และเฟรม ผ่านอินเทอร์เฟซ
- กด "Play Preview" เพื่อดูตัวอย่าง

**การส่งออก-นำเข้า JSON**:
- ส่งออก: ใช้เมนูหรือฟังก์ชัน `exportJSON()` เพื่อดาวน์โหลดไฟล์โปรเจกต์ทั้งหมด
- นำเข้า: เมนูนำเข้าเรียก `importJSON(e)` ซึ่งจะทำการตรวจสอบและรวมข้อมูลเข้ากับโปรเจกต์
- รูปภาพจะถูกฝังเป็น data URL ใน JSON (มีการบีบอัดเมื่อเรียก `optimizeProjectImages()`)

**การประมวลผลไฟล์ที่ส่งออก**:
- JSON ประกอบด้วย `assets`, `characters`, `chapters`
- แต่ละ `frame` มี `id`, `text`, `speakerId`, `background`, `slots`, `attributes`, `choices`
- ใช้ข้อมูล `graphV2` ภายใน chapter เพื่อคืนสถานะลิงก์ของ storyline

**การแสดงผล / ดูตัวอย่าง**:
- ตัวเล่นตัวอย่างทำใน `preview.js` - อ่านเฟรมใน chapter ปัจจุบัน และแสดงตัวละครในห้าช่อง (`pSlot0`..`pSlot4`)
- รองรับ effect การพิมพ์ (`typeWriter`) และปุ่มตัวเลือก

**การพัฒนาเพิ่มเติม**:
- แยก renderer เป็นโมดูลเพื่อให้นำไปใช้ในที่อื่นได้ง่ายขึ้น
- เพิ่มระบบสำรองข้อมูลบนคลาวด์ และจัดเก็บรูปภาพแยกไฟล์เพื่อขนาดไฟล์ที่เล็กลง
- เพิ่มชุดทดสอบอัตโนมัติสำหรับการนำเข้า/การตรวจสอบ JSON

**ปัญหาและการแก้ไขเบื้องต้น**:
- ถ้าเห็น error ว่า `showToast` ไม่พบ ให้ตรวจสอบลำดับการโหลดสคริปต์ใน `index.html` ว่า `ui-overrides.js` โหลดก่อน `main.js` และทำ hard-refresh

**ติดต่อ/เครดิต**:
- นำซอร์สไปใช้ต่อให้เครดิตผู้พัฒนาเดิมตามเหมาะสม
