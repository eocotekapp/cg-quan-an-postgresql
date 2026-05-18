function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function cleanString(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function requireAdmin(req, res) {
  const required = process.env.ADMIN_PIN || "";
  if (!required) return true;
  const given = req.headers["x-admin-pin"] || req.query?.pin || "";
  if (String(given) === String(required)) return true;
  send(res, 401, { ok:false, error:"Sai PIN admin" });
  return false;
}

function money(n) {
  return new Intl.NumberFormat("vi-VN").format(Number(n || 0)) + "đ";
}

function makeCode(prefix) {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${prefix}${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

module.exports = { send, cleanString, requireAdmin, money, makeCode };
