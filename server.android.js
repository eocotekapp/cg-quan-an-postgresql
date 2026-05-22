const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

app.use(cors({
  origin: process.env.CORS_ORIGIN === "*" || !process.env.CORS_ORIGIN
    ? true
    : process.env.CORS_ORIGIN
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

function wrap(handler) {
  return async (req, res) => {
    try {
      req.query = req.query || {};
      req.body = req.body || {};
      await handler(req, res);
    } catch (err) {
      console.error("API fatal:", err);
      if (!res.headersSent) {
        res.status(500).json({ ok:false, error: err.message || "Server error" });
      }
    }
  };
}

const routes = {
  "/api/menu": require("./api/menu"),
  "/api/orders": require("./api/orders"),
  "/api/bookings": require("./api/bookings"),
  "/api/tables": require("./api/tables"),
  "/api/status": require("./api/status"),
  "/api/admin-check": require("./api/admin-check"),
  "/api/analytics": require("./api/analytics"),
  "/api/settings": require("./api/settings"),
  "/api/sessions": require("./api/sessions"),
  "/api/inventory": require("./api/inventory"),
  "/api/archive": require("./api/archive"),
  "/api/upload": require("./api/upload")
};

for (const [route, handler] of Object.entries(routes)) {
  app.all(route, wrap(handler));
}

app.get("/", (req, res) => res.json({ ok:true, name:"CG Quán Ăn Android API", time:new Date().toISOString() }));
app.get("/health", (req, res) => res.json({ ok:true, time:new Date().toISOString() }));

app.listen(PORT, "0.0.0.0", () => {
  console.log("====================================");
  console.log("CG Quán Ăn Android API đang chạy");
  console.log(`Local: http://127.0.0.1:${PORT}`);
  console.log("Uploads: " + UPLOAD_DIR);
  console.log("DB: " + (process.env.DATABASE_URL ? "OK" : "THIẾU DATABASE_URL"));
  console.log("====================================");
});
