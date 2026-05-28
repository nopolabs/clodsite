module.exports = function(eleventyConfig) {
  const siteDir = process.env.SITE_DIR;
  if (!siteDir) {
    throw new Error('SITE_DIR is not set. Export it before running Eleventy.');
  }

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy({ [`${siteDir}/images`]: "images" });

  return {
    dir: {
      input: "src",
      output: `${siteDir}/dist`,
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "html"],
    htmlTemplateEngine: "njk"
  };
};
