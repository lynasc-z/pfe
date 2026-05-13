import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@sonatrach.dz';

/**
 * Send an email notification. Fails silently if SMTP is not configured.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email] SMTP not configured — skipping email to ${to}: ${subject}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err);
  }
}

/**
 * Send a leave request notification email.
 */
export async function sendLeaveNotificationEmail(
  toEmail: string,
  toName: string,
  subject: string,
  bodyMessage: string
): Promise<void> {
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #0A0A0A; padding: 20px 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #FF6B00; margin: 0; font-size: 24px;">LeaveRec</h1>
        <p style="color: #999; margin: 4px 0 0 0; font-size: 12px;">Sonatrach Leave Management</p>
      </div>
      <div style="background: #FFFFFF; padding: 30px; border: 1px solid #E5E5E5; border-top: none;">
        <p style="color: #333; font-size: 16px; margin-bottom: 8px;">Hello <strong>${toName}</strong>,</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6;">${bodyMessage}</p>
      </div>
      <div style="background: #F5F5F5; padding: 15px 30px; border-radius: 0 0 12px 12px; border: 1px solid #E5E5E5; border-top: none;">
        <p style="color: #999; font-size: 11px; margin: 0;">This is an automated message from LeaveRec. Do not reply to this email.</p>
      </div>
    </div>
  `;

  await sendEmail(toEmail, subject, html);
}
