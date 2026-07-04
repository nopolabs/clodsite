import fs from 'fs';
import path from 'path';

export function listThemeNames(themesDir) {
  if (!themesDir || !fs.existsSync(themesDir)) {
    throw new Error('theme directory not found: ' + themesDir);
  }
  const themes = fs.readdirSync(themesDir, { withFileTypes: true })
    .filter(function (entry) {
      return entry.isFile() && entry.name.endsWith('.css');
    })
    .map(function (entry) {
      return path.basename(entry.name, '.css');
    })
    .sort(function (a, b) {
      return a.localeCompare(b);
    });
  if (themes.length === 0) {
    throw new Error('no themes found in ' + themesDir);
  }
  return themes;
}

export function formatThemeList(themes) {
  return themes.join(', ');
}
