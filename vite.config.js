import { sveltekit } from '@sveltejs/kit/vite';
import { qrcode } from 'vite-plugin-qrcode';
import { imagetools } from 'vite-imagetools';

export default {
  plugins: [sveltekit(), qrcode(), imagetools()],
};
