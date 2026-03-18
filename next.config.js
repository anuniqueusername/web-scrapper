/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ---------------------------------------------------------------------------
  // Turbopack (Next.js 16 default bundler)
  //
  // An empty turbopack block silences the build warning:
  //   "This build is using Turbopack, with a webpack config and no turbopack config."
  //
  // Turbopack is NOT used for production builds in this project.  The build
  // script uses `next build --webpack` (see package.json) because Turbopack
  // incorrectly traces child_process.spawn() string arguments as module import
  // paths, producing fatal "Module not found" errors for standalone scripts
  // (scraper.js, facebook-worker-runner.js) that are intentionally outside the
  // Next.js source tree.  There is no supported Turbopack API in Next.js 16.x
  // to suppress this behaviour for local file paths.
  //
  // When Vercel or the Turbopack team add a proper externals/ignore API for
  // spawn() argument tracing, this note can be removed and Turbopack re-enabled.
  // ---------------------------------------------------------------------------
  turbopack: {},

  // ---------------------------------------------------------------------------
  // Webpack (used for all builds via `next build --webpack`)
  //
  // Mark Node.js built-in modules as externals so webpack never attempts to
  // bundle them.  This eliminates the "Critical dependency: the request of a
  // dependency is an expression" warning that appears when child_process is
  // imported inside an API route.
  //
  // Strategy: push a function external so the handler works regardless of
  // whether config.externals is an array or object (Next.js may initialise it
  // in either shape depending on the version).
  // ---------------------------------------------------------------------------
  webpack(config, { isServer }) {
    if (isServer) {
      const builtinExternals = new Set([
        'child_process', 'fs', 'path', 'os', 'net', 'tls',
      ]);

      if (!Array.isArray(config.externals)) {
        config.externals = config.externals ? [config.externals] : [];
      }

      config.externals.push(({ request }, callback) => {
        if (builtinExternals.has(request)) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      });
    }
    return config;
  },
};

module.exports = nextConfig;
