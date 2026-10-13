# ติดตั้งเครื่องสำหรับพัฒนา (Windows)

ทำตามทีละขั้น ครั้งเดียวจบ ใช้เวลาประมาณ 30–60 นาที (ส่วนใหญ่รอดาวน์โหลด)
ติดตรงไหนให้ก๊อปข้อความ error ทั้งหมดไปถามในกลุ่ม หรือเปิด Issue ใน GitHub

**สิ่งที่จะได้ตอนจบ:** เปิด http://localhost:5500 แล้วหน้าแรกขึ้นว่า **"API เชื่อมต่อแล้ว · ฐานข้อมูล: ok"**

---

## 0. ต้องมีอะไรบ้าง

| โปรแกรม | ใช้ทำอะไร | ต้องมีไหม |
|---|---|---|
| WSL2 | ระบบที่ Docker ใช้รันบน Windows | ต้องมี |
| Docker Desktop | รันฐานข้อมูล, API และหน้าเว็บ | ต้องมี |
| Git for Windows | ดึงและส่งโค้ดกับ GitHub | ต้องมี |
| VS Code | เขียนโค้ด | ต้องมี |
| Node.js 24.21.0 | ให้ VS Code ช่วยเติมโค้ด (ตัวระบบไม่ได้ใช้ เพราะรันใน Docker) | ไม่บังคับ |

เครื่องควรเป็น Windows 10 (อัปเดตล่าสุด) หรือ Windows 11 และมี RAM 8 GB ขึ้นไป

---

## 1. เช็กว่าเครื่องเปิด Virtualization แล้ว

Docker ต้องใช้ความสามารถนี้ของ CPU

1. กด `Ctrl + Shift + Esc` เพื่อเปิด Task Manager
2. ไปที่แท็บ **Performance** → เลือก **CPU**
3. ดูมุมขวาล่าง บรรทัด **Virtualization**
   - ถ้าเป็น **Enabled** → ข้ามไปขั้นที่ 2 ได้เลย
   - ถ้าเป็น **Disabled** → ต้องเปิดใน BIOS ตามด้านล่าง

**เปิดใน BIOS**
1. รีสตาร์ตเครื่อง แล้วกดปุ่มเข้า BIOS รัว ๆ ตอนโลโก้ขึ้น ปุ่มขึ้นกับยี่ห้อ ส่วนใหญ่คือ `F2` หรือ `Del` (บางรุ่นเป็น `F10`, `F1` หรือ `Esc`)
2. หาเมนูชื่อประมาณ **Intel Virtualization Technology** / **Intel VT-x** (เครื่อง Intel) หรือ **SVM Mode** (เครื่อง AMD) มักอยู่ในหมวด Advanced หรือ CPU Configuration
3. ตั้งเป็น **Enabled** → Save and Exit (ส่วนใหญ่กด `F10`)

---

## 2. เปิด WSL2

1. กดปุ่ม Start พิมพ์ `PowerShell` → คลิกขวา → **Run as administrator**
2. พิมพ์คำสั่งนี้แล้วกด Enter

   ```powershell
   wsl --install
   ```

3. รอจนเสร็จ แล้ว**รีสตาร์ตเครื่อง**
4. หลังรีสตาร์ต ถ้ามีหน้าต่าง Ubuntu เด้งขึ้นมาให้ตั้ง username/password ก็ตั้งไปได้เลย (ไม่ได้ใช้ในงานนี้ แต่ต้องตั้งให้เสร็จ)

**เช็ก:** เปิด PowerShell ใหม่แล้วพิมพ์ `wsl --version` ต้องขึ้นเลขเวอร์ชัน ถ้าขึ้นว่าต้องอัปเดตให้พิมพ์ `wsl --update`

---

## 3. ติดตั้ง Docker Desktop

