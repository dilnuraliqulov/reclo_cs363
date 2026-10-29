import type { Inquiry } from '@reclo/shared'
import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  formatTashkentDateTime,
  formatUzPhone,
  renderNewInquiryEmail,
  type NewInquiryEmailData,
} from './new-inquiry'

const inquiry: Inquiry = {
  id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31aa',
  placementId: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  status: 'NEW',
  message: 'We would like to run a two-month campaign on this billboard.',
  contactName: 'Aziza Karimova',
  contactPhone: '+998901234567',
  contactEmail: 'aziza@example.com',
  desiredStartDate: '2026-12-01',
  durationMonths: 3,
  createdAt: '2026-10-26T10:00:00.000Z',
}

function data(overrides: Partial<NewInquiryEmailData> = {}): NewInquiryEmailData {
  return {
    inquiry,
    placement: {
      id: inquiry.placementId,
      title: 'Amir Temur Billboard',
      address: 'Amir Temur shoh ko‘chasi 1',
      city: 'Tashkent',
      type: 'BILLBOARD',
    },
    vendorCompanyName: 'Outdoor Media',
    webPublicUrl: 'https://reclo.example',
    ...overrides,
  }
}

function withInquiry(fields: Partial<Inquiry>): NewInquiryEmailData {
  return data({ inquiry: { ...inquiry, ...fields } })
}

function withTitle(title: string): NewInquiryEmailData {
  const base = data()
  return { ...base, placement: { ...base.placement, title } }
}

