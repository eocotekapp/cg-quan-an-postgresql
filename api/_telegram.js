function escapeHtml(value) {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok:false, skipped:true };

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode:"HTML", disable_web_page_preview:true })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    console.error("Telegram error:", data);
    return { ok:false, error:data.description || "Telegram error" };
  }
  return { ok:true };
}

module.exports = { sendTelegram, escapeHtml };
