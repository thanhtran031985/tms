export const THEME_COOKIE = 'tms-theme';
export type Theme = 'light' | 'dark';

export function parseTheme(value: string | undefined): Theme {
  return value === 'dark' ? 'dark' : 'light';
}
