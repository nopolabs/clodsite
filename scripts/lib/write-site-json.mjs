// Renders build-plan.yaml into src/_data/site.json for Eleventy.
// Invoked by scripts/write-site-json.sh:
//   node scripts/lib/write-site-json.mjs <site-dir>
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const [siteDir] = process.argv.slice(2);
if (!siteDir) {
  console.error('Usage: node write-site-json.mjs <site-dir>');
  process.exit(2);
}

const plan = yaml.load(fs.readFileSync(path.join(siteDir, 'build-plan.yaml'), 'utf8'));

const firstId = plan.nav.order[0];
const navPages = plan.nav.order.map(id => {
  const page = plan.pages.find(p => p.id === id);
  return {
    id: page.id,
    title: page.title,
    href: (page.id === 'home' || id === firstId) ? '/' : '/' + page.id + '/'
  };
});

const contact = plan.contact || {};

// Favicon discovery: scan <site-dir>/assets/favicons/ for recognized filenames.
const FAVICON_RULES = [
  { file: 'favicon.ico',        rel: 'icon',             sizes: 'any'                                  },
  { file: 'favicon.svg',        rel: 'icon',             type: 'image/svg+xml'                         },
  { file: 'favicon-16x16.png',  rel: 'icon',             type: 'image/png',         sizes: '16x16'     },
  { file: 'favicon-32x32.png',  rel: 'icon',             type: 'image/png',         sizes: '32x32'     },
  { file: 'favicon-48x48.png',  rel: 'icon',             type: 'image/png',         sizes: '48x48'     },
  { file: 'apple-touch-icon.png', rel: 'apple-touch-icon'                                              },
];

const favDir = path.join(siteDir, 'assets', 'favicons');
let favicons = [];
let unknownFavFiles = [];
if (fs.existsSync(favDir) && fs.statSync(favDir).isDirectory()) {
  const present = new Set(fs.readdirSync(favDir).filter(f => fs.statSync(path.join(favDir, f)).isFile()));
  for (const rule of FAVICON_RULES) {
    if (present.has(rule.file)) {
      const entry = { rel: rule.rel, href: '/' + rule.file };
      if (rule.type)  entry.type  = rule.type;
      if (rule.sizes) entry.sizes = rule.sizes;
      favicons.push(entry);
      present.delete(rule.file);
    }
  }
  unknownFavFiles = [...present];
}
const hasCustomFavicons = favicons.length > 0;

const siteData = {
  name: plan.name,
  style: plan.style,
  theme_selector: {
    enabled: plan.theme_selector?.enabled === true,
    options: plan.theme_selector?.enabled === true ? plan.theme_selector.options : [],
    default: plan.style
  },
  nav: {
    order: plan.nav.order,
    pages: navPages
  },
  contact: contact.enabled
    ? { enabled: true, email: contact.email }
    : { enabled: false },
  favicons,
  has_custom_favicons: hasCustomFavicons
};

fs.mkdirSync(path.join(siteDir, 'src', '_data'), { recursive: true });
fs.writeFileSync(
  path.join(siteDir, 'src', '_data', 'site.json'),
  JSON.stringify(siteData, null, 2)
);
console.log('✓ ' + siteDir + '/src/_data/site.json written');
console.log('  Site: ' + siteData.name + ' | Style: ' + siteData.style + ' | Pages: ' + siteData.nav.pages.length);
if (!hasCustomFavicons) {
  console.warn('  ⚠ no site favicons found in assets/favicons/ — using scaffold default');
}
if (unknownFavFiles.length > 0) {
  console.warn('  ⚠ unrecognized files in assets/favicons/ (copied but not linked): ' + unknownFavFiles.join(', '));
}
