import nodemailer from "nodemailer";

/**
 * Send a password reset email to the user.
 * Uses SMTP credentials from environment variables.
 * Falls back to Ethereal (test) email if no SMTP is configured.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  username: string
): Promise<{ success: boolean; error?: string; previewUrl?: string }> {
  try {
    let transporter: nodemailer.Transporter;
    let fromAddress: string;

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = parseInt(process.env.SMTP_PORT ?? "587");
    const smtpFrom = process.env.SMTP_FROM ?? smtpUser ?? "noreply@later.chat";

    if (smtpHost && smtpUser && smtpPass) {
      // Use configured SMTP
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      fromAddress = `Later! <${smtpFrom}>`;
    } else {
      // Fallback: Ethereal test account (emails visible at ethereal.email)
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      fromAddress = `Later! <${testAccount.user}>`;
      console.log("[Email] No SMTP configured, using Ethereal test account:", testAccount.user);
    }

    const resetLink = `${process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://later.chat"}/reset-password?token=${resetToken}`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #6B21A8, #7C3AED); padding: 32px 24px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 28px; font-weight: bold; }
    .header p { color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px; }
    .body { padding: 32px 24px; }
    .body p { color: #333; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .btn { display: block; background: #7C3AED; color: #fff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 8px; font-size: 16px; font-weight: bold; margin: 24px 0; }
    .token-box { background: #f3f0ff; border: 1px solid #c4b5fd; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 13px; color: #5b21b6; word-break: break-all; margin: 16px 0; }
    .footer { padding: 16px 24px; border-top: 1px solid #eee; text-align: center; }
    .footer p { color: #999; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Later! 😊</h1>
      <p>Voice &amp; Text Chat Rooms</p>
    </div>
    <div class="body">
      <p>Hi <strong>${username}</strong>,</p>
      <p>We received a request to reset your Later! ID password. Click the button below to set a new password:</p>
      <a href="${resetLink}" class="btn">Reset My Password</a>
      <p>Or copy this reset token into the app:</p>
      <div class="token-box">${resetToken}</div>
      <p>This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>Later! · Voice &amp; Text Chat Rooms · later.chat</p>
    </div>
  </div>
</body>
</html>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: "Reset your Later! ID password",
      text: `Hi ${username},\n\nReset your Later! password by visiting:\n${resetLink}\n\nOr use this token in the app: ${resetToken}\n\nThis link expires in 1 hour.\n\nLater! Team`,
      html: htmlBody,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    if (previewUrl) {
      console.log("[Email] Preview URL:", previewUrl);
    }

    return { success: true, previewUrl: typeof previewUrl === "string" ? previewUrl : undefined };
  } catch (err) {
    console.error("[Email] Failed to send password reset email:", err);
    return { success: false, error: "Failed to send email. Please try again." };
  }
}
