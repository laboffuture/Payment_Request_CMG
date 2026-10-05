import nodemailer from 'nodemailer';
import { env, logger, mailConfigured } from '@cm/api';

/**
 * §1: email goes out through Nodemailer/SMTP or an HTTP API, chosen by
 * MAIL_PROVIDER — and only ever from this worker process.
 */

export interface Mail {
  to: string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export interface Mailer {
  readonly provider: string;
  send(mail: Mail): Promise<void>;
}

class SmtpMailer implements Mailer {
  readonly provider = 'smtp';
  private transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({
      from: env.MAIL_FROM,
      to: mail.to.join(', '),
      subject: mail.subject,
      text: mail.text,
      attachments: mail.attachments,
    });
  }
}

/** Brevo — 300 emails a day on the free tier, as the prototype's help text says. */
class BrevoMailer implements Mailer {
  readonly provider = 'brevo';

  async send(mail: Mail): Promise<void> {
    const match = /^(.*?)\s*<(.+)>$/.exec(env.MAIL_FROM);
    const sender = match
      ? { name: match[1], email: match[2] }
      : { email: env.MAIL_FROM };

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.MAIL_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: mail.to.map((email) => ({ email })),
        subject: mail.subject,
        textContent: mail.text,
        attachment: mail.attachments?.map((a) => ({
          name: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Brevo returned ${res.status}: ${await res.text()}`);
    }
  }
}

class ResendMailer implements Mailer {
  readonly provider = 'resend';

  async send(mail: Mail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.MAIL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        attachments: mail.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
    }
  }
}

/** Used when nothing is configured: log the email, never pretend it was sent. */
class NullMailer implements Mailer {
  readonly provider = 'none';

  async send(mail: Mail): Promise<void> {
    logger.warn(
      { to: mail.to, subject: mail.subject },
      'email not configured — nothing was sent',
    );
    throw new Error('Email is not configured yet — see Admin → Email settings');
  }
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (mailer) return mailer;
  if (!mailConfigured) {
    mailer = new NullMailer();
  } else if (env.MAIL_PROVIDER === 'brevo') {
    mailer = new BrevoMailer();
  } else if (env.MAIL_PROVIDER === 'resend') {
    mailer = new ResendMailer();
  } else {
    mailer = new SmtpMailer();
  }
  return mailer;
}