1. ดาวน์โหลดจาก https://www.docker.com/products/docker-desktop/ → **Download for Windows**
2. เปิดไฟล์ติดตั้ง ในหน้า Configuration **ต้องติ๊ก "Use WSL 2 instead of Hyper-V"**
3. ติดตั้งเสร็จแล้วรีสตาร์ตเครื่อง (หรือ Sign out แล้วเข้าใหม่ ตามที่ตัวติดตั้งบอก)
4. เปิดแอป **Docker Desktop** → กดยอมรับเงื่อนไข → ถ้าให้ล็อกอิน กด **Skip** ได้
5. รอจนมุมซ้ายล่างขึ้น **Engine running** (สีเขียว)

**เช็ก:** เปิด PowerShell แล้วพิมพ์

```powershell
docker --version
docker compose version
```

ต้องขึ้นเลขเวอร์ชันทั้ง 2 บรรทัด

> ทุกครั้งที่จะทำงาน **ต้องเปิดแอป Docker Desktop ก่อน** ไม่งั้นคำสั่ง docker จะใช้ไม่ได้

---

## 4. ติดตั้ง Git for Windows

1. ดาวน์โหลดจาก https://git-scm.com/download/win
2. เปิดไฟล์ติดตั้ง กด **Next** ได้เกือบทุกหน้า มีหน้าเดียวที่ควรเปลี่ยน:
   - **Choosing the default editor used by Git** → เลือก **Use Visual Studio Code as Git's default editor**
3. หน้าอื่นใช้ค่าที่ตั้งไว้ให้ได้เลย (ไฟล์ `.gitattributes` ใน repo จัดการเรื่องการขึ้นบรรทัดให้แล้ว)

**เช็ก:** `git --version` ต้องขึ้นเลขเวอร์ชัน

---

## 5. ติดตั้ง VS Code

1. ดาวน์โหลดจาก https://code.visualstudio.com/
2. ตอนติดตั้งให้ติ๊ก **Add "Open with Code" action** และ **Add to PATH** (ปกติติ๊กไว้ให้แล้ว)

(ไม่บังคับ) ลง Node.js 24.21.0 จาก https://nodejs.org/en/download

---

## 6. ตั้งชื่อใน Git

ทำครั้งเดียว ใช้ชื่อและอีเมลเดียวกับบัญชี GitHub งานที่ส่งจะได้ขึ้นชื่อเราถูกคน (อาจารย์ใช้ดูว่าใครทำอะไร)

```powershell
git config --global user.name "ชื่อ นามสกุล"
git config --global user.email "อีเมลที่ใช้สมัคร GitHub"
```

---

## 7. ดึงโปรเจกต์ลงเครื่อง

> **อย่าเก็บโปรเจกต์ใน OneDrive** เช่น Desktop หรือ Documents ที่ซิงก์กับ OneDrive อยู่ เพราะ OneDrive จะซิงก์ไฟล์ชนกับ Docker ให้เก็บที่ `C:\Users\<ชื่อ>\Projects` แทน

เปิด PowerShell (ไม่ต้อง admin) แล้วพิมพ์ทีละบรรทัด

```powershell
mkdir $HOME\Projects
cd $HOME\Projects
git clone https://github.com/PhakawatL/maison-de-relic.git
cd maison-de-relic
code .
```

- ครั้งแรกที่ใช้ Git กับ GitHub จะมีหน้าต่างให้ล็อกอิน GitHub ในเบราว์เซอร์ ให้ล็อกอินให้เรียบร้อย
- `code .` จะเปิดโปรเจกต์ใน VS Code ถ้ามีหน้าต่างถามว่า **Do you trust the authors?** ให้กด **Yes**
- มุมขวาล่างจะเด้งว่ามี **extension แนะนำ** ให้กด **Install** (Container Tools, EditorConfig, PostgreSQL)

---

## 8. เปิดระบบครั้งแรก

