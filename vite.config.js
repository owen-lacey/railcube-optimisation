import { sveltekit } from '@sveltejs/kit/vite';
import { qrcode } from 'vite-plugin-qrcode';

export default {
  plugins: [sveltekit(), qrcode()],
};
