import { config } from '../config.js';
import { log } from '../utils.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Send an email via Resend API
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!config.RESEND_API_KEY) {
    log.warn('resend_skipped_no_key', { to, subject });
    return { success: false, reason: 'no_api_key' };
  }

  const payload = {
    from: config.RESEND_FROM_EMAIL || 'HealthTrack <onboarding@resend.dev>',
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  };

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 403 && data.name === 'validation_error') {
        log.warn('resend_domain_restricted', {
          to,
          message: data.message,
          note: 'Onboarding domain only sends to Resend account email (bashaips91619@gmail.com).',
        });
        return {
          success: false,
          restricted: true,
          statusCode: 403,
          message: data.message,
          accountEmail: 'bashaips91619@gmail.com',
        };
      }
      log.error('resend_send_failed', { status: res.status, data });
      return { success: false, statusCode: res.status, error: data.message || 'Send failed' };
    }

    log.info('resend_send_success', { id: data.id, to, subject });
    return { success: true, id: data.id };
  } catch (err) {
    log.error('resend_network_error', { error: err.message, to });
    return { success: false, error: err.message };
  }
}

/**
 * Dispatch real-time authentication token / OTP email
 */
export async function sendAuthTokenEmail({ to, token, type = 'signup', actionLink = null, fullName = null }) {
  const isSignup = type === 'signup';
  const title = isSignup ? 'HuaZoe HealthTrack · Account Verification' : 'HuaZoe HealthTrack · Sign-In Token';
  const heading = isSignup ? 'Confirm Your Registration' : 'Your Sign-In Token';
  const subtitle = isSignup
    ? 'Use the real-time authentication token below to verify your account and access your health workspace.'
    : 'Use the one-time authentication token below to sign in to your HuaZoe HealthTrack account.';

  const actionButton = actionLink
    ? `
      <div style="margin: 24px 0; text-align: center;">
        <a href="${actionLink}" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Verify Directly in Browser
        </a>
      </div>
      <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 8px;">
        Or enter the token manually in the verification screen:
      </p>
    `
    : '';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin:0; padding:0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #090d16; padding: 40px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #111827; border: 1px solid #1f293d; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
              <!-- Header -->
              <tr>
                <td style="padding: 28px 32px; background: linear-gradient(135deg, #0b1528 0%, #1e293b 100%); border-bottom: 1px solid #1e293b;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <span style="font-size: 18px; font-weight: 700; color: #38bdf8; letter-spacing: -0.02em;">HuaZoe AI</span>
                        <span style="font-size: 12px; font-weight: 600; background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 3px 8px; border-radius: 999px; margin-left: 8px; text-transform: uppercase;">HealthTrack</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 36px 32px;">
                  <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em;">
                    ${heading}
                  </h1>
                  <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #94a3b8;">
                    ${fullName ? `Hello <strong>${fullName}</strong>,<br>` : ''}${subtitle}
                  </p>

                  <!-- Token Code Box -->
                  <div style="background: #090d16; border: 1px solid #22d3ee44; border-radius: 10px; padding: 22px; text-align: center; margin: 24px 0;">
                    <div style="font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.1em; color: #38bdf8; margin-bottom: 8px;">
                      Authentication Token / OTP
                    </div>
                    <div style="font-size: 36px; font-weight: 800; letter-spacing: 0.25em; color: #f0fdf4; font-family: 'Courier New', Courier, monospace;">
                      ${token}
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 10px;">
                      Valid for 15 minutes · Real-Time Token Authentication
                    </div>
                  </div>

                  ${actionButton}

                  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #1e293b; font-size: 13px; color: #64748b; line-height: 1.5;">
                    <p style="margin: 0 0 8px;">
                      If you did not request this verification token, you can safely disregard this email.
                    </p>
                    <p style="margin: 0;">
                      Never share this code with anyone. Our medical support team will never request your token.
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 20px 32px; background-color: #0b1120; border-top: 1px solid #1f2937; text-align: center; font-size: 12px; color: #475569;">
                  HuaZoe HealthTrack Automated Diagnostic & Clinical Nutrition Engine<br>
                  Informational and preventive analysis. Not a substitute for professional clinical diagnosis.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: isSignup ? `Your HealthTrack Verification Token: ${token}` : `Your HealthTrack Sign-In Token: ${token}`,
    html,
  });
}

/**
 * Dispatch notification when medical report processing completes
 */
