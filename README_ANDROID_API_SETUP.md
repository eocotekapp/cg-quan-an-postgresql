# CG Quán Ăn Android API v1

Kiến trúc:

```txt
Vercel frontend
  ↓ HTTP
Cloudflare Tunnel
  ↓
Android Node API :3000
  ↓ local
PostgreSQL Android :5432
```

## Cài nhanh

1. Upload phần frontend lên Vercel.
2. Copy `android-server` vào `/sdcard/termux/android-server`.
3. Trong Termux:

```bash
cd /sdcard/termux/android-server
npm install
cp .env.example .env
nano .env
npm start
```

4. Mở Termux khác:

```bash
cloudflared tunnel --protocol http2 --url http://localhost:3000
```

5. Lấy URL tunnel dán vào `config.js`:

```js
window.CG_API_BASE_URL = "https://xxx.trycloudflare.com";
```


## BẢN V2 - Lưu ý quan trọng

- `app.js` và `admin.js` đã được sửa để gọi `cgFetch()` thay vì `fetch()`.
- Nghĩa là khi bạn đặt `window.CG_API_BASE_URL` trong `config.js`, toàn bộ `/api/...` sẽ chạy qua Android API.
- Nếu `config.js` để trống, web sẽ gọi `/api` cùng domain Vercel.
