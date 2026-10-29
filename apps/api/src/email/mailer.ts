import nodemailer, { type Transporter } from 'nodemailer'

export interface MailMessage {
  to: string
  replyTo?: string
  subject: string
  text: string
  html: string
}

/** Sends one email. Injected into `createApp`, so route tests record emails instead of sending. */
export interface Mailer {
  /** Rejects when the transport refuses the message or cannot be reached. */
  send: (message: MailMessage) => Promise<void>
}

// Long enough for a slow provider, short enough that a hung server cannot pile up open sockets.
const SMTP_TIMEOUT_MS = 10_000

/** Delivers through an SMTP server (Mailpit locally, the real provider in production). */
export class SmtpMailer implements Mailer {
  constructor(
    private readonly from: string,
    private readonly transport: Pick<Transporter, 'sendMail'>,
  ) {}

  async send({ to, replyTo, subject, text, html }: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to, replyTo, subject, text, html })
  }
}

export function createSmtpMailer(url: string, from: string): SmtpMailer {
  const transport = nodemailer.createTransport({
    url,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  })
  return new SmtpMailer(from, transport)
}

/** Prints emails instead of sending them, so a fresh clone runs with no mail setup. */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = console.log) {}

  async send({ to, replyTo, subject, text }: MailMessage): Promise<void> {
    const header = [
      `To: ${to}`,
      ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
      `Subject: ${subject}`,
    ]
    this.log(`[email not sent: SMTP_URL is unset]\n${header.join('\n')}\n\n${text}`)
  }
}

export interface MailerConfig {
  SMTP_URL?: string | undefined
  MAIL_FROM: string
}

/** SMTP when `SMTP_URL` is set, the console otherwise. */
export function createMailer(
  { SMTP_URL, MAIL_FROM }: MailerConfig,
  warn: (line: string) => void = console.warn,
): Mailer {
  if (SMTP_URL) return createSmtpMailer(SMTP_URL, MAIL_FROM)
  warn('SMTP_URL is not set: emails are printed to the console, not sent.')
  return new ConsoleMailer()
}
