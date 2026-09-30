// A standalone Vite root for the spike: `npm run spike:three` serves this folder
// on the LAN and prints a QR code for the network URL, so it can be opened on a
// phone without deploying anything.
import { fileURLToPath } from 'node:url';
import { qrcode } from 'vite-plugin-qrcode';

const repo = fileURLToPath(new URL('../..', import.meta.url));

export default {
  plugins: [qrcode()],
  server: {
    host: true,
    // The page imports the real renderer geometry and `three` from the repo root.
    fs: { allow: [repo] },
  },
};
