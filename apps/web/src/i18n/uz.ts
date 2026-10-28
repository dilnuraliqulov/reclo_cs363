/**
 * Uzbek, Latin script. Translated alongside the UI and **not yet reviewed by a native speaker** —
 * `docs/i18n-design.md` names that as an open question for the team.
 *
 * Uzbek does not inflect a noun after a numeral ("1 oy", "3 oy"), but CLDR still gives it a `one`
 * category, so both forms are present and identical.
 */
export const uz = {
  'language.label': 'Til',
  'language.uz': "O'zbekcha",
  'language.ru': 'Русский',
  'language.en': 'English',

  'auth.signIn': 'Kirish',
  'auth.signUp': "Ro'yxatdan o'tish",
  'auth.signOut': 'Chiqish',
  'auth.signingOut': 'Chiqilmoqda…',
  'auth.signOutFailed': "Chiqish amalga oshmadi. Qaytadan urinib ko'ring.",
  'auth.signedInAs': 'Hisob:',
  'auth.myInquiries': "Mening so'rovlarim",

  'common.email': 'Email',
  'common.password': 'Parol',

  'signIn.title': 'Xush kelibsiz',
  'signIn.description': 'Hisobingizga kiring',
  'signIn.submitting': 'Kirilmoqda…',
  'signIn.noAccount': "Hisobingiz yo'qmi?",

  'signUp.title': 'Hisob yarating',
  'signUp.description': "Joylarni ko'rish va so'rov yuborish uchun ro'yxatdan o'ting",
  'signUp.passwordHint': 'Kamida 8 belgi',
  'signUp.submitting': 'Hisob yaratilmoqda…',
  'signUp.haveAccount': 'Hisobingiz bormi?',

  'inquiry.form.title': "So'rov yuborish",
  'inquiry.form.name': 'Ismingiz',
  'inquiry.form.phone': 'Telefon',
  'inquiry.form.phoneHint': "Sotuvchilar ko'pincha Telegramda javob beradi",
  'inquiry.form.start': 'Boshlanish sanasi',
  'inquiry.form.duration': 'Muddat',
  'inquiry.form.durationPlaceholder': 'Muddatni tanlang',
  'inquiry.form.message': 'Xabar',
  'inquiry.form.cancel': 'Bekor qilish',
  'inquiry.form.submit': "So'rov yuborish",
  'inquiry.form.submitting': 'Yuborilmoqda…',
  'inquiry.form.success': "So'rov yuborildi. Sotuvchi tez orada siz bilan bog'lanadi.",
  'inquiry.form.signedOutTitle': "So'rov yuborish uchun tizimga kiring",
  'inquiry.form.signedOutBody':
    "So'rovlar hisobingizga bog'lanadi, shuning uchun keyin ularni kuzatib borishingiz mumkin.",
  'inquiry.form.duplicate': "Bu joy uchun ochiq so'rovingiz allaqachon bor",
  'inquiry.form.duplicateOn':
    "Bu joy uchun ochiq so'rovingiz allaqachon bor, {date} kuni yuborilgan.",

  'inquiry.history.title': "So'rovlaringiz",
  'inquiry.history.subtitle': "Sotuvchilarga yuborgan barcha so'rovlaringiz, eng yangisi birinchi.",
  'inquiry.history.all': 'Barchasi',
  'inquiry.history.emptyTitle': "Siz hali hech qanday so'rov yubormadingiz",
  'inquiry.history.emptyBody':
    "Xaritada banner yoki LED ekranni toping va sotuvchiga so'rov yuboring.",
  'inquiry.history.emptyAction': "Joylarni ko'rish",
  'inquiry.history.filteredEmpty': "Bu holatda so'rov yo'q",
  'inquiry.history.clearFilter': "Barchasini ko'rsatish",
  'inquiry.history.loadOlder': 'Eskilarini yuklash',
  'inquiry.history.loadingOlder': 'Yuklanmoqda…',
  'inquiry.history.errorTitle': "So'rovlaringizni yuklab bo'lmadi",
  'inquiry.history.retry': 'Qaytadan urinish',

  'inquiry.row.message': 'Xabar',
  'inquiry.row.campaign': 'Kampaniya',
  'inquiry.row.contact': 'Aloqa',
  'inquiry.row.start': 'Boshlanish sanasi',
  'inquiry.row.duration': 'Muddat',
  'inquiry.row.unavailable': "Bu joy endi ro'yxatda yo'q",
  'inquiry.row.deleted': "Joy o'chirilgan",

  'inquiry.status.NEW': 'Yuborildi',
  'inquiry.status.READ': "Ko'rildi",
  'inquiry.status.RESPONDED': 'Javob berildi',
  'inquiry.status.CLOSED': 'Yopildi',

  'inquiry.months': { one: '{count} oy', other: '{count} oy' },

  'error.NOT_AUTHENTICATED': 'Tizimga kirilmagan',
  'error.FORBIDDEN': "Ruxsat yo'q",
  'error.INVALID_CREDENTIALS': 'Email yoki parol xato',
  'error.EMAIL_TAKEN': "Bu email allaqachon ro'yxatdan o'tgan",
  'error.INVALID_INPUT': "Kiritilgan ma'lumot xato",
  'error.INVALID_QUERY': "So'rov parametrlari xato",
  'error.MALFORMED_JSON': "So'rov tanasi buzilgan",
  'error.INVALID_PLACEMENT_ID': 'Joy identifikatori xato',
  'error.PLACEMENT_NOT_FOUND': 'Joy topilmadi',
  'error.DUPLICATE_INQUIRY': "Bu joy uchun ochiq so'rovingiz allaqachon bor",
  'error.RATE_LIMITED': "Juda ko'p urinish, keyinroq qayta urinib ko'ring",
  'error.MARKER_QUERY_FAILED': "Xarita joylarini yuklab bo'lmadi",
  'error.PLACEMENT_FETCH_FAILED': "Joy ma'lumotlarini yuklab bo'lmadi",
  'error.INTERNAL': 'Nimadir xato ketdi',

  'validation.email.invalid': "To'g'ri email kiriting",
  'validation.email.taken': "Bu email allaqachon ro'yxatdan o'tgan",
  'validation.password.required': 'Parolingizni kiriting',
  'validation.password.tooShort': "Parol kamida {min} belgidan iborat bo'lishi kerak",
  'validation.password.tooLong': "Parol ko'pi bilan {max} belgidan iborat bo'lishi kerak",
  'validation.name.required': 'Ismingizni kiriting',
  'validation.phone.uz': "To'g'ri O'zbekiston raqamini kiriting, masalan +998 90 123 45 67",
  'validation.message.tooShort': "Xabar kamida {min} belgidan iborat bo'lishi kerak",
  'validation.message.tooLong': "Xabar ko'pi bilan {max} belgidan iborat bo'lishi kerak",
  'validation.cursor.invalid': 'Kursor xato',
  'validation.bounds.latOrder': "minLat maxLat dan katta bo'lmasligi kerak",
  'validation.bounds.lngOrder': "minLng maxLng dan katta bo'lmasligi kerak",
} as const
