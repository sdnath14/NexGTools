export const APPEARANCE_STORAGE_KEY = 'nexgtools_appearance';

export const DEFAULT_APPEARANCE = {
  theme: 'light',
  accent: 'blue',
  density: 'comfortable',
};

const ACCENTS = {
  blue: { primary: '#2563eb', hover: '#1d4ed8', soft: '#eff6ff', darkSoft: '#172554', ring: 'rgba(37, 99, 235, 0.18)' },
  emerald: { primary: '#059669', hover: '#047857', soft: '#ecfdf5', darkSoft: '#052e2b', ring: 'rgba(5, 150, 105, 0.18)' },
  violet: { primary: '#7c3aed', hover: '#6d28d9', soft: '#f5f3ff', darkSoft: '#2e1065', ring: 'rgba(124, 58, 237, 0.18)' },
};

export const loadAppearance = () => {
  try {
    return {
      ...DEFAULT_APPEARANCE,
      ...JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || '{}'),
    };
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
