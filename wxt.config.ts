import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: {
    name: 'Projeto Bilíngue',
    host_permissions: ['https://www.youtube.com/*'],
  },
});
