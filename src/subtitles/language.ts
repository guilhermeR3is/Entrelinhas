export function isEnglish(lang: string): boolean {
  return lang === 'en' || lang.startsWith('en-');
}

export function isPortuguese(lang: string): boolean {
  return lang === 'pt' || lang.startsWith('pt-');
}
