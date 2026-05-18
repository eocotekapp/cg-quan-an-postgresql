function toLocalDateTime(date, time) {
  const d = String(date || "").trim();
  const t = String(time || "00:00").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!/^\d{2}:\d{2}/.test(t)) return null;
  return new Date(`${d}T${t.slice(0,5)}:00+07:00`);
}

function fmtTime(ms) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone:"Asia/Ho_Chi_Minh", hour:"2-digit", minute:"2-digit", hour12:false }).format(new Date(ms));
}

function buildLockWindow(date, time, beforeMin = 120, afterMin = 90) {
  const arrival = toLocalDateTime(date, time);
  if (!arrival || Number.isNaN(arrival.getTime())) return null;
  const arrivalMs = arrival.getTime();
  const lockStartMs = arrivalMs - beforeMin * 60000;
  const lockEndMs = arrivalMs + afterMin * 60000;
  return {
    arrivalAt: arrival.toISOString(),
    arrivalMs,
    lockStart: new Date(lockStartMs).toISOString(),
    lockEnd: new Date(lockEndMs).toISOString(),
    lockStartMs,
    lockEndMs,
    lockStartText: fmtTime(lockStartMs),
    lockEndText: fmtTime(lockEndMs)
  };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return Number(aStart) < Number(bEnd) && Number(aEnd) > Number(bStart);
}

module.exports = { toLocalDateTime, buildLockWindow, overlaps };
