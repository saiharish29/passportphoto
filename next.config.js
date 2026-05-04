/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No COOP/COEP headers — they break cross-origin module imports from esm.sh
  // on iOS Safari with the error "Importing a module script failed".
  // imgly's WASM falls back to single-threaded mode without SharedArrayBuffer,
  // which is slightly slower but works reliably across all platforms.
};

module.exports = nextConfig;