describe('renderNewInquiryEmail', () => {
  describe('subject', () => {
    it('names the placement in both languages', () => {
      expect(renderNewInquiryEmail(data()).subject).toBe(
        "Yangi so'rov / Новый запрос: Amir Temur Billboard",
      )
    })

    it('strips line breaks, so a title cannot start a new header', () => {
      const { subject } = renderNewInquiryEmail(withTitle('Billboard\r\nBcc: victim@example.com'))

      expect(subject).not.toMatch(/[\r\n]/)
      expect(subject).toBe("Yangi so'rov / Новый запрос: Billboard Bcc: victim@example.com")
    })

    it('cuts a long title to 80 characters with an ellipsis', () => {
      const { subject } = renderNewInquiryEmail(withTitle('A'.repeat(200)))
      const title = subject.slice("Yangi so'rov / Новый запрос: ".length)

      expect(title).toHaveLength(80)
      expect(title.endsWith('…')).toBe(true)
    })

    it('keeps a title of exactly 80 characters whole', () => {
      const { subject } = renderNewInquiryEmail(withTitle('B'.repeat(80)))

      expect(subject.endsWith('B'.repeat(80))).toBe(true)
    })
  })

  describe('language blocks', () => {
    it('puts the Uzbek block before the Russian one, in both parts', () => {
      const { text, html } = renderNewInquiryEmail(data())

      expect(text.indexOf("Yangi so'rov:")).toBeGreaterThanOrEqual(0)
      expect(text.indexOf("Yangi so'rov:")).toBeLessThan(text.indexOf('Новый запрос:'))
      expect(html.indexOf('lang="uz"')).toBeGreaterThanOrEqual(0)
      expect(html.indexOf('lang="uz"')).toBeLessThan(html.indexOf('lang="ru"'))
    })

    it('greets the company by name when it has one', () => {
      const { text } = renderNewInquiryEmail(data())

      expect(text).toContain('Assalomu alaykum, Outdoor Media!')
      expect(text).toContain('Здравствуйте, Outdoor Media!')
    })

    it('greets without a name when the vendor has no company name', () => {
      const { text } = renderNewInquiryEmail(data({ vendorCompanyName: null }))

      expect(text).toContain('Assalomu alaykum!')
      expect(text).toContain('Здравствуйте!')
      expect(text).not.toContain('null')
    })

    it.each([
      ['BILLBOARD', 'Bilbord', 'Билборд'],
      ['LED_SCREEN', 'LED ekran', 'LED-экран'],
    ] as const)('labels a %s in both languages', (type, uz, ru) => {
      const base = data()
      const { text } = renderNewInquiryEmail({ ...base, placement: { ...base.placement, type } })

      expect(text).toContain(`Amir Temur shoh ko‘chasi 1, Tashkent · ${uz}`)
      expect(text).toContain(`Amir Temur shoh ko‘chasi 1, Tashkent · ${ru}`)
    })
  })

  describe('details', () => {
    it('carries everything the vendor needs to quote', () => {
      const { text } = renderNewInquiryEmail(data())

      expect(text).toContain('Mijoz: Aziza Karimova')
      expect(text).toContain('Telefon: +998 90 123 45 67 (Telegram: https://t.me/+998901234567)')
      expect(text).toContain('Email: aziza@example.com')
      expect(text).toContain('Boshlanish sanasi: 01.12.2026')
      expect(text).toContain('Muddat: 3 oy')
      expect(text).toContain('Дата начала: 01.12.2026')
      expect(text).toContain('Срок: 3 месяца')
      expect(text).toContain(inquiry.message)
    })

    it('leaves out the start date and duration rows when the client gave neither', () => {
      const { text, html } = renderNewInquiryEmail(
        withInquiry({ desiredStartDate: null, durationMonths: null }),
      )

      for (const label of ['Boshlanish sanasi', 'Muddat', 'Дата начала', 'Срок']) {
        expect(text).not.toContain(`${label}:`)
        expect(html).not.toContain(`>${label}<`)
      }
    })

    it('links the phone with tel: and Telegram, both in E.164', () => {
      const { html } = renderNewInquiryEmail(data())

      expect(html).toContain('href="tel:+998901234567"')
      expect(html).toContain('href="https://t.me/+998901234567"')
      expect(html).toContain('>+998 90 123 45 67</a>')
    })

    it('links the client email with mailto:', () => {
      expect(renderNewInquiryEmail(data()).html).toContain('href="mailto:aziza@example.com"')
    })

    it('links to the listing on the web app, whatever trailing slash the origin has', () => {
      const expected = `https://reclo.example/vendor/placements/${inquiry.placementId}/edit`

      expect(renderNewInquiryEmail(data()).text).toContain(expected)
      expect(
        renderNewInquiryEmail(data({ webPublicUrl: 'https://reclo.example/' })).html,
      ).toContain(`href="${expected}"`)
    })

    it('ends with the inquiry id and the Tashkent time it arrived', () => {
      const { text, html } = renderNewInquiryEmail(data())
      const footer = `Reclo · so'rov / запрос ${inquiry.id} · 26.10.2026 15:00 (Toshkent)`

      expect(text.trimEnd().endsWith(footer)).toBe(true)
      expect(html).toContain(escapeHtml(footer))
    })
  })

  describe('duration plurals', () => {
    it.each([
      [1, '1 месяц'],
      [2, '2 месяца'],
      [3, '3 месяца'],
      [5, '5 месяцев'],
      [11, '11 месяцев'],
      [12, '12 месяцев'],
      [21, '21 месяц'],
      [22, '22 месяца'],
      [24, '24 месяца'],
    ])('Russian: %i months reads "%s"', (count, expected) => {
      expect(renderNewInquiryEmail(withInquiry({ durationMonths: count })).text).toContain(
        `Срок: ${expected}`,
      )
    })

    it.each([1, 5, 21])('Uzbek does not inflect: %i oy', (count) => {
      expect(renderNewInquiryEmail(withInquiry({ durationMonths: count })).text).toContain(
        `Muddat: ${count} oy`,
      )
    })
  })

  describe('untrusted text', () => {
    const hostile = `<script>alert("x")</script> & 'quotes'`

    it('escapes the client message and name in HTML, and leaves them verbatim in text', () => {
      const { text, html } = renderNewInquiryEmail(
        withInquiry({ message: hostile, contactName: hostile }),
      )

      expect(html).not.toContain('<script>')
      expect(html).toContain(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;',
      )
      expect(text).toContain(hostile)
    })

    it('escapes the vendor-authored title and address in HTML', () => {
      const base = data()
      const { html } = renderNewInquiryEmail({
        ...base,
        placement: {
          ...base.placement,
          title: '<img src=x onerror=alert(1)>',
          address: '<b>1</b>',
        },
      })

      expect(html).not.toContain('<img')
      expect(html).not.toContain('<b>1</b>')
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })

    it('escapes the company name in the greeting', () => {
      const { html } = renderNewInquiryEmail(data({ vendorCompanyName: '<i>Media</i>' }))

      expect(html).not.toContain('<i>Media</i>')
      expect(html).toContain('Assalomu alaykum, &lt;i&gt;Media&lt;/i&gt;!')
    })

    it('keeps message line breaks as <br>, escaping first so a break cannot open a tag', () => {
      const { html } = renderNewInquiryEmail(
        withInquiry({ message: 'Line one\nLine two\r\nLine three <\nb>' }),
      )

      expect(html).toContain('Line one<br>Line two<br>Line three &lt;<br>b&gt;')
    })
  })
})

describe('formatUzPhone', () => {
  it('groups an E.164 Uzbek number the way it is read aloud', () => {
    expect(formatUzPhone('+998901234567')).toBe('+998 90 123 45 67')
  })

  it('passes anything else through unchanged', () => {
    expect(formatUzPhone('+77011234567')).toBe('+77011234567')
  })
})

describe('formatTashkentDateTime', () => {
  it('shows a UTC instant at UTC+5', () => {
    expect(formatTashkentDateTime('2026-10-26T10:00:00.000Z')).toBe('26.10.2026 15:00')
  })

  it('rolls over to the next day, month and year past 19:00 UTC', () => {
    expect(formatTashkentDateTime('2026-12-31T19:30:00.000Z')).toBe('01.01.2027 00:30')
  })

  it('applies no daylight saving in summer', () => {
    expect(formatTashkentDateTime('2026-07-01T00:00:00.000Z')).toBe('01.07.2026 05:00')
  })
})

describe('the start date', () => {
  it('is formatted from its parts, so no timezone can shift the day', () => {
    expect(renderNewInquiryEmail(withInquiry({ desiredStartDate: '2027-01-01' })).text).toContain(
      'Boshlanish sanasi: 01.01.2027',
    )
  })
})
