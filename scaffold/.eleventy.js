const path = require('path');
const fs   = require('fs');
const MarkdownIt = require('markdown-it');
const nunjucks   = require('nunjucks');

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

const FAVICON_FILES = [
  'favicon.ico',
  'favicon.svg',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon-48x48.png',
  'apple-touch-icon.png',
];

module.exports = function(eleventyConfig) {
  const siteDir = process.env.SITE_DIR;
  if (!siteDir) {
    throw new Error('SITE_DIR is not set. Export it before running Eleventy.');
  }

  const repoRoot      = path.resolve(__dirname, '..');
  const sharedSrc     = path.join(__dirname, 'src');
  const siteSrc       = path.resolve(repoRoot, siteDir, 'src');
  const siteDist      = path.resolve(repoRoot, siteDir, 'dist');
  const siteAssets    = path.resolve(repoRoot, siteDir, 'assets');
  const siteFavicons  = path.join(siteAssets, 'favicons');
  const componentsDir = path.join(repoRoot, 'components');

  eleventyConfig.addFilter('md',       (str) => md.render(str || ''));
  eleventyConfig.addFilter('jsonScript', (value) => JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029'));
  // mdInline is reserved for future components that need inline markdown
  // (e.g. captions with bold/italics). Not used by v1 catalog (prose, gallery, mailto-form).

  // Hand Eleventy a Nunjucks env that can resolve {% include "<name>/component.njk" %}
  eleventyConfig.setLibrary('njk', nunjucks.configure(
    [path.join(sharedSrc, '_includes'), componentsDir],
    { autoescape: false, throwOnUndefined: false }
  ));

  // Shared scaffold passthroughs
  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'css')]: 'css' });
  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'favicon.svg')]: 'favicon.svg' });

  // Per-site assets subtree
  if (fs.existsSync(siteAssets)) {
    eleventyConfig.addPassthroughCopy({ [siteAssets]: 'assets' });
  }

  // Per-site mirrored commerce assets (product images, size-guide diagrams)
  const commerceAssets = path.resolve(repoRoot, siteDir, 'commerce', 'assets');
  if (fs.existsSync(commerceAssets)) {
    eleventyConfig.addPassthroughCopy({ [commerceAssets]: 'commerce/assets' });
  }

  if (fs.existsSync(siteFavicons) && fs.statSync(siteFavicons).isDirectory()) {
    for (const name of FAVICON_FILES) {
      const src = path.join(siteFavicons, name);
      if (fs.existsSync(src)) {
        eleventyConfig.addPassthroughCopy({ [src]: name });
      }
    }
  }

  return {
    dir: {
      input:    siteSrc,
      output:   siteDist,
      includes: path.relative(siteSrc, path.join(sharedSrc, '_includes')),
      data:     '_data'
    },
    templateFormats: ['njk', 'html'],
    htmlTemplateEngine: 'njk'
  };
};
