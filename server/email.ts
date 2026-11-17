import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const isProduction = () => process.env.NODE_ENV === 'production';
/** Dev-only debug payloads (OTP plaintext, Ethereal preview links). Never in production. */
const allowAuthDebug = () => !isProduction();

/** Resend API key — preferred for production (teamflow.cyou). */
const resendApiKey = () => (process.env.RESEND_API_KEY || '').trim();

/** True when real outbound mail is configured (Resend or classic SMTP). */
export const isMailConfigured = () =>
  Boolean(resendApiKey() || process.env.SMTP_HOST);

const defaultFrom = () =>
  process.env.EMAIL_FROM || '"TeamFlow" <noreply@teamflow.cyou>';

export const getDefaultFrom = () => defaultFrom();

/** Extract bare email from `Name <addr@domain>` or bare addr. */
export const extractEmailAddress = (from: string): string | null => {
  const raw = String(from || '').trim();
  if (!raw) return null;
  const angled = raw.match(/<([^>]+)>/);
  const email = (angled ? angled[1] : raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
};

/** Domains allowed for custom From (Resend-verified). */
export const getAllowedFromDomains = (): string[] => {
  const fromEnv = String(process.env.EMAIL_ALLOWED_FROM_DOMAINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const def = extractEmailAddress(defaultFrom());
  if (def && def.includes('@')) return [def.split('@')[1]];
  return ['teamflow.cyou'];
};

/**
 * Normalize a custom From for outbound mail.
 * Returns null when empty (caller should use default).
 * Throws when the address is not on an allowed domain.
 */
export const resolveOutboundFrom = (raw: string | null | undefined): string | null => {
  const value = String(raw || '').trim();
  if (!value) return null;
  const email = extractEmailAddress(value);
  if (!email) {
    throw new Error('Invalid From address. Use email@domain or "Name" <email@domain>.');
  }
  const domain = email.split('@')[1];
  const allowed = getAllowedFromDomains();
  if (!allowed.includes(domain)) {
    throw new Error(
      `From address must use a verified domain (${allowed.join(', ')}). Got @${domain}.`
    );
  }
  // Keep display name if provided; otherwise bare email.
  if (value.includes('<') && value.includes('>')) return value;
  return email;
};

type MailResult = {
  previewUrl: string | null;
  mock: boolean;
  provider: 'resend' | 'smtp' | 'ethereal';
};

/** Cached SMTP transporters — opening a new SMTP session per email is very slow. */
let smtpTransporter: Transporter | null = null;
let etherealTransporter: Transporter | null = null;
let etherealReady: Promise<Transporter> | null = null;

const sendViaResendHttp = async (opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}): Promise<MailResult> => {
  const key = resendApiKey();
  if (!key) throw new Error('RESEND_API_KEY is missing');

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const from = opts.from || defaultFrom();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text
      }),
      signal: controller.signal
    });

    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      const detail = body.message || body.name || res.statusText || `HTTP ${res.status}`;
      throw new Error(`Resend API error: ${detail}`);
    }

    console.log(
      `[EMAIL] Resend HTTP ok id=${body.id || 'n/a'} to=${opts.to} ${Date.now() - started}ms`
    );
    return { previewUrl: null, mock: false, provider: 'resend' };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Resend API timed out after 12s');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const getSmtpTransporter = (): Transporter => {
  if (smtpTransporter) return smtpTransporter;
  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    pool: true,
    maxConnections: 2,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return smtpTransporter;
};

const getEtherealTransporter = async (): Promise<Transporter> => {
  if (etherealTransporter) return etherealTransporter;
  if (!etherealReady) {
    etherealReady = (async () => {
      const testAccount = await nodemailer.createTestAccount();
      etherealTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      return etherealTransporter;
    })();
  }
  return etherealReady;
};

export const generateOtpCode = () => String(crypto.randomInt(100000, 999999));

type OtpPayload = { companyName?: string };

/**
 * Store as `hash:expiresAtMs:payloadJson` in User.verificationToken.
 * Cost 8 is enough for short-lived OTPs (faster than cost 10 on free hosts).
 */
