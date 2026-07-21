// Language display helper - maps language codes to display names
export function getLanguageName(lang?: string): string {
  if (!lang) return ''
  const langMap: Record<string, string> = {
    'zh': 'Chinese',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
    'zh-Hans': 'Chinese (Simplified)',
    'zh-Hant': 'Chinese (Traditional)',
    'en': 'English',
    'ru': 'Russian',
    'fr': 'French',
    'es': 'Spanish',
    'ar': 'Arabic'
  }
  return langMap[lang] || lang
}
