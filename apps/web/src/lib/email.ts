import { Resend } from 'resend'

export async function sendInvitationEmail(email: string, rawToken: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const link = `${baseUrl}/accept-invite?token=${rawToken}`

  // In development always log to console — never call Resend
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n[DEV] Invitation email skipped in development mode')
    console.log(`[DEV] Copy this link to accept the invite for ${email}:`)
    console.log(`[DEV] ${link}\n`)
    return
  }

  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set in production')
  const resend = new Resend(key)

  const from = process.env.EMAIL_FROM ?? 'Runlet <noreply@runlet.ai>'

  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: 'Your invitation to Runlet',
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:48px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px 32px;">
        <tr><td>
          <!-- Logo -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="background:#7c3aed;width:32px;height:32px;border-radius:8px;text-align:center;vertical-align:middle;">
                <span style="color:white;font-size:16px;font-weight:700;">▶</span>
              </td>
              <td style="padding-left:8px;font-size:18px;font-weight:700;color:white;">
                run<span style="color:#a78bfa;">let</span>
              </td>
            </tr>
          </table>
          <!-- Heading -->
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:white;">You've been invited to Runlet</h1>
          <p style="margin:0 0 32px;font-size:14px;color:#6b7280;line-height:1.6;">
            Click the button below to set your password and activate your account.
            This link expires in <strong style="color:#9ca3af;">24 hours</strong>.
          </p>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="background:#7c3aed;border-radius:10px;">
                <a href="${link}" style="display:inline-block;padding:13px 28px;color:white;text-decoration:none;font-size:14px;font-weight:600;">
                  Accept invitation →
                </a>
              </td>
            </tr>
          </table>
          <!-- Fallback URL -->
          <p style="margin:0 0 4px;font-size:12px;color:#4b5563;">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:11px;color:#6b7280;word-break:break-all;">${link}</p>
          <!-- Footer -->
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:32px 0 20px;">
          <p style="margin:0;font-size:11px;color:#374151;">
            If you didn't request this invitation, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })

  if (error) {
    throw new Error(`Resend error: ${error.message}`)
  }
}
