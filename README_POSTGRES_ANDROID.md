# CG Quán Ăn PostgreSQL v1

Bản này bỏ Firebase, backend `/api` dùng PostgreSQL qua package `pg`.

## Vercel Env

```txt
DATABASE_URL=postgresql://cg_user:matkhau@HOST:5432/cg_quan_an
ADMIN_PIN=123456
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
PG_SSL=false
```

## Android Termux cài PostgreSQL

```bash
pkg update -y
pkg install postgresql nodejs -y
initdb $PREFIX/var/lib/postgresql
pg_ctl -D $PREFIX/var/lib/postgresql start
createdb cg_quan_an
```

Tạo user:

```bash
psql cg_quan_an
```

```sql
CREATE USER cg_user WITH PASSWORD 'doi_mat_khau_manh';
GRANT ALL PRIVILEGES ON DATABASE cg_quan_an TO cg_user;
```

Chạy schema:

```bash
psql postgresql://cg_user:doi_mat_khau_manh@127.0.0.1:5432/cg_quan_an -f schema.sql
psql postgresql://cg_user:doi_mat_khau_manh@127.0.0.1:5432/cg_quan_an -f seed.sql
```

## Ghi chú

- Bản v1 để bắt đầu test PostgreSQL.
- Frontend giữ nguyên, chỉ thay backend API.
- Nên chạy PostgreSQL qua Tailscale Funnel hoặc Cloudflare Tunnel, không mở port modem.
