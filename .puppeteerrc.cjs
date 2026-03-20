module.exports = {
  // Cache directory for downloaded browsers
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR || '/workspace/.cache/puppeteer',

  // Don't force download during npm install - let runtime handle it
  skipDownload: process.env.PUPPETEER_SKIP_DOWNLOAD === 'true',

  // Use bundled Chrome
  browserVersion: '145',
};