1. เปิดแอป Docker Desktop ให้ขึ้น Engine running
2. ใน VS Code กด `` Ctrl + ` `` (ปุ่มตัวหนอนใต้ Esc) เพื่อเปิด Terminal
3. พิมพ์

   ```powershell
   docker compose up --build
   ```

4. ครั้งแรกจะดาวน์โหลดนาน 3–10 นาที รอจนเห็นบรรทัด

   ```
   api-1  | API พร้อมใช้งานที่ http://localhost:3000/api/health (development)
   ```

5. เปิดเบราว์เซอร์ไปที่ **http://localhost:5500**
   หน้าแรกต้องขึ้นว่า **"API เชื่อมต่อแล้ว · ฐานข้อมูล: ok"** ✅

ปล่อย Terminal นี้เปิดทิ้งไว้ระหว่างทำงาน ถ้าจะพิมพ์คำสั่ง git ให้เปิด Terminal ใหม่ (กดปุ่ม **+** ในแผง Terminal)

---

## 9. ทำงานทุกวัน

```powershell
git checkout main
git pull
docker compose up
```

- แก้โค้ด backend แล้ว API รีสตาร์ตเอง (ถ้าไม่รีสตาร์ตเอง ดูข้อ 10)
- แก้โค้ด frontend แล้วกด refresh ในเบราว์เซอร์
- เลิกงาน: กด `Ctrl + C` ใน Terminal ที่รันอยู่ หรือพิมพ์ `docker compose down`

วิธีแตก branch และส่งงาน ดูที่หัวข้อ "กติกาทีม" ใน README

---

## 10. เจอปัญหา

| อาการ / ข้อความ | วิธีแก้ |
|---|---|
| `error during connect` หรือ `dockerDesktopLinuxEngine` | ยังไม่ได้เปิดแอป Docker Desktop ให้เปิดแล้วรอ Engine running |
| `'docker' is not recognized` / `'git' is not recognized` | เพิ่งติดตั้งเสร็จ ให้ปิดแล้วเปิด VS Code หรือ PowerShell ใหม่ ถ้ายังไม่หายให้รีสตาร์ตเครื่อง |
| Docker Desktop ค้างที่ "Starting..." นาน | ใน PowerShell พิมพ์ `wsl --shutdown` แล้วเปิด Docker Desktop ใหม่ ถ้ายังไม่ได้ให้รีสตาร์ตเครื่อง |
| Docker บอกว่า WSL ต้องอัปเดต | `wsl --update` แล้วเปิด Docker Desktop ใหม่ |
| Docker บอกว่า Virtualization ไม่ได้เปิด | กลับไปทำข้อ 1 |
| `port is already allocated` | มีโปรแกรมอื่นใช้ port อยู่ (มักเป็น PostgreSQL ที่เคยลงไว้) สร้างไฟล์ชื่อ `.env` ที่โฟลเดอร์นอกสุดของโปรเจกต์ ใส่ `DB_PORT=5433` แล้วรันใหม่ |
| แก้โค้ด backend แล้ว API ไม่รีสตาร์ตเอง | เป็นเรื่องปกติบน Windows บางเครื่อง ให้พิมพ์ `docker compose restart api` ใน Terminal ใหม่ |
| `Cannot find module ...` หลัง `git pull` | มีเพื่อนเพิ่ม package ให้รัน `docker compose up --build --renew-anon-volumes` |
| หน้าเว็บขึ้นว่า "API ยังเชื่อมต่อไม่ได้" | ดูใน Terminal ว่ากล่อง api มี error ไหม ก๊อปข้อความไปถามในกลุ่ม |
| อยากล้างฐานข้อมูลบนเครื่องแล้วเริ่มใหม่ | `docker compose down -v` แล้ว `docker compose up` |

---

## ✅ Checklist

- [ ] Task Manager ขึ้น Virtualization: Enabled
- [ ] `wsl --version` ขึ้นเลขเวอร์ชัน
- [ ] Docker Desktop ขึ้น Engine running
- [ ] `git --version` และ `docker compose version` ขึ้นเลขเวอร์ชัน
- [ ] ตั้ง `git config user.name` / `user.email` แล้ว
- [ ] clone โปรเจกต์ไว้ที่ `C:\Users\<ชื่อ>\Projects\maison-de-relic` (ไม่ใช่ใน OneDrive)
- [ ] ติดตั้ง extension ที่ VS Code แนะนำแล้ว
- [ ] `docker compose up --build` แล้วเปิด http://localhost:5500 เห็น **"API เชื่อมต่อแล้ว · ฐานข้อมูล: ok"**
