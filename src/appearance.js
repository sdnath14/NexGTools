export const APPEARANCE_STORAGE_KEY = 'nexgtools_appearance';

export const DEFAULT_APPEARANCE = {
  theme: 'light',
  accent: 'orange',
  density: 'comfortable',
};

const ACCENTS = {
  orange: { primary: '#f97316', hover: '#ea580c', soft: '#fff7ed', darkSoft: '#431407', ring: 'rgba(249, 115, 22, 0.18)' },
};

export const loadAppearance = () => {
  try {
    return {
      ...DEFAULT_APPEARANCE,
      ...JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || '{}'),
      accent: 'orange',
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
};

export const applyAppearance = (appearance) => {
  const root = document.documentElement;
  const accent = ACCENTS[appearance.accent] || ACCENTS.orange;
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
