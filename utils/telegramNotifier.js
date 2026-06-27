// backend/utils/telegramNotifier.js
const https = require("https"); // ✅ FIX: use built-in https, works on all Node versions

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Cooldown — max 1 notification per type per 5 minutes
const lastSent = {};
const COOLDOWN_MS = 5 * 60 * 1000;

const canSend = (key) => {
  const now = Date.now();
  if (!lastSent[key] || now - lastSent[key] > COOLDOWN_MS) {
    lastSent[key] = now;
    return true;
  }
  return false;
};

const sendTelegram = (message) => {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn("⚠️ Telegram not configured — check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env");
      return resolve();
    }

    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });

    const options = {
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            console.log("📲 Telegram notification sent successfully");
          } else {
            console.error("❌ Telegram API error:", parsed.description);
          }
        } catch {
          console.error("❌ Telegram response parse error");
        }
        resolve();
      });
    });

    req.on("error", (err) => {
      console.error("❌ Telegram request failed:", err.message);
      resolve();
    });

    req.write(body);
    req.end();
  });
};

// Called when user comes online and admin is offline
const sendUserOnlineTelegram = async (username) => {
  if (!canSend("tg_user_online")) {
    console.log("⏳ Telegram cooldown active — skipping user online notification");
    return;
  }
  await sendTelegram(
    `🟢 <b>PrivChat — User Online</b>\n\n` +
    `👤 <b>${username}</b> is now online!\n` +
    `🌐 Open networkerror.xyz to chat.`
  );
};

// Called when user sends a message and admin is offline
const sendNewMessageTelegram = async (username, content, type = "text") => {
  if (!canSend("tg_new_message")) {
    console.log("⏳ Telegram cooldown active — skipping new message notification");
    return;
  }
  const preview = type === "image"
    ? "📸 Sent a photo"
    : content?.length > 100
      ? content.substring(0, 100) + "..."
      : content;

  await sendTelegram(
    `💬 <b>PrivChat — New Message</b>\n\n` +
    `👤 <b>${username}</b> says:\n` +
    `"${preview}"\n\n` +
    `🌐 Open networkerror.xyz to reply.`
  );
};

module.exports = { sendUserOnlineTelegram, sendNewMessageTelegram };