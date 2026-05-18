# CG Quán Ăn - BigFix v14 Clean

Bản này là bản dựng lại sạch để các file khớp nhau, ưu tiên chạy ổn định:

- Menu khách hiển thị ổn định.
- Giỏ hàng chỉ tính tiền món.
- Đặt ship mới xác nhận phí ship.
- Đặt bàn gửi kèm món đặt trước trong giỏ.
- Admin thấy món đặt trước.
- Phiên bàn: mở bàn, gọi thêm món, thanh toán.
- Quản lý menu, bàn, kho, doanh thu, cài đặt phí ship.
- Telegram báo đơn ship, đơn đặt bàn, gọi món tại bàn.

## Vercel Environment Variables cần có

```txt
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
ADMIN_PIN=1234
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=-1003963028378
```

Nếu dùng JSON service account một biến:

```txt
FIREBASE_SERVICE_ACCOUNT={...json...}
```

Sau khi upload GitHub, redeploy Vercel và chọn không dùng cache nếu có.
