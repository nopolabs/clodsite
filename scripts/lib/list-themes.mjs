#!/usr/bin/env node
import { formatThemeList, listThemeNames } from './themes.mjs';

const [themesDir = 'scaffold/src/css/themes'] = process.argv.slice(2);

try {
  console.log(formatThemeList(listThemeNames(themesDir)));
} catch (error) {
  console.error('Error: ' + error.message);
  process.exit(1);
}
