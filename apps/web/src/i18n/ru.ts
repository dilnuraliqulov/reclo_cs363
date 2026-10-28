/**
 * Russian. Translated alongside the UI and **not yet reviewed by a native speaker** —
 * `docs/i18n-design.md` names that as an open question for the team.
 *
 * "Заявка" is feminine, so the status labels agree with it. `RESPONDED` is deliberately
 * "Получен ответ" rather than an adjective: the reply arrives by phone or email, not in Reclo.
 */
export const ru = {
  'language.label': 'Язык',
  'language.uz': "O'zbekcha",
  'language.ru': 'Русский',
  'language.en': 'English',

  'auth.signIn': 'Войти',
  'auth.signUp': 'Регистрация',
  'auth.signOut': 'Выйти',
  'auth.signingOut': 'Выход…',
  'auth.signOutFailed': 'Не удалось выйти. Попробуйте снова.',
  'auth.signedInAs': 'Вы вошли как',
  'auth.myInquiries': 'Мои заявки',

  'common.email': 'Эл. почта',
  'common.password': 'Пароль',

  'signIn.title': 'С возвращением',
  'signIn.description': 'Войдите в свой аккаунт',
  'signIn.submitting': 'Выполняется вход…',
  'signIn.noAccount': 'Ещё нет аккаунта?',

  'signUp.title': 'Создайте аккаунт',
  'signUp.description': 'Зарегистрируйтесь, чтобы смотреть площадки и отправлять заявки',
  'signUp.passwordHint': 'Не менее 8 символов',
  'signUp.submitting': 'Создание аккаунта…',
  'signUp.haveAccount': 'Уже есть аккаунт?',

  'inquiry.form.title': 'Отправить заявку',
  'inquiry.form.name': 'Ваше имя',
  'inquiry.form.phone': 'Телефон',
  'inquiry.form.phoneHint': 'Продавцы обычно отвечают в Telegram',
  'inquiry.form.start': 'Желаемое начало',
  'inquiry.form.duration': 'Срок',
  'inquiry.form.durationPlaceholder': 'Выберите срок',
  'inquiry.form.message': 'Сообщение',
  'inquiry.form.cancel': 'Отмена',
  'inquiry.form.submit': 'Отправить заявку',
  'inquiry.form.submitting': 'Отправка…',
  'inquiry.form.success': 'Заявка отправлена. Продавец скоро свяжется с вами.',
  'inquiry.form.signedOutTitle': 'Войдите, чтобы отправить заявку',
  'inquiry.form.signedOutBody':
    'Заявки привязаны к вашему аккаунту, поэтому вы сможете отслеживать их позже.',
  'inquiry.form.duplicate': 'У вас уже есть открытая заявка на эту площадку',
  'inquiry.form.duplicateOn': 'У вас уже есть открытая заявка на эту площадку, отправлена {date}.',

  'inquiry.history.title': 'Ваши заявки',
  'inquiry.history.subtitle': 'Всё, что вы отправили продавцам, сначала новые.',
  'inquiry.history.all': 'Все',
  'inquiry.history.emptyTitle': 'Вы ещё не отправляли заявки',
  'inquiry.history.emptyBody': 'Найдите щит или LED-экран на карте и отправьте продавцу заявку.',
  'inquiry.history.emptyAction': 'Смотреть площадки',
  'inquiry.history.filteredEmpty': 'Заявок с этим статусом нет',
  'inquiry.history.clearFilter': 'Показать все',
  'inquiry.history.loadOlder': 'Загрузить ранние',
  'inquiry.history.loadingOlder': 'Загрузка…',
  'inquiry.history.errorTitle': 'Не удалось загрузить ваши заявки',
  'inquiry.history.retry': 'Попробовать снова',

  'inquiry.row.message': 'Сообщение',
  'inquiry.row.campaign': 'Кампания',
  'inquiry.row.contact': 'Контакты',
  'inquiry.row.start': 'Желаемое начало',
  'inquiry.row.duration': 'Срок',
  'inquiry.row.unavailable': 'Эта площадка больше не размещена',
  'inquiry.row.deleted': 'Площадка удалена',

  'inquiry.status.NEW': 'Отправлена',
  'inquiry.status.READ': 'Просмотрена',
  'inquiry.status.RESPONDED': 'Получен ответ',
  'inquiry.status.CLOSED': 'Закрыта',

  // one: 1, 21, 31 … few: 2–4, 22–24 … many: 5–20, 25–30 … other: fractions such as 1.5.
  'inquiry.months': {
    one: '{count} месяц',
    few: '{count} месяца',
    many: '{count} месяцев',
    other: '{count} месяца',
  },

  'error.NOT_AUTHENTICATED': 'Вы не авторизованы',
  'error.FORBIDDEN': 'Доступ запрещён',
  'error.INVALID_CREDENTIALS': 'Неверная почта или пароль',
  'error.EMAIL_TAKEN': 'Эта почта уже зарегистрирована',
  'error.INVALID_INPUT': 'Неверные данные',
  'error.INVALID_QUERY': 'Неверные параметры запроса',
  'error.MALFORMED_JSON': 'Некорректное тело запроса',
  'error.INVALID_PLACEMENT_ID': 'Неверный идентификатор площадки',
  'error.PLACEMENT_NOT_FOUND': 'Площадка не найдена',
  'error.DUPLICATE_INQUIRY': 'У вас уже есть открытая заявка на эту площадку',
  'error.RATE_LIMITED': 'Слишком много попыток, попробуйте позже',
  'error.MARKER_QUERY_FAILED': 'Не удалось загрузить площадки на карте',
  'error.PLACEMENT_FETCH_FAILED': 'Не удалось загрузить данные площадки',
  'error.INTERNAL': 'Что-то пошло не так',

  'validation.email.invalid': 'Введите корректную почту',
  'validation.email.taken': 'Эта почта уже зарегистрирована',
  'validation.password.required': 'Введите пароль',
  'validation.password.tooShort': 'Пароль должен содержать не менее {min} символов',
  'validation.password.tooLong': 'Пароль должен содержать не более {max} символов',
  'validation.name.required': 'Введите ваше имя',
  'validation.phone.uz': 'Введите корректный узбекский номер, например +998 90 123 45 67',
  'validation.message.tooShort': 'Сообщение должно содержать не менее {min} символов',
  'validation.message.tooLong': 'Сообщение должно содержать не более {max} символов',
  'validation.cursor.invalid': 'Неверный курсор',
  'validation.bounds.latOrder': 'minLat должен быть не больше maxLat',
  'validation.bounds.lngOrder': 'minLng должен быть не больше maxLng',
} as const
