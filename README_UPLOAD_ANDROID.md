# Upload ảnh món trên Android server

Bản này không dùng link ảnh direct nữa. Admin chọn ảnh từ album, ảnh được POST lên `/api/upload`.

API sẽ tự tạo thư mục upload nếu chưa có:

```js
fs.mkdirSync(UPLOAD_DIR, { recursive: true })
```

## Khuyến nghị biến môi trường trên Android/Termux

```bash
export UPLOAD_DIR=/storage/emulated/0/android-server/uploads
export PUBLIC_UPLOAD_BASE=https://LINK-CLOUDFLARE-CUA-BAN
```

Nếu không set `UPLOAD_DIR`, ảnh sẽ lưu vào `uploads/` cạnh thư mục server.

## Quan trọng: server Android phải serve `/uploads/*`

Nếu server tự viết bằng Node http, thêm vào đầu handler:

```js
const { serveUploads } = require("./api/_uploadsStatic");

if (serveUploads(req, res)) return;
```

Nếu dùng Express:

```js
app.use("/uploads", express.static(process.env.UPLOAD_DIR || "uploads"));
```

Database chỉ lưu URL ảnh do `/api/upload` trả về.


## Nếu web báo "Upload ảnh lỗi"

Kiểm tra 3 điểm:

1. API Android phải có route `/api/upload`.
2. API Android phải serve `/uploads/*`.
3. Nếu web chạy khác domain với API, `/api/upload` cần CORS. Bản này đã thêm CORS trong `api/upload.js`.

Lệnh env gợi ý Termux:

```bash
export UPLOAD_DIR=/storage/emulated/0/android-server/uploads
export PUBLIC_UPLOAD_BASE=https://LINK-CLOUDFLARE-CUA-BAN
```
