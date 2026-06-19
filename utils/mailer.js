const nodemailer = require("nodemailer");

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });
};

// ── User came online notification ─────────────────────────────────────────
const sendOnlineNotification = async (username) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.log("⚠️  Gmail not configured in .env — skipping email");
    return;
  }

  try {
    const transporter = createTransporter();
    const time = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    await transporter.sendMail({
      from: `"PrivChat 💬" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.GMAIL_USER,
      subject: `🟢 ${username} just came ONLINE — PrivChat Alert`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        </head>
        <body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',sans-serif;">
          <div style="max-width:480px;margin:40px auto;background:#111820;border-radius:16px;border:1px solid #1e2a20;overflow:hidden;">
            
            <!-- Header -->
            <div style="background:#25d366;padding:24px;text-align:center;">
              <div style="font-size:36px;margin-bottom:8px;">💬</div>
              <h1 style="margin:0;color:#0d1117;font-size:22px;font-weight:900;letter-spacing:0.03em;">PrivChat Alert</h1>
            </div>

            <!-- Body -->
            <div style="padding:32px;">
              <div style="background:#0d1117;border-radius:12px;padding:20px;border:1px solid #1e2a20;margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="width:48px;height:48px;background:#128c7e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;text-align:center;line-height:48px;">👤</div>
                  <div>
                    <p style="margin:0;color:#25d366;font-size:18px;font-weight:800;">${username}</p>
                    <p style="margin:4px 0 0;color:#8896a0;font-size:13px;">is now <strong style="color:#25d366;">ONLINE</strong> 🟢</p>
                  </div>
                </div>
              </div>

              <p style="color:#e8e8e8;font-size:15px;line-height:1.6;margin:0 0 8px;">
                Hey Admin! <strong style="color:#25d366;">${username}</strong> has just logged into PrivChat and is now online.
              </p>
              <p style="color:#8896a0;font-size:13px;margin:0;">
                They may want to chat with you. Open PrivChat to respond!
              </p>
            </div>

            <!-- Time -->
            <div style="padding:0 32px 24px;">
              <div style="background:#0d1117;border-radius:8px;padding:12px 16px;border:1px solid #1e2a20;">
                <p style="margin:0;color:#4a5568;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Time (IST)</p>
                <p style="margin:4px 0 0;color:#8896a0;font-size:13px;font-weight:600;">${time}</p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background:#0d1117;padding:16px 32px;border-top:1px solid #1e2a20;text-align:center;">
              <p style="margin:0;color:#4a5568;font-size:11px;font-weight:600;">
                PrivChat · Private 2-User Chat System · This is an automated alert
              </p>
            </div>

          </div>
        </body>
        </html>
      `,
    });

    console.log(`📧 ✅ Online notification sent to admin — user: ${username}`);
  } catch (err) {
    console.error("📧 ❌ Email (online) error:", err.message);
  }
};

// ── User typing notification ──────────────────────────────────────────────
const sendTypingNotification = async (username) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.log("⚠️  Gmail not configured in .env — skipping email");
    return;
  }

  try {
    const transporter = createTransporter();
    const time = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    await transporter.sendMail({
      from: `"PrivChat 💬" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.GMAIL_USER,
      subject: `✍️ ${username} is typing a message — PrivChat Alert`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        </head>
        <body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',sans-serif;">
          <div style="max-width:480px;margin:40px auto;background:#111820;border-radius:16px;border:1px solid #1e2a20;overflow:hidden;">
            
            <!-- Header -->
            <div style="background:#128c7e;padding:24px;text-align:center;">
              <div style="font-size:36px;margin-bottom:8px;">✍️</div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:900;">Typing Alert</h1>
            </div>

            <!-- Body -->
            <div style="padding:32px;">
              <div style="background:#0d1117;border-radius:12px;padding:20px;border:1px solid #1e2a20;margin-bottom:20px;">
                <p style="margin:0;color:#e8e8e8;font-size:16px;font-weight:700;">
                  ✍️ <strong style="color:#25d366;">${username}</strong> is currently typing a message to you...
                </p>
              </div>

              <!-- Typing dots visual -->
              <div style="background:#161e28;border-radius:12px;padding:16px;border:1px solid #1e2a20;display:inline-block;margin-bottom:20px;">
                <span style="display:inline-block;width:10px;height:10px;background:#25d366;border-radius:50%;margin:0 3px;"></span>
                <span style="display:inline-block;width:10px;height:10px;background:#25d366;border-radius:50%;margin:0 3px;opacity:0.6;"></span>
                <span style="display:inline-block;width:10px;height:10px;background:#25d366;border-radius:50%;margin:0 3px;opacity:0.3;"></span>
              </div>

              <p style="color:#8896a0;font-size:13px;margin:0;">
                Open PrivChat quickly to see their message!
              </p>
            </div>

            <!-- Time -->
            <div style="padding:0 32px 24px;">
              <div style="background:#0d1117;border-radius:8px;padding:12px 16px;border:1px solid #1e2a20;">
                <p style="margin:0;color:#4a5568;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Time (IST)</p>
                <p style="margin:4px 0 0;color:#8896a0;font-size:13px;font-weight:600;">${time}</p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background:#0d1117;padding:16px 32px;border-top:1px solid #1e2a20;text-align:center;">
              <p style="margin:0;color:#4a5568;font-size:11px;font-weight:600;">
                PrivChat · Private 2-User Chat System · Typing alerts throttled to once per 30 seconds
              </p>
            </div>

          </div>
        </body>
        </html>
      `,
    });

    console.log(`📧 ✅ Typing notification sent to admin — user: ${username}`);
  } catch (err) {
    console.error("📧 ❌ Email (typing) error:", err.message);
  }
};

module.exports = { sendOnlineNotification, sendTypingNotification };