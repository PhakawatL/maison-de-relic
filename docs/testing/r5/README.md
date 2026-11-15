# R5 Backend — Demo และ Test Cases

เอกสารสำหรับนำไปรวม README ทดสอบระบบของทีม Maison de Relic · R5 Cart / Checkout / Payment / Orders / Admin Orders ตรวจเทียบโค้ดวันที่ 15 พฤศจิกายน 2026 ใช้ API prefix `/api` ไม่ใช่ `/api/v1`

## 1. ขอบเขตและการเตรียม Demo

ลำดับหลัก: Login → Cart → Quote → Omise Test → Order → Admin จัดส่ง → Customer ยืนยันรับ → R1 Review/Refund → R3 Sales / R4 Events

| ส่วน | เจ้าของ / สิ่งที่ต้องพร้อม |
|---|---|
| Login / verified customer / admin / Address | R2; ต้องมี customer ที่ยืนยันอีเมลแล้วและที่อยู่ของตนเอง |
| Product / Inventory | R3; สินค้า `available` และมี stock จริง R5 เรียก `applyStockChange` ด้วย transaction เดียวกับ Order |
| Cart / Quote / Payment / Order / Fulfillment | R5; รัน Backend พร้อม migrations และ outbox worker |
| Review / Refund | R1; แยกจาก R5 แต่ทดสอบจุดเชื่อมหลัง Delivered ได้ |
| Sales / Events | R3 / R4; ตรวจด้วยข้อมูลจาก flow นี้ |

