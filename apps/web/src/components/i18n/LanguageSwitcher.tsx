import { localeSchema, type Locale } from '@reclo/shared'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { useLocale } from '@/i18n/useLocale'

/** The key naming each language in that language. A reader who cannot read the current UI still
 * has to be able to find their own. */
const ENDONYM = {
  uz: 'language.uz',
  ru: 'language.ru',
  en: 'language.en',
} as const satisfies Record<Locale, string>

/**
 * Sits in the page header before `AuthControls`, and is visible to signed-out visitors: choosing a
 * language must not require an account.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale()

  return (
    <Select value={locale} onValueChange={(value) => setLocale(localeSchema.parse(value))}>
      {/* The trigger is narrow, so it shows the code; the list spells each language out. */}
      <SelectTrigger className="h-8 text-xs" aria-label={t('language.label')}>
        {locale.toUpperCase()}
      </SelectTrigger>
      <SelectContent>
        {localeSchema.options.map((option) => (
          <SelectItem key={option} value={option} className="text-xs">
            {t(ENDONYM[option])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
