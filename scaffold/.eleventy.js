module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  // Site images live in site/images/ (site content, not tool scaffold).
  // Copied to site/dist/images/.
  eleventyConfig.addPassthroughCopy({ "../site/images": "images" });
  return {
    dir: {
      input: "src",
      output: "../site/dist",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "html"],
    htmlTemplateEngine: "njk"
  };
};
