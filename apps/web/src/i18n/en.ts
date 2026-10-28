/**
 * The source catalog. Every string the client UI shows is authored here first, and this object's
 * shape is the contract the other locales must satisfy: `MessageKey` is derived from its keys, so a
 * key missing from `uz` or `ru` is a TypeScript error rather than an English string in production.
 *
 * Keys are grouped by surface rather than by file, so moving a component does not rename a string.
 * An entry is a plain string, or — for a counted noun — one string per plural category.
 */
export const en = {
  'language.label': 'Language',
  'language.uz': "O'zbekcha",
  'language.ru': 'Русский',
  'language.en': 'English',

  'auth.signIn': 'Sign in',
  'auth.signUp': 'Sign up',
  'auth.signOut': 'Sign out',
  'auth.signingOut': 'Signing out…',
  'auth.signOutFailed': 'Could not sign out. Please try again.',
  'auth.signedInAs': 'Signed in as',
  'auth.myInquiries': 'My inquiries',

  'common.email': 'Email',
  'common.password': 'Password',

  'signIn.title': 'Welcome back',
  'signIn.description': 'Sign in to your account',
  'signIn.submitting': 'Signing in…',
  'signIn.noAccount': 'No account yet?',

  'signUp.title': 'Create your account',
  'signUp.description': 'Sign up to browse and request billboards',
  'signUp.passwordHint': 'At least 8 characters',
  'signUp.submitting': 'Creating account…',
  'signUp.haveAccount': 'Already have an account?',

  'inquiry.form.title': 'Send an inquiry',
  'inquiry.form.name': 'Your name',
  'inquiry.form.phone': 'Phone',
  'inquiry.form.phoneHint': 'Vendors usually reply on Telegram',
  'inquiry.form.start': 'Preferred start',
  'inquiry.form.duration': 'Duration',
  'inquiry.form.durationPlaceholder': 'Select duration',
  'inquiry.form.message': 'Message',
  'inquiry.form.cancel': 'Cancel',
  'inquiry.form.submit': 'Send inquiry',
  'inquiry.form.submitting': 'Sending…',
  'inquiry.form.success': 'Inquiry sent. The vendor will contact you shortly.',
  'inquiry.form.signedOutTitle': 'Sign in to send an inquiry',
  'inquiry.form.signedOutBody':
    'Inquiries are tied to your account, so you can follow them up later.',
  'inquiry.form.duplicate': 'You already have an open inquiry for this placement',
  'inquiry.form.duplicateOn': 'You already have an open inquiry for this placement, sent {date}.',

  'inquiry.history.title': 'Your inquiries',
  'inquiry.history.subtitle': 'Everything you have sent to vendors, newest first.',
  'inquiry.history.all': 'All',
  'inquiry.history.emptyTitle': 'You have not sent any inquiries yet',
  'inquiry.history.emptyBody':
    'Find a billboard or LED screen on the map and send the vendor an inquiry.',
  'inquiry.history.emptyAction': 'Browse placements',
  'inquiry.history.filteredEmpty': 'No inquiries with this status',
  'inquiry.history.clearFilter': 'Show all',
  'inquiry.history.loadOlder': 'Load older',
  'inquiry.history.loadingOlder': 'Loading…',
  'inquiry.history.errorTitle': 'Could not load your inquiries',
  'inquiry.history.retry': 'Try again',

  'inquiry.row.message': 'Message',
  'inquiry.row.campaign': 'Campaign',
  'inquiry.row.contact': 'Contact',
  'inquiry.row.start': 'Preferred start',
  'inquiry.row.duration': 'Duration',
  'inquiry.row.unavailable': 'This placement is no longer listed',
  'inquiry.row.deleted': 'Placement removed',

  /**
   * Written from the client's side rather than exposing the enum, and each label carries the
   * meaning on its own: the badge colour is decoration. `RESPONDED` is the one that needs care —
   * the reply arrives by phone or email, not in Reclo — so it says the vendor replied and stops
   * there, rather than implying a message is waiting on the platform.
   */
  'inquiry.status.NEW': 'Sent',
  'inquiry.status.READ': 'Seen',
  'inquiry.status.RESPONDED': 'Replied',
  'inquiry.status.CLOSED': 'Closed',

  'inquiry.months': { one: '{count} month', other: '{count} months' },

  'error.NOT_AUTHENTICATED': 'Not authenticated',
  'error.FORBIDDEN': 'Forbidden',
  'error.INVALID_CREDENTIALS': 'Invalid email or password',
  'error.EMAIL_TAKEN': 'Email is already registered',
  'error.INVALID_INPUT': 'Invalid input',
  'error.INVALID_QUERY': 'Invalid query parameters',
  'error.MALFORMED_JSON': 'Malformed JSON',
  'error.INVALID_PLACEMENT_ID': 'Invalid placement id',
  'error.PLACEMENT_NOT_FOUND': 'Placement not found',
  'error.DUPLICATE_INQUIRY': 'You already have an open inquiry for this placement',
  'error.RATE_LIMITED': 'Too many attempts, try again later',
  'error.MARKER_QUERY_FAILED': 'Failed to query map markers',
  'error.PLACEMENT_FETCH_FAILED': 'Failed to fetch placement detail',
  'error.INTERNAL': 'Something went wrong',
  'error.LISTING_STATE_INVALID': "This listing can't do that in its current state",
  'error.PHOTO_REQUIRED': 'Choose a photo to upload',
  'error.PHOTO_LIMIT': 'A listing can have at most 8 photos',
  'error.PHOTO_TOO_LARGE': 'The photo is larger than 5 MB',
  'error.PHOTO_TYPE_INVALID': 'Photos must be JPEG, PNG or WebP',
  'error.PHOTO_NOT_FOUND': 'Photo not found',

  'validation.email.invalid': 'Enter a valid email',
  'validation.email.taken': 'Email is already registered',
  'validation.password.required': 'Enter your password',
  'validation.password.tooShort': 'Password must be at least {min} characters',
  'validation.password.tooLong': 'Password must be at most {max} characters',
  'validation.name.required': 'Enter your name',
  'validation.phone.uz': 'Enter a valid Uzbek number, e.g. +998 90 123 45 67',
  'validation.message.tooShort': 'Message must be at least {min} characters',
  'validation.message.tooLong': 'Message must be at most {max} characters',
  'validation.cursor.invalid': 'Invalid cursor',
  'validation.bounds.latOrder': 'minLat must be less than or equal to maxLat',
  'validation.bounds.lngOrder': 'minLng must be less than or equal to maxLng',
  'validation.required': 'This field is required',
  'validation.title.length': 'Title must be {min} to {max} characters',
  'validation.description.tooLong': 'Description must be at most {max} characters',
  'validation.address.length': 'Address must be {min} to {max} characters',
  'validation.city.length': 'City must be {min} to {max} characters',
  'validation.price.range': 'Price must be a whole number from {min} to {max} UZS',
  'validation.latitude.range': 'Latitude must be inside Uzbekistan',
  'validation.longitude.range': 'Longitude must be inside Uzbekistan',
  'validation.size.range': 'Size must be more than 0 and at most {max} metres',
  'validation.update.empty': 'Nothing to update',
} as const
