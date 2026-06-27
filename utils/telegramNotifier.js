// backend/utils/telegramNotifier.js
// Sends instant Telegram notifications to admin when user is active

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

// Cooldown tracker — prevents notification spam
// 5 minute cooldown per notification type
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

const sendTelegram = async (message) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram not configured — skipping notification");
    return;
  }

  try {
    const res = await fetch(TELEGRAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const data = await res.json();
    if (data.ok) {
      console.log("📲 Telegram notification sent");
    } else {
      console.error("Telegram error:", data.description);
    }
  } catch (err) {
    console.error("Telegram send failed:", err.message);
  }
};

// Called when user comes online and admin is offline
const sendUserOnlineTelegram = async (username) => {
  if (!canSend("tg_user_online")) return;
  await sendTelegram(
    `🟢 <b>PrivChat — User Online</b>\n\n` +
    `👤 <b>${username}</b> is now online!\n` +
    `🌐 Open <a href="https://networkerror.xyz">networkerror.xyz</a> to chat.`
  );
};

// Called when user sends a message and admin is offline
const sendNewMessageTelegram = async (username, content, type = "text") => {
  if (!canSend("tg_new_message")) return;
  const preview = type === "image"
    ? "📸 Sent a photo"
    : content?.length > 100
      ? content.substring(0, 100) + "..."
      : content;

  await sendTelegram(
    `💬 <b>PrivChat — New Message</b>\n\n` +
    `👤 <b>${username}</b> says:\n` +
    `"${preview}"\n\n` +
    `🌐 <a href="https://networkerror.xyz">Open PrivChat</a>`
  );
};

module.exports = { sendUserOnlineTelegram, sendNewMessageTelegram };