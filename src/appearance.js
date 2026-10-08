export const APPEARANCE_STORAGE_KEY = 'nexgtools_appearance';

export const DEFAULT_APPEARANCE = {
  designVersion: 2,
  theme: 'light',
  accent: 'blue',
  density: 'comfortable',
};

const ACCENTS = {
  blue: { primary: '#1260ff', hover: '#084de0', soft: '#edf3ff', darkSoft: '#12234b', ring: 'rgba(18, 96, 255, 0.18)' },
  orange: { primary: '#f97316', hover: '#ea580c', soft: '#fff7ed', darkSoft: '#431407', ring: 'rgba(249, 115, 22, 0.18)' },
};

export const loadAppearance = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || '{}');
    return { ...DEFAULT_APPEARANCE, ...saved, designVersion: 2, accent: saved.designVersion === 2 && ACCENTS[saved.accent] ? saved.accent : 'blue' };
  } catch {
    return DEFAULT_APPEARANCE;
  }
};

export const applyAppearance = (appearance) => {
  const root = document.documentElement;
  const accent = ACCENTS[appearance.accent] || ACCENTS.blue;
  const resolvedTheme = appearance.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : appearance.theme;

  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = appearance.theme;
  root.dataset.density = appearance.density;
  root.style.setProperty('--app-accent', accent.primary);
  root.style.setProperty('--app-accent-hover', accent.hover);
  root.style.setProperty('--app-accent-soft', resolvedTheme === 'dark' ? accent.darkSoft : accent.soft);
  root.style.setProperty('--app-accent-ring', accent.ring);
};

export const saveAppearance = (appearance) => {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  applyAppearance(appearance);
};
