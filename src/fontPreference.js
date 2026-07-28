export const applySavedFontPreference = () => {
  const selectedFont = 'Lokeya';

  const fontFamily = `"${selectedFont.replaceAll('"', '')}", system-ui, sans-serif`;
  document.documentElement.style.setProperty('--app-font-family', fontFamily);
  document.documentElement.dataset.selectedFont = selectedFont;
};