export const packOtpToken = async (code: string, payload: OtpPayload = {}, ttlMs = 15 * 60 * 1000) => {
  const hash = await bcrypt.hash(code, 8);
  const expiresAt = Date.now() + ttlMs;
  const meta = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${hash}:${expiresAt}:${meta}`;
};

export const parseOtpPayload = (packed: string | null | undefined): OtpPayload => {
  if (!packed) return {};
  const parts = packed.split(':');
  if (parts.length < 3) return {};
  const meta = parts.slice(2).join(':');
  try {
    return JSON.parse(Buffer.from(meta, 'base64url').toString('utf8')) as OtpPayload;
  } catch {
    return {};
  }
};

export const verifyPackedOtp = async (packed: string | null | undefined, code: string) => {
  if (!packed || !code) return { ok: false as const, payload: {} as OtpPayload };
  const parts = packed.split(':');
  if (parts.length < 2) return { ok: false as const, payload: {} as OtpPayload };

  const hash = parts[0];
  const expiresAt = Number(parts[1]);
  const payload = parseOtpPayload(packed);

  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { ok: false as const, payload };
  }

  const match = await bcrypt.compare(code.trim(), hash);
  return { ok: match, payload };
};

export const sendMail = async (opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string | null;
}): Promise<MailResult> => {
  const from = opts.from || defaultFrom();

  // Fast path: Resend HTTPS API (avoids slow SMTP handshake on every request)
  if (resendApiKey()) {
    console.log(`[EMAIL] Sending via resend-http from=${from} to=${opts.to}: ${opts.subject}`);
    return sendViaResendHttp({ ...opts, from });
  }

  if (process.env.SMTP_HOST) {
    console.log(`[EMAIL] Sending via smtp from=${from} to=${opts.to}: ${opts.subject}`);
    const transporter = getSmtpTransporter();
    const info = await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html
    });
    console.log(`[EMAIL] SMTP accepted messageId=${info.messageId || 'n/a'}`);
    return { previewUrl: null, mock: false, provider: 'smtp' };
  }

  if (isProduction()) {
    throw new Error(
      'Email is not configured. Set RESEND_API_KEY (recommended) or SMTP_HOST on the Web Service.'
    );
  }

  console.log(
    '[EMAIL] No RESEND_API_KEY/SMTP — using Ethereal test inbox. Set RESEND_API_KEY for real delivery.'
  );
  const transporter = await getEtherealTransporter();
  const info = await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html
  });
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  if (previewUrl) console.log(`[EMAIL] Preview URL: ${previewUrl}`);
  return { previewUrl, mock: true, provider: 'ethereal' };
};

export const sendSignupOtpEmail = async (email: string, code: string) => {
  if (allowAuthDebug()) {
    console.log(`[EMAIL] Signup OTP for ${email}: ${code}`);
  } else {
    console.log(`[EMAIL] Signup OTP queued for ${email}`);
  }
  return sendMail({
    to: email,
    subject: 'Your TeamFlow verification code',
    text: `Your TeamFlow verification code is ${code}. It expires in 15 minutes.`,
    html: `
      <div style="font-family: Georgia, 'Times New Roman', serif; padding: 24px; color: #1a1a1a; max-width: 520px;">
        <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b5a; margin: 0 0 8px;">TeamFlow</p>
        <h2 style="font-weight: 600; margin: 0 0 16px;">Verify your email</h2>
        <p style="margin: 0 0 16px;">Use this code to finish creating your workspace:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; font-family: Consolas, monospace; margin: 0 0 16px;">${code}</p>
        <p style="color: #555; font-size: 14px; margin: 0;">Expires in 15 minutes. If you did not sign up for TeamFlow, you can ignore this email.</p>
      </div>
    `
  });
};

/** OTP proving the invitee owns the mailbox before an invite can be accepted. */
export const sendInviteAcceptOtpEmail = async (email: string, code: string) => {
  if (allowAuthDebug()) {
    console.log(`[EMAIL] Invite-accept OTP for ${email}: ${code}`);
  } else {
    console.log(`[EMAIL] Invite-accept OTP queued for ${email}`);
  }
  return sendMail({
    to: email,
    subject: 'Confirm your TeamFlow invitation',
    text: `Your TeamFlow invitation confirmation code is ${code}. It expires in 15 minutes. Someone with your invite link still needs this code from your inbox to finish joining.`,
    html: `
      <div style="font-family: Georgia, 'Times New Roman', serif; padding: 24px; color: #1a1a1a; max-width: 520px;">
        <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b5a; margin: 0 0 8px;">TeamFlow</p>
        <h2 style="font-weight: 600; margin: 0 0 16px;">Confirm your invitation</h2>
        <p style="margin: 0 0 16px;">Enter this code on the invite page to finish joining. Anyone who only has the invite link cannot accept without this code from your email.</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; font-family: Consolas, monospace; margin: 0 0 16px;">${code}</p>
        <p style="color: #555; font-size: 14px; margin: 0;">Expires in 15 minutes. If you were not invited, ignore this email and tell your admin.</p>
      </div>
    `
  });
};

export const sendInvitationEmail = async (
  email: string,
  inviteUrl: string,
  opts?: { workspaceName?: string }
) => {
  const workspaceName = opts?.workspaceName || 'a TeamFlow workspace';
  const result = await sendMail({
    to: email,
    subject: `You are invited to join ${workspaceName} on TeamFlow`,
    text: `You have been invited to join ${workspaceName} on TeamFlow. Open this link to accept: ${inviteUrl}`,
    html: `
      <div style="font-family: Georgia, 'Times New Roman', serif; padding: 24px; color: #1a1a1a; max-width: 520px;">
        <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b5a; margin: 0 0 8px;">TeamFlow</p>
        <h2 style="font-weight: 600; margin: 0 0 16px;">You've been invited</h2>
        <p style="margin: 0 0 20px;">You were invited to collaborate in <strong>${workspaceName.replace(/</g, '&lt;')}</strong>.</p>
        <p style="margin: 0 0 12px; color: #555; font-size: 14px;">If you already use TeamFlow, you will confirm with a code from this inbox — your existing password stays the same.</p>
        <p style="margin: 0 0 24px;">
          <a href="${inviteUrl}" style="background-color: #2f3d32; color: #f7f4ef; padding: 12px 22px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 600; font-family: system-ui, sans-serif;">Review invitation</a>
        </p>
        <p style="color: #555; font-size: 13px; margin: 0 0 8px;">Or paste this link into your browser:</p>
        <p style="font-size: 13px; word-break: break-all; margin: 0;"><a href="${inviteUrl}" style="color: #2f3d32;">${inviteUrl}</a></p>
      </div>
    `
  });
  console.log(`[EMAIL] Invitation sent to: ${email}`);
  return {
    isSmtpConfigured: isMailConfigured(),
    previewUrl: allowAuthDebug() ? result.previewUrl : null
  };
};

/** Safe fields for auth JSON responses — empty in production. */
export const authDebugFields = (mail: { previewUrl?: string | null; mock?: boolean }, code?: string) => {
  if (!allowAuthDebug()) return {};
  return {
    previewUrl: mail.previewUrl ?? null,
    devCode: mail.mock && code ? code : undefined,
    devHint: mail.mock
      ? 'Email is not configured; use the code shown in the app or API console. Set RESEND_API_KEY for real delivery.'
      : undefined
  };
};

export const sendCampaignEmail = async (opts: {
  to: string;
  subject: string;
  bodyText: string;
  from?: string | null;
}) => {
  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; padding: 24px; color: #1a1a1a; line-height: 1.5; max-width: 520px;">
      <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #5c6b5a; margin: 0 0 12px;">TeamFlow</p>
      ${opts.bodyText
        .split(/\n+/)
        .map(p => `<p>${p.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('')}
    </div>
  `;
  const result = await sendMail({
    to: opts.to,
    subject: opts.subject,
    text: opts.bodyText,
    html,
    from: opts.from
  });
  return {
    previewUrl: allowAuthDebug() ? result.previewUrl : null,
    mock: result.mock
  };
};
