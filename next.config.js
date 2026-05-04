/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable cross-origin isolation so SharedArrayBuffer works for the
  // on-device WASM background remover. esm.sh and CDN-served MediaPipe
  // assets advertise the right cross-origin headers, so this should not
  // break anything. If it does in your environment, remove these and
  // imgly will fall back to single-threaded mode automatically.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;