export async function sendReportCompletedNotification({ to, fullName, report, biomarkers = [], insights = null, urgentAttention = false }) {
  const categoryLabel = report.category ? report.category.replace(/_/g, ' ').toUpperCase() : 'LAB REPORT';
  const abnormalCount = biomarkers.filter((b) => b.flag && b.flag !== 'normal').length;
  const reportUrl = `${config.APP_URL}/reports/${report.id}`;

  const urgentBanner = urgentAttention
    ? `
      <div style="background-color: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
        <strong style="color: #f87171; font-size: 14px; display: block; margin-bottom: 4px;">⚠ Clinical Attention Alert</strong>
        <span style="color: #fca5a5; font-size: 13px; line-height: 1.5;">
          Abnormal values requiring clinical evaluation were identified in your test. Please review the findings with your physician.
        </span>
      </div>
    `
    : '';

  const abnormalSummary = abnormalCount > 0
    ? `<p style="margin: 6px 0; font-size: 14px; color: #fbbf24;"><strong>${abnormalCount} biomarker${abnormalCount === 1 ? '' : 's'}</strong> outside standard reference ranges.</p>`
    : `<p style="margin: 6px 0; font-size: 14px; color: #34d399;">All evaluated biomarkers are within standard reference ranges.</p>`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Lab Report Analysis Complete</title>
    </head>
    <body style="margin:0; padding:0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #111827; border: 1px solid #1f293d; border-radius: 14px; overflow: hidden;">
              <tr>
                <td style="padding: 26px 32px; background: #0b1528; border-bottom: 1px solid #1e293b;">
                  <span style="font-size: 18px; font-weight: 700; color: #38bdf8;">HuaZoe AI</span>
                  <span style="font-size: 12px; font-weight: 600; background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 3px 8px; border-radius: 999px; margin-left: 8px;">Diagnostic Report Ready</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px;">
                  ${urgentBanner}
                  <h1 style="margin: 0 0 12px; font-size: 20px; color: #f8fafc;">
                    Report Analysis & Personalized Plans Ready
                  </h1>
                  <p style="margin: 0 0 20px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                    ${fullName ? `Hello <strong>${fullName}</strong>,<br>` : ''}Your uploaded medical report (<strong>${categoryLabel}</strong>) has been fully analyzed by HuaZoe AI.
                  </p>

                  <div style="background: #090d16; border: 1px solid #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Analysis Highlights</div>
                    <div style="font-size: 16px; font-weight: 600; color: #e2e8f0; margin-top: 6px;">${categoryLabel} Panel</div>
                    ${abnormalSummary}
                    ${insights?.summary ? `<p style="margin: 10px 0 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">${insights.summary}</p>` : ''}
                  </div>

                  <div style="text-align: center; margin: 28px 0;">
                    <a href="${reportUrl}" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-weight: 600; font-size: 15px;">
                      View Full Analysis & Health Plans
                    </a>
                  </div>

                  <p style="margin: 20px 0 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                    Adapted diet and exercise protocols matching your biomarker parameters have also been generated in your workspace.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 32px; background: #0b1120; border-top: 1px solid #1f2937; text-align: center; font-size: 12px; color: #475569;">
                  HuaZoe HealthTrack Automated Diagnostic Engine
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: urgentAttention
      ? `[Important] Clinical Alert: ${categoryLabel} Analysis Ready - Action Required`
      : `Your HealthTrack Report & Protocols Ready (${categoryLabel})`,
    html,
  });
}

/**
 * Dispatch notification when report analysis fails
 */
export async function sendReportFailedNotification({ to, fullName, report, reason }) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><title>Report Analysis Notice</title></head>
    <body style="margin:0; padding:0; background: #090d16; font-family: sans-serif; color: #e2e8f0;">
      <div style="max-width: 520px; margin: 40px auto; background: #111827; border: 1px solid #1f293d; border-radius: 12px; padding: 32px;">
        <h2 style="color: #f87171; margin-top: 0;">Report Processing Notice</h2>
        <p style="color: #94a3b8; line-height: 1.6;">
          ${fullName ? `Hello ${fullName},<br>` : ''}We encountered an issue while extracting data from your file: <strong>${report.file_name || 'Medical Report'}</strong>.
        </p>
        <div style="background: #090d16; border-left: 3px solid #ef4444; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #cbd5e1;">
          Reason: ${reason || 'Document text unreadable or format unsupported'}
        </div>
        <p style="color: #94a3b8; font-size: 14px;">
          Please ensure your report is a clear PDF or legible high-resolution image of a lab test report, and try re-uploading from your dashboard.
        </p>
        <div style="margin-top: 24px; text-align: center;">
          <a href="${config.APP_URL}" style="display: inline-block; background: #0284c7; color: #ffffff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Go to Dashboard
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `HealthTrack Notice: Issue processing ${report.file_name || 'report'}`,
    html,
  });
}

/**
 * Dispatch welcome email upon successful verification
 */
export async function sendWelcomeEmail({ to, fullName = null }) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><title>Welcome to HuaZoe HealthTrack</title></head>
    <body style="margin:0; padding:0; background: #090d16; font-family: sans-serif; color: #e2e8f0;">
      <div style="max-width: 540px; margin: 40px auto; background: #111827; border: 1px solid #1f293d; border-radius: 12px; padding: 32px;">
        <div style="font-size: 18px; font-weight: 700; color: #38bdf8; margin-bottom: 16px;">HuaZoe HealthTrack</div>
        <h1 style="color: #f8fafc; font-size: 22px; margin: 0 0 12px;">Welcome to Your Health Intelligence Workspace</h1>
        <p style="color: #94a3b8; line-height: 1.6; font-size: 15px;">
          ${fullName ? `Welcome <strong>${fullName}</strong>!<br>` : ''}Your account has been verified successfully. You can now upload laboratory diagnostic panels (CBC, Lipid Profile, Liver & Kidney Function, Thyroid, etc.), view real-time biomarker deviations, and receive automated clinical dietary and fitness plans.
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${config.APP_URL}" style="display: inline-block; background: #0284c7; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Open Your HealthTrack Workspace
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: 'Welcome to HuaZoe HealthTrack · Account Verified',
    html,
  });
}
