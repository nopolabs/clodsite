const path = require('path');

module.exports = function(eleventyConfig) {
  const siteDir = process.env.SITE_DIR;
  if (!siteDir) {
    throw new Error('SITE_DIR is not set. Export it before running Eleventy.');
  }

  const repoRoot   = path.resolve(__dirname, '..');
  const sharedSrc  = path.join(__dirname, 'src');
  const siteSrc    = path.resolve(repoRoot, siteDir, 'src');
  const siteDist   = path.resolve(repoRoot, siteDir, 'dist');
  const siteImages = path.resolve(repoRoot, siteDir, 'images');

  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'css')]: 'css' });
  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'favicon.svg')]: 'favicon.svg' });
  eleventyConfig.addPassthroughCopy({ [siteImages]: 'images' });

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
