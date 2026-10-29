import { describe, expect, it, vi } from 'vitest'
import { ConsoleMailer, createMailer, SmtpMailer, type MailMessage } from './mailer'

const message: MailMessage = {
  to: 'vendor@example.com',
  replyTo: 'aziza@example.com',
  subject: "Yangi so'rov / Новый запрос: Amir Temur Billboard",
  text: 'Plain text body',
  html: '<p>HTML body</p>',
}

describe('SmtpMailer', () => {
  it('hands every field to the transport, with the configured From', async () => {
    const sendMail = vi.fn().mockResolvedValue({})
    const mailer = new SmtpMailer('Reclo <no-reply@reclo.uz>', { sendMail })

    await mailer.send(message)

    expect(sendMail).toHaveBeenCalledWith({ from: 'Reclo <no-reply@reclo.uz>', ...message })
  })

  it('rejects when the transport does', async () => {
    const failure = new Error('connect ECONNREFUSED')
    const mailer = new SmtpMailer('Reclo <no-reply@reclo.uz>', {
      sendMail: vi.fn().mockRejectedValue(failure),
    })

    await expect(mailer.send(message)).rejects.toBe(failure)
  })
})

describe('ConsoleMailer', () => {
  it('prints the headers and the text part', async () => {
    const log = vi.fn()

    await new ConsoleMailer(log).send(message)

    expect(log).toHaveBeenCalledTimes(1)
    const [line] = log.mock.calls[0]!
    expect(line).toContain('To: vendor@example.com')
    expect(line).toContain('Reply-To: aziza@example.com')
    expect(line).toContain(`Subject: ${message.subject}`)
    expect(line).toContain('Plain text body')
    expect(line).not.toContain('<p>')
  })

  it('omits Reply-To when the message has none', async () => {
    const log = vi.fn()

    await new ConsoleMailer(log).send({ ...message, replyTo: undefined })

    expect(log.mock.calls[0]![0]).not.toContain('Reply-To')
  })
})

describe('createMailer', () => {
  it('sends over SMTP when SMTP_URL is set, without a warning', () => {
    const warn = vi.fn()

    const mailer = createMailer(
      { SMTP_URL: 'smtp://localhost:1026', MAIL_FROM: 'Reclo <no-reply@reclo.uz>' },
      warn,
    )

    expect(mailer).toBeInstanceOf(SmtpMailer)
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to the console, and says so, when SMTP_URL is unset', () => {
    const warn = vi.fn()

    const mailer = createMailer({ MAIL_FROM: 'Reclo <no-reply@reclo.uz>' }, warn)

    expect(mailer).toBeInstanceOf(ConsoleMailer)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SMTP_URL is not set'))
  })
})