เตรียมบัญชี customer A, customer B (ทดสอบสิทธิ์ข้ามบัญชี), admin และ unverified customer ใช้บัญชี seed ตาม [API contract — บัญชีทดสอบ](../../api.md#บัญชีทดสอบ-seed-002_userssql) หรือบัญชี Demo ที่ทีมเตรียม ไม่บันทึก password/token/key จริงในรายงาน

เครื่องผู้รันต้องมี Docker Desktop และ PowerShell; คำสั่ง Frontend tests ท้ายเอกสารต้องมี Node.js 24 บน host ส่วน Backend ใช้ Node ใน container. คำสั่งตัวอย่างเป็น PowerShell ไม่ใช่ Bash

เตรียมสินค้า Demo สองชิ้นผ่าน R3 ก่อนเริ่ม:

- P1 ราคา **฿100** สต็อกอย่างน้อย **5** สถานะ `available`
- P2 ราคา **฿1,500** สต็อกอย่างน้อย **2** สถานะ `available`
- Cart ของ customer A ควรว่าง และไม่มี payment attempt ค้างอยู่ อย่าใช้สินค้าหรือออเดอร์ส่วนตัว
- ไม่ยึด IDs จากเครื่องผู้พัฒนา เช่น 1878/1879 หรือ 2503/2504 เพราะเครื่องอาจารย์มี IDs ต่างกัน
- ถ้าตรวจทาง provider ให้ตั้ง Omise **Test** public/secret keys ที่ `.env` ฝั่ง server ตาม [setup](../../setup.md); ถ้า Demo ไม่ใช้ key/เน็ตให้ใช้หัวข้อ 5 ทางเลือก Offline แทน ห้ามใส่ secret ใน Postman/frontend
- ปุ่ม/API เปลี่ยนผล PromptPay Test ใช้ได้เมื่อ `NODE_ENV` ไม่ใช่ `production`; Docker compose หลักตั้ง `development` ไว้แล้ว ต้องเชื่อมอินเทอร์เน็ตถึง Omise

```powershell
# ทำที่ root ของ repository; ไม่ลบ database volume
docker compose up -d --build --renew-anon-volumes
docker compose ps
Invoke-RestMethod http://localhost:3000/api/health
```

Expected: api/db/web healthy, health เป็น `status: ok`, `db: ok` เว็บ `http://localhost:5500` API `http://localhost:3000/api`

## 2. ตั้งค่า PowerShell สำหรับเรียก API

ใช้ PowerShell session เดียวตลอด Demo ฟังก์ชันนี้ใช้ได้กับทั้งกรณีผ่านและ error: จะหยุดถ้า HTTP status ไม่ตรง Expected โดยไม่พิมพ์ token ออกมา นำ method/path/body ไปใช้ Postman แทนได้

```powershell
$Base = 'http://localhost:3000/api'
function Invoke-R5 {
    param([string]$Method, [string]$Path, [string]$Token = '',
          $Body = $null, [int]$Expected = 200)
    $r5Request = @{ Uri = $Base + $Path; Method = $Method; UseBasicParsing = $true }
    if ($Token) { $r5Request.Headers = @{ Authorization = "Bearer $Token" } }
    if ($null -ne $Body) {
        $r5Request.ContentType = 'application/json; charset=utf-8'
        $r5Request.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 15))
    }
    try {
        $r5Response = Invoke-WebRequest @r5Request
        $r5Status = [int]$r5Response.StatusCode
        $r5Raw = $r5Response.Content
    } catch {
        if ($null -eq $_.Exception.Response) { throw }
        $r5Status = [int]$_.Exception.Response.StatusCode
        $r5Raw = $_.ErrorDetails.Message
    }
    if ($r5Status -ne $Expected) { throw "$Method $Path expected $Expected, got $r5Status : $r5Raw" }
    if ($r5Raw) { return ($r5Raw | ConvertFrom-Json) }
}

$CustomerCredential = Get-Credential -Message 'Verified customer A'
$CustomerLogin = Invoke-R5 POST '/auth/login' -Body @{
    username = $CustomerCredential.UserName
    password = $CustomerCredential.GetNetworkCredential().Password
}
$CustomerToken = $CustomerLogin.data.token
$AdminCredential = Get-Credential -Message 'Admin account'
$AdminLogin = Invoke-R5 POST '/auth/login' -Body @{
    username = $AdminCredential.UserName
    password = $AdminCredential.GetNetworkCredential().Password
}
$AdminToken = $AdminLogin.data.token
$CustomerId = [long](Invoke-R5 GET '/auth/me' -Token $CustomerToken).data.user_id

(Invoke-R5 GET '/products?inStock=true&pageSize=50').data | Format-Table product_id,title,price,stock_quantity
[int]$P1 = Read-Host 'Product ID ของ Demo P1 ราคา 100'
[int]$P2 = Read-Host 'Product ID ของ Demo P2 ราคา 1500'
$Addresses = (Invoke-R5 GET '/addresses' -Token $CustomerToken).data
$Addresses | Format-Table address_id,recipient_name,line1
[int]$AddressId = Read-Host 'Address ID ของ customer A'
$SessionId = 'r5-demo-' + [guid]::NewGuid().ToString('N')
$Active = (Invoke-R5 GET '/orders/payment-attempts/active' -Token $CustomerToken).data
if ($Active) { throw 'มีรายการจ่ายค้าง: เปิด Checkout เพื่อตรวจ/จบรายการเดิมก่อน อย่าสร้าง charge ซ้ำ' }
$InitialCart = (Invoke-R5 GET '/cart' -Token $CustomerToken).data
if (@($InitialCart.items).Count -ne 0) { throw 'ใช้ Cart Demo ที่ว่างก่อนเริ่ม ไม่ลบของผู้ใช้อื่นเพื่อเตรียมการทดสอบ' }
```

ถ้า Address ว่าง ให้สร้างผ่าน `/profile` หรือ `POST /addresses` ตาม contract ของ R2 ก่อน ส่วนนี้ไม่สร้างผู้ใช้/seed/reset DB เอง

## 3. Cart — R5-C01 ถึง C05

| ID | การทดสอบ / Expected |
|---|---|
| C01 | GET Cart ว่าง → 200 `data.items: []`; ไม่มี token → 401 |
| C02 | POST เพิ่ม P1 สองครั้ง → 201 ทั้งคู่ รวมเป็นหนึ่งแถว quantity 2 ไม่ลด stock |
| C03 | PATCH ตั้ง quantity → 200 เป็นจำนวนที่ตั้ง ไม่ใช่บวกเพิ่ม; 0 → 400; เกิน stock → 409 OUT_OF_STOCK และจำนวนเดิมไม่เปลี่ยน |
| C04 | DELETE สินค้าหนึ่งชิ้น → 204; ลบซ้ำ → 404 CART_ITEM_NOT_FOUND |
| C05 | POST ลบหลายชิ้น → 204; มีผลเฉพาะ Cart ของคนเรียก |

```powershell
Invoke-R5 GET '/cart' -Expected 401
Invoke-R5 POST '/cart/items' -Token $CustomerToken -Body @{product_id=$P1;quantity=1;session_id=$SessionId} -Expected 201
Invoke-R5 POST '/cart/items' -Token $CustomerToken -Body @{product_id=$P1;quantity=1;session_id=$SessionId} -Expected 201
Invoke-R5 PATCH "/cart/items/$P1" -Token $CustomerToken -Body @{quantity=1}
Invoke-R5 PATCH "/cart/items/$P1" -Token $CustomerToken -Body @{quantity=0} -Expected 400
$StockBefore = (Invoke-R5 GET "/products/$P1").data.stock_quantity
Invoke-R5 PATCH "/cart/items/$P1" -Token $CustomerToken -Body @{quantity=($StockBefore+1)} -Expected 409
Invoke-R5 DELETE "/cart/items/$P1" -Token $CustomerToken -Expected 204
Invoke-R5 DELETE "/cart/items/$P1" -Token $CustomerToken -Expected 404
Invoke-R5 POST '/cart/items' -Token $CustomerToken -Body @{product_id=$P1;quantity=1} -Expected 201
Invoke-R5 POST '/cart/items' -Token $CustomerToken -Body @{product_id=$P2;quantity=1} -Expected 201
Invoke-R5 POST '/cart/item-removals' -Token $CustomerToken -Body @{product_ids=@($P1,$P2)} -Expected 204
# เตรียมสำหรับ Checkout: P1 quantity 2 และ P2 quantity 1
Invoke-R5 POST '/cart/items' -Token $CustomerToken -Body @{product_id=$P1;quantity=2;session_id=$SessionId} -Expected 201
Invoke-R5 POST '/cart/items' -Token $CustomerToken -Body @{product_id=$P2;quantity=1;session_id=$SessionId} -Expected 201
```

อ่าน `GET /products/:id` ก่อน/หลัง Cart: stock ต้องคงเดิม การใส่ Cart ไม่จองสินค้า ไม่ตัด stock และไม่สร้าง Order

## 4. Quote / Shipping — R5-Q01 ถึง Q04

```powershell
$QuoteInput = @{ product_ids=@($P1); address_id=$AddressId; shipping_method='standard'; payment_method='promptpay'; session_id=$SessionId }
$Quote = (Invoke-R5 POST '/orders/quotes' -Token $CustomerToken -Body $QuoteInput).data
$Quote | Select-Object subtotal,shipping_fee,grand_total,quote_hash
$FreeQuote = (Invoke-R5 POST '/orders/quotes' -Token $CustomerToken -Body @{
    product_ids=@($P2);address_id=$AddressId;shipping_method='standard';payment_method='promptpay'
}).data
$ExpressQuote = (Invoke-R5 POST '/orders/quotes' -Token $CustomerToken -Body @{
    product_ids=@($P2);address_id=$AddressId;shipping_method='express';payment_method='promptpay'
}).data
```

| ID | Expected เมื่อเตรียมราคาตามหัวข้อ 1 |
|---|---|
| Q01 | เลือกเฉพาะ P1: มี P1 quantity 2 เท่านั้น subtotal 200 / shipping 40 / total 240; P2 ไม่รวมในยอด |
| Q02 | เลือก P2 ส่งธรรมดา: subtotal 1500 / shipping 0 / total 1500 |
| Q03 | เลือก P2 ส่งด่วน: shipping 80 / total 1580; ไม่ใช้เกณฑ์ฟรีธรรมดา |
| Q04 | ที่อยู่ customer B หรือสินค้าที่ไม่อยู่ Cart ถูกปฏิเสธ; quote ไม่ลด stock/สร้าง Order; ไม่มีส่วนลดจากตัวอย่าง Design |

## 5. PromptPay Test — R5-P01 ถึง P06

### ทางเลือก Demo ไม่มี key / ไม่มีเน็ต — R5-D01 ถึง D06

ใช้แทนหัวข้อ PromptPay/TrueMoney provider เมื่อเครื่องอาจารย์ไม่พร้อมเรียก Omise: ให้เว้น `OMISE_PUBLIC_KEY` และ `OMISE_SECRET_KEY` **ทั้งคู่** แล้ว recreate API ด้วย `docker compose up -d --force-recreate api` (ไม่ลบ volume). ไม่ต้องเผย key/ให้ AI อ่าน `.env`. ต้องไม่มีรายการ provider เดิมที่ยังตรวจผลไม่ได้; ห้ามเปลี่ยนโหมดเพื่อข้ามการจ่ายเดิม

1. D01: `GET /orders/payment-config` ด้วย CustomerToken → mode `simulated`. บน `/checkout` ต้องขึ้น “จ่ายจำลอง” และตัวเลือกผลสำเร็จ/ไม่สำเร็จ ไม่แสดง QR/พาออกไป wallet
2. D02: ใช้ `$QuoteInput` จากหัวข้อ 4 พร้อม quote_hash และ UUID ใหม่ POST `/orders` โดย `simulation_result='failed'` → 409 PAYMENT_SIMULATED_FAILED; Cart/stock คงเดิม
3. D03: เปลี่ยนเป็น succeeded (หลัง failed ใช้ key ใหม่) → 201 Order พร้อม `payment.method='simulated_promptpay'` หรือ simulated_truemoney, `payment.simulated=true`; stock/ledger/selected Cart ถูกต้องเหมือน flow จริง ไม่มี provider charge
4. D04: POST body/key เดิมอีกครั้ง → 200 replayed=true และ Order เดิม ไม่ตัด stock/ส่ง Purchase ซ้ำ
5. D05: ทดลอง Review/Refund/Fulfillment/Sales ต่อด้วย Order ID นี้ได้ เป็น DB จริงของ Demo ไม่ใช่ Preview และไม่มีการโอนเงินจริง
6. D06: กลับมาใส่ Test keys แล้ว recreate API → mode omise_test, POST `/orders` ถูกปิด 409 ตามเดิม; production ปิดจำลองเสมอ หาก provider เน็ตขัดข้องขณะตั้ง keys จะไม่สลับเป็นจำลองอัตโนมัติ

```powershell
$Config = (Invoke-R5 GET '/orders/payment-config' -Token $CustomerToken).data
if ($Config.mode -ne 'simulated') { throw 'ยังไม่ใช่ Offline Demo: ตรวจ configuration โดยไม่แสดง key' }
$DemoInput = @{} + $QuoteInput
$DemoInput.quote_hash = $Quote.quote_hash
$DemoInput.checkout_key = [guid]::NewGuid().ToString()
$DemoInput.simulation_result = 'failed'
Invoke-R5 POST '/orders' -Token $CustomerToken -Body $DemoInput -Expected 409
$DemoInput.checkout_key = [guid]::NewGuid().ToString()
$DemoInput.simulation_result = 'succeeded'
$Order = (Invoke-R5 POST '/orders' -Token $CustomerToken -Body $DemoInput -Expected 201).data
[long]$OrderId = $Order.order_id
Invoke-R5 POST '/orders' -Token $CustomerToken -Body $DemoInput
```

ถ้าเลือก offline Demo ให้ข้าม code ของ provider ในหัวข้อ 5/7 แล้วไปหัวข้อ 6 ด้วย OrderId นี้; ที่อยู่/Cart/สินค้า/quote ยังต้องเตรียมจริงตามหัวข้อ 1–4. ตัวเลขผลขาย/สต็อกในหัวข้อ 8 ให้เทียบตามรายการที่ทำจริง ไม่รวมรอบที่ข้าม

### ทาง Omise Test — ต้องตั้ง Test keys และเชื่อมต่อ provider ได้

ทำ failure ก่อน success เพื่อใช้ Cart ชุดเดียวกัน ห้ามสแกนด้วยธนาคารจริง ค่า Test result นี้ส่งไป Omise Test จริง ไม่ใช่แก้ DB ให้ paid โดยตรง

```powershell
$PaymentInput = @{} + $QuoteInput
$PaymentInput.quote_hash = $Quote.quote_hash
$PaymentInput.checkout_key = [guid]::NewGuid().ToString()
$Pending = (Invoke-R5 POST '/orders/payment-attempts' -Token $CustomerToken -Body $PaymentInput).data
$AttemptId = $Pending.attempt_id
Invoke-R5 GET "/orders/payment-attempts/$AttemptId" -Token $CustomerToken
Invoke-R5 POST "/orders/payment-attempts/$AttemptId/test-result" -Token $CustomerToken -Body @{result='failed'}
# Failed ไม่สร้าง Order และไม่ลด stock; เปลี่ยน key ใหม่เมื่อตั้งใจเริ่มการจ่ายรอบใหม่
$Quote = (Invoke-R5 POST '/orders/quotes' -Token $CustomerToken -Body $QuoteInput).data
$PaymentInput.quote_hash = $Quote.quote_hash
$PaymentInput.checkout_key = [guid]::NewGuid().ToString()
$Pending = (Invoke-R5 POST '/orders/payment-attempts' -Token $CustomerToken -Body $PaymentInput).data
$AttemptId = $Pending.attempt_id
$Paid = (Invoke-R5 POST "/orders/payment-attempts/$AttemptId/test-result" -Token $CustomerToken -Body @{result='paid'}).data
if (!$Paid.order_id) { throw "ยังไม่ได้ Order: $($Paid.status) ให้ตรวจสาเหตุ ห้ามสร้าง charge ใหม่ซ้ำ" }
[long]$OrderId = $Paid.order_id
Invoke-R5 POST "/orders/payment-attempts/$AttemptId/sync" -Token $CustomerToken -Body @{}
Invoke-R5 POST '/orders/payment-attempts' -Token $CustomerToken -Body $PaymentInput
```

| ID | Expected |
|---|---|
| P01 | Create → 200 pending, test_mode true, amount 240, qr_url จาก Omise, order_id null; stock ยังไม่ลด |
| P02 | Test failed → failed ไม่มี Order/Payment/sale movement เพิ่ม Cart ยังมีทั้งสองสินค้า |
| P03 | รอบใหม่ Test paid → successful พร้อม order_id; Order paid / payment succeeded; P1 stock ลด 2, sale movement หนึ่งแถว quantity -2 |
| P04 | GET Cart หลังสำเร็จ: P1 หาย P2 ยังอยู่ quantity 1; ยอด/ชื่อ/ที่อยู่เป็น snapshot ณ สั่งซื้อ |
| P05 | Sync และ POST create ด้วย body/key เดิมหลังสำเร็จ → Order ID เดิม ไม่ลด stock/เพิ่ม Order ซ้ำ; ไม่เปลี่ยน input ระหว่างทดสอบ replay |
| P06 | เมื่อมี Omise key หรือ production: `POST /orders` → 409 PAYMENT_PROVIDER_REQUIRED; browser ส่ง successful หรือ order_id มาเองไม่ใช่หลักฐานการจ่าย |

ทางเลือกสาธิตผ่านเว็บ: `/cart` → เลือก P1 → `/checkout` เลือก PromptPay → ยืนยัน → QR → กด Test failed/paid; มี Check payment status และไป Order Detail เมื่อสำเร็จ ไม่ใช้ `?preview=1` ทดสอบ Backend

## 6. Customer Orders / Admin Fulfillment — R5-O01 ถึง O06

```powershell
Invoke-R5 GET '/orders?page=1&pageSize=5&status=paid' -Token $CustomerToken
$Order = (Invoke-R5 GET "/orders/$OrderId" -Token $CustomerToken).data
Invoke-R5 GET "/admin/orders?order_id=$OrderId&page=1&pageSize=5" -Token $AdminToken
Invoke-R5 GET "/admin/orders/$OrderId" -Token $CustomerToken -Expected 403
Invoke-R5 POST "/orders/$OrderId/receipt" -Token $CustomerToken -Body @{} -Expected 409

$Order = (Invoke-R5 GET "/admin/orders/$OrderId" -Token $AdminToken).data
$PackingInput = @{expected_status=$Order.current_status;expected_version=$Order.fulfillment_version;status='packing'}
$Order = (Invoke-R5 PATCH "/admin/orders/$OrderId/fulfillment" -Token $AdminToken -Body $PackingInput).data
Invoke-R5 PATCH "/admin/orders/$OrderId/fulfillment" -Token $AdminToken -Body $PackingInput -Expected 409
Invoke-R5 PATCH "/admin/orders/$OrderId/fulfillment" -Token $AdminToken -Body @{
    expected_status=$Order.current_status;expected_version=$Order.fulfillment_version;status='shipped'
} -Expected 400
$Order = (Invoke-R5 PATCH "/admin/orders/$OrderId/fulfillment" -Token $AdminToken -Body @{
    expected_status=$Order.current_status;expected_version=$Order.fulfillment_version;status='shipped';carrier='Demo Carrier';tracking_no="DEMO-$OrderId"
}).data
$Order = (Invoke-R5 PATCH "/admin/orders/$OrderId/fulfillment" -Token $AdminToken -Body @{
    expected_status=$Order.current_status;expected_version=$Order.fulfillment_version;status='delivered'
}).data
$Order = (Invoke-R5 POST "/orders/$OrderId/receipt" -Token $CustomerToken -Body @{}).data
Invoke-R5 POST "/orders/$OrderId/receipt" -Token $CustomerToken -Body @{}
$Order.status_history | Format-Table from_status,to_status,changed_at
```

| ID | Expected |
|---|---|
| O01 | Customer list มีเฉพาะของตน มี meta page/pageSize/total; detail มี items/payment/shipping_address/status_history |
| O02 | Admin ค้นหาเลขออเดอร์ / recipient / tracking_no แยกช่องได้; customer ใช้ admin API ไม่ได้ (403) |
| O03 | paid → packing → shipped → delivered ตามลำดับเท่านั้น; version เก่า → 409 ORDER_CHANGED |
| O04 | เปลี่ยน shipped โดยไม่มี carrier/tracking → 400 TRACKING_REQUIRED; ใส่แล้วบันทึกได้ |
| O05 | ยืนยันรับก่อน Delivered → 409; หลัง Delivered → completed; ยืนยันซ้ำ 200 โดยไม่เพิ่ม Completed log ซ้ำ |
| O06 | มี Delivered log หนึ่งครั้งพร้อม changed_at จริงก่อน Completed; หน้า `/admin/orders` แสดง Order date พร้อมเวลาไทย |

## 7. TrueMoney — R5-W01 ถึง W03

ทำหลัง flow PromptPay หรือใช้ Demo รอบใหม่: เพิ่ม P1 เข้า Cart 1 ชิ้น แล้ว quote ใหม่ด้วย payment_method `truemoney` ส่ง `phone_number` เฉพาะตอนสร้าง attempt

```powershell
Invoke-R5 POST '/cart/items' -Token $CustomerToken -Body @{product_id=$P1;quantity=1;session_id=$SessionId} -Expected 201
$WalletInput = @{product_ids=@($P1);address_id=$AddressId;shipping_method='standard';payment_method='truemoney';session_id=$SessionId}
$WalletQuote = (Invoke-R5 POST '/orders/quotes' -Token $CustomerToken -Body $WalletInput).data
$WalletRequest = @{} + $WalletInput
$WalletRequest.quote_hash = $WalletQuote.quote_hash
$WalletRequest.checkout_key = [guid]::NewGuid().ToString()
$WalletRequest.phone_number = '0812345678'
$Wallet = (Invoke-R5 POST '/orders/payment-attempts' -Token $CustomerToken -Body $WalletRequest).data
$Wallet.authorize_url
```

1. W01: เปิด authorize_url ที่ได้ ต้องเป็น `https://pay.omise.co/payments/...` หน้า Test ของ Omise ไม่ใช่การโอนเงินจริง; ถ้าเปิดด้วย PowerShell โดยไม่ได้ login ใน browser ให้ login customer A ที่เว็บก่อน/หลัง return
2. W02: เลือก failed บนหน้า Test → return แล้วไม่สร้าง Order ไม่ลด stock; GET หรือ POST sync attempt เดิมเพื่อตรวจผล ถ้าเพิ่ง poll ให้รออย่างน้อย 5 วินาที (sync มี cooldown)
3. W03: quote ใหม่และใช้ checkout_key ใหม่สร้างรอบใหม่ เลือก paid บนหน้า Test → return หรือ sync → Order เดียว Stock ลด 1; ค่า `status=successful` ใน URL เพียงอย่างเดียวต้องสร้าง Order ไม่ได้

```powershell
# ทำหลังเลือกผลบน Omise Test page
Start-Sleep -Seconds 5
Invoke-R5 POST "/orders/payment-attempts/$($Wallet.attempt_id)/sync" -Token $CustomerToken -Body @{}
```

สำหรับรอบ W03 ให้รันเฉพาะตั้งแต่ `$WalletQuote = ...` ใหม่หลัง W02 ไม่ต้อง POST เพิ่ม Cart ซ้ำ ใช้ Test page ของ TrueMoney ไม่ใช่ endpoint Test-result ของ PromptPay

## 8. Integration กับ R1 / R3 / R4

| ID | วิธีตรวจ | Expected / เจ้าของ |
|---|---|---|
| I01 | `GET /reviews/reviewable`, `GET /refund-requests/refundable` ด้วย CustomerToken หลัง O05 | มี order_item_id ของสินค้าที่ซื้อ; เปิดจาก Order Detail ไป R1 ด้วย item ID นี้ ไม่ใช่ product ID |
| I02 | R1 POST `/reviews` `{order_item_id,rating:5,comment:'Demo review'}` | บันทึกได้ครั้งเดียว ซ้ำ → 409 |
| I03 | R1 POST `/refund-requests` `{order_item_id,refund_qty:1,reason:'Demo only'}` | ไม่เกินจำนวนเหลือ ภายใน 7 วันนับจาก Delivered log ไม่เริ่มใหม่เมื่อ Completed |
| I04 | Admin PATCH `/admin/refund-requests/:id` `{action:'approve',restock_decision:'return'}` แล้ว `{action:'refund'}` | คืน 1 จาก P1 ที่ซื้อ 2: stock เพิ่ม 1 ตอนอนุมัติพร้อม return movement; Order ยัง Completed; refund เป็นบันทึกจำลอง ไม่คืนผ่าน Omise |
| I05 | ส่งคำขอของ P1 ที่เหลืออีก 1 หลัง I04; approve แบบ `write_off` แล้ว refund | stock ไม่เพิ่ม; เมื่อครบจำนวนทุก item ของ Order แล้ว Order/Payment → refunded พร้อม log; กดซ้ำ → 409 |
| I06 | R3 GET `/admin/sales-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | ใช้วันที่ไทยของรอบ Demo: gross เพิ่ม 240 จาก PromptPay (และ 140 ถ้า TrueMoney สำเร็จ); คืน P1 ทั้ง 2 ชิ้นหัก refunds 200; ค่าส่งไม่คืน; ตัวเลขรวมอาจมีของ Demo ก่อนหน้า จึงเทียบส่วนเพิ่ม |
| I07 | อ่าน outbox/user_event หลัง Cart และ payment | add_to_cart ส่งผ่าน server; set/remove ไม่ส่ง; purchase มี outbox หนึ่งแถวต่อ Order แล้ว Development worker ส่งเข้า user_event หนึ่ง event ต่อสินค้าที่ไม่ซ้ำใน Order รวม Omise Test/จ่ายจำลอง; production ยังคงข้าม Test |

I01–I05 เป็นการตรวจจุดเชื่อมกับ R1 ไม่ใช่การย้ายความรับผิดชอบ Refund/Review มา R5 ต้องให้เจ้าของ service ตรวจขั้นตอนอีกครั้งก่อนรวม README ทีม

SQL อ่านอย่างเดียวสำหรับ I07 และ ledger/log (ใน PowerShell เดิม ใช้เฉพาะ IDs ตัวเลขจากรอบนี้):

```powershell
@"
SELECT o.order_id,o.current_status,p.status AS payment_status,p.amount FROM "order" o JOIN payment p USING(order_id) WHERE o.order_id=$OrderId;
SELECT movement_type,qty_change,balance_after FROM stock_movement WHERE order_item_id IN (SELECT order_item_id FROM order_item WHERE order_id=$OrderId) ORDER BY movement_id;
SELECT to_status,count(*) FROM order_status_log WHERE order_id=$OrderId GROUP BY to_status;
SELECT event_type,order_id,payload->'test_mode' AS test_mode,delivered_at IS NOT NULL AS delivered FROM r5_event_outbox WHERE user_id=$CustomerId ORDER BY created_at;
SELECT event_type,count(*) FROM user_event WHERE user_id=$CustomerId GROUP BY event_type;
"@ | docker compose exec -T db psql -U postgres -d maison_de_relic -v ON_ERROR_STOP=1
```

Expected: sale -2 ครั้งเดียว; ถ้าทำ I04 มี return +1 ครั้งเดียว; I05 write_off ไม่เพิ่ม movement. Development worker อาจใช้เวลาสักครู่ส่ง events: Test purchase มี test_mode true/delivered true และ user_event purchase ตามสินค้า. Production คง delivered false สำหรับ Test. Cart adds หลายครั้งมีหลาย event ได้ แต่ replay payment ของ Order เดิมต้องไม่เพิ่ม Purchase ซ้ำ. Development จะส่ง outbox Test เก่าที่ยังค้างด้วย จึงใช้ Order ID/session ของรอบปัจจุบันแยกผล

## 9. Negative / Security / Recovery cases เพิ่มเติม

อัปเดตหลัง review ข้อ 3: R5 ใช้ middleware Auth ของ R2 โดยตรงผ่าน `cart.auth.js` แล้ว ไม่มีการเช็กไฟล์/503 AUTH_NOT_READY แบบช่วงรอรวม Auth. Test `r5-auth-boundary.test.js` ตรวจ token ปลอม + body spoof/preview flags ให้ได้ 401 ทุก route ที่ทดสอบจริง ไม่ข้าม test นี้แล้ว. ลบเฉพาะบรรทัด route ที่คอมเมนต์ค้างใน app.js; Wishlist/Cart/Orders routes ที่ใช้งานยัง mount ตามเดิม

| ID | เงื่อนไข | Expected |
|---|---|---|
| N01 | ไม่ส่ง Bearer token เรียก Cart/Orders/Payment/Admin | 401 |
| N02 | Login customer B แล้ว GET Order/Attempt ของ A | 404 เช่นเดียวกับไม่พบ ไม่มีข้อมูลผู้ใช้อื่น |
| N03 | B เรียก Test-result ของ A | 404 ไม่มีการเปลี่ยน charge |
| N04 | unverified customer GET Cart เทียบ POST Cart | GET 200; เขียน 403 EMAIL_NOT_VERIFIED |
| N05 | quote แล้วเปลี่ยนราคา/จำนวน Cart ก่อน create | 409 QUOTE_CHANGED ไม่สร้าง charge ใหม่; ขอ quote และ checkout_key ใหม่หลังยืนยันยอด |
| N06 | ใช้ key เดิมแต่เปลี่ยนข้อมูล request | 409 IDEMPOTENCY_CONFLICT ไม่สร้าง charge ซ้ำ |
| N07 | Test-result ของรายการหมดอายุ/วิธี TrueMoney/ผลนอก paid,failed | 409 TEST_PAYMENT_UNAVAILABLE หรือ 400 INVALID_TEST_RESULT ตามกรณี; NODE_ENV=production endpoint นี้ 404 |
| N08 | จ่ายแล้ว stock ไม่พอ / ledger SQL ล้มเหลว | needs_review ไม่มี Order บางส่วน ไม่มี stock ติดลบ; ห้ามจ่ายใหม่ รอเจ้าหน้าที่แก้แล้ว sync charge เดิม; ใช้ automated tests ไม่จงใจทำ DB เสียระหว่าง Demo |
| N09 | Refresh/สองแท็บ/duplicate sync-webhook | Order/Payment/sale/paid log ไม่เพิ่มซ้ำ; ทดสอบ concurrency/rollback/signature ใน automated suite |

### Header / Responsive — หลัง review ข้อ 4

ใช้บัญชี customer ที่ login แล้ว ตรวจหน้า `/orders` และลองเมนูข้ามไป Cart/Profile เพื่อยืนยันว่า Header กลางใช้ได้จริง:

| ID | วิธีตรวจ | Expected |
|---|---|---|
| H01 | จอ 1280px ภาษาไทย | ประวัติการซื้อไม่เบียด TH/EN มีช่องว่างอ่านแยกได้; ที่ตรวจจริงได้ประมาณ 40px |
| H02 | สลับ TH/EN ที่ 1280px | เมนู/ปุ่มยังคลิกได้ ไม่ซ้อนกันและไม่เกิด horizontal page overflow |
| H03 | สลับสว่าง/มืด | ระยะเหมือนกัน ไม่เปลี่ยนโทนสีของ Header |
| H04 | จอ 390px ทั้งสองภาษา | เมนูลงแถวตาม responsive เดิม ปุ่มไม่ซ้อนและหน้าไม่ล้นแนวนอน |
| H05 | กดประวัติการซื้อ/Cart/Profile และ logout | ไป URL ถูกต้อง; logout แล้วไม่แสดงข้อมูลบัญชีเดิม |

แก้เฉพาะ base.css ของ Header กลาง: เอา margin โลโก้ที่ซ้ำกับ gap ออกใน desktop แล้วเผื่อพื้นที่นำหน้ากลุ่มปุ่ม ไม่เปลี่ยน Auth/ชื่อเมนู/สีธีม. จุดนี้เป็นไฟล์ส่วนกลาง ควรให้ R2 ตรวจ diff ก่อน merge PR แก้ไขด้วย

## 10. Automated tests สำหรับเพื่อนตรวจซ้ำ

ทดสอบใช้ DB ที่เชื่อมอยู่ แต่สร้าง/ล้างเฉพาะ fixtures ไม่ reset volume ให้พัก API เพื่อไม่ให้ worker แย่ง fixtures แล้วเปิดกลับใน finally; จะมีช่วงเว็บเรียก API ไม่ได้ขณะรัน

```powershell
try {
    docker compose stop api
    if ($LASTEXITCODE -ne 0) { throw 'Cannot pause API' }
    docker compose run --rm --no-deps api npm test
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
} finally {
    docker compose start api
}
node --test "frontend/test/*.test.mjs"
```

ชุดสำคัญใน `backend/test/`: cart.test.js, cart-http.test.js, checkout.test.js, inventory-adapter.test.js, omise-payments.test.js, omise-test-payment.test.js, orders-read.test.js, fulfillment.test.js, fulfillment-http.test.js, r5-events.test.js, events.test.js, sales.test.js และ refunds.test.js/reviews.test.js ของ R1. Automated payment tests ใช้ gateway double เพื่อไม่เรียก provider แต่ใช้ R3 Inventory/PG จริง; จึงต้องตรวจ provider Test จริงตามหัวข้อ 5/7 แยก

ผลก่อนส่ง PR วันที่ 15 พ.ย.: Backend ปกติ 368 ข้อ = 366 ผ่าน / 1 ข้าม / 1 ล้มเหลวใน Search ของ R4 (`Charizard` คาดว่าผลสองอันดับแรกเป็น name แต่ seed product 467 stock เหลือ 0 หลัง Demo จึงเหลือชื่อที่พร้อมขายเพียงหนึ่งรายการ). ไม่แก้ stock/ข้อมูล Demo เพื่อให้ test ผ่าน. รันเพิ่มด้วย `docker compose run --rm --no-deps -e CI=true api npm test` ตามเงื่อนไข GitHub Actions ได้ 353 ผ่าน / 15 ข้าม / 0 ล้มเหลว; รายการข้ามเป็นเงื่อนไขที่ tests กำหนดเมื่อ CI=true และ fallback Auth. Frontend 39 ผ่าน. ไม่ถือว่าผล local เป็น GitHub CI ผ่านแล้ว และไม่บวกผล targeted ทับ full suite

อัปเดตหลังแก้ review ข้อ 1–2: targeted Backend 61 ผ่าน; full Backend CI=true 358 ผ่าน / 15 ข้าม / 0 ล้มเหลว รวม 373 ข้อ; Frontend 41 ผ่าน. ตรวจ process runtime ที่ไม่ตั้ง key ใน container เดิมได้ simulated จริงโดยไม่แก้ `.env` หรือสร้าง provider charge และ Purchase QA ที่เคยค้างเข้า user_event แล้วหนึ่งครั้งต่อสินค้า

ล่าสุดหลังเก็บ review ข้อ 3–4: full Backend CI=true **359 ผ่าน / 14 ข้าม / 0 ล้มเหลว** รวม 373 ข้อ; Frontend **41 ผ่าน**. Auth boundary test เดิมที่ skip เปลี่ยนเป็นตรวจ token ปลอมจริงแล้ว. Browser customer login: Header ที่ 1280px ช่องว่าง TH ระหว่างเมนูสุดท้ายกับภาษา 40px, EN ประมาณ 69px; ทดสอบ 390px และ theme สว่าง/มืดไม่ล้น. ลิงก์ Cart/Profile/Orders และ logout ตรวจผ่าน โดยไม่แก้ข้อมูลบัญชี/ออเดอร์

## 11. วิธีบันทึกผลและรวม README ทีม

| Test ID | วันเวลา / ผู้ตรวจ | Input / Product / Order / Attempt IDs | Expected | Actual / HTTP / error.code | Pass/Fail |
|---|---|---|---|---|---|
| เช่น P03 | กรอกตอนตรวจ | IDs ของรอบนี้ ไม่ใช่เลขตัวอย่าง | successful + Order เดียว | แนบผลที่ตัด token/key ออกแล้ว | |

- เจ้าของ README กลางนำลำดับ R2 → R3 → R5 → R1 → R3/R4 ไปจัด flow ทั้งระบบ; ให้แต่ละเจ้าของตรวจ path/status/สิทธิ์/field ของส่วนตนก่อนรวม
- หลังทดสอบซ่อนสินค้า Demo ที่เปิดไว้และ logout ไม่ลบ Order/ledger/log เพื่อทำตัวเลขให้สวย หากต้องการ DB สะอาดให้ทีมจัด environment Demo แยกโดยตั้งใจ ไม่ใช้ `down -v` กับเครื่องที่มีงานอยู่
- ข้อจำกัด: Test payment เท่านั้น ไม่มีเงินจริง/บัตร/provider refund/stock reservation/carrier API; ไม่ได้พิสูจน์ public webhook delivery จากอินเทอร์เน็ตถึง localhost ด้วยเอกสารนี้ Preview ไม่ใช่ Backend integration
- เอกสารนี้ไม่มี dependency ต่อ `.local/r5/` ซึ่งถูก ignore จึงใช้ต่อจาก source ที่ส่งทีมได้ แต่โค้ด/เอกสารยังอยู่ branch R5 จนกว่าจะส่ง PR และ merge ไม่ใช่หลักฐานว่าอยู่ main แล้ว
