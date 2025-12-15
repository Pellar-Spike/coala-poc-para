/** @type {import('next').NextConfig} */
const webpack = require('webpack');

const nextConfig = {
  reactStrictMode: true,
  // Tell Next.js to treat these packages as external (not bundle them)
  // This applies to both Server Components and API routes
  experimental: {
    serverComponentsExternalPackages: [
      '@dynamic-labs-wallet/node-evm',
      '@dynamic-labs-wallet/node',
    ],
  },
  webpack: (config, { isServer }) => {
    // Ignore optional dependencies that are not needed for web
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^pino-pretty$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^@react-native-async-storage\/async-storage$/,
      })
    );

    // Ignore all .node files - they are native binaries that should be loaded at runtime
    config.plugins.push(
      new webpack.IgnorePlugin({
        checkResource(resource) {
          // Ignore any .node files
          if (resource && resource.endsWith('.node')) {
            return true;
          }
          return false;
        },
      })
    );

    if (!isServer) {
      // Client-side: Exclude native Node.js modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'pino-pretty': false,
        '@react-native-async-storage/async-storage': false,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        crypto: false,
        stream: false,
        util: false,
        path: false,
        os: false,
        buffer: false,
        process: false,
      };

      // Exclude @dynamic-labs-wallet/node-evm from client-side bundle
      config.externals = config.externals || [];
      config.externals.push({
        '@dynamic-labs-wallet/node-evm': 'commonjs @dynamic-labs-wallet/node-evm',
        '@dynamic-labs-wallet/node': 'commonjs @dynamic-labs-wallet/node',
      });
    } else {
      // Server-side: Mark native modules and .node files as external
      // This prevents webpack from trying to bundle them
      // Important: @dynamic-labs-wallet/node-evm is an ES Module, so we need to exclude it completely
      const originalExternals = config.externals;
      
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals]),
        // Exclude packages with native modules (ES modules should not be bundled)
        // Return false to tell webpack not to bundle it - let Node.js handle it at runtime
        '@dynamic-labs-wallet/node-evm',
        '@dynamic-labs-wallet/node',
        // Function to check external modules
        ({ request }, callback) => {
          if (!request) {
            return callback();
          }
          
          // Exclude packages with native modules
          if (request === '@dynamic-labs-wallet/node-evm' || 
              request === '@dynamic-labs-wallet/node' ||
              request.startsWith('@dynamic-labs-wallet/node-evm/') ||
              request.startsWith('@dynamic-labs-wallet/node/')) {
            // Return false to mark as external - don't bundle, let Node.js load it
            return callback(null, false);
          }
          
          // Exclude .node files
          if (request.endsWith('.node') || request.includes('.node')) {
            return callback(null, false);
          }
          
          callback();
        },
      ];
    }

    return config;
  },
}

module.exports = nextConfig

