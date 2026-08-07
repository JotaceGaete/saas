import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const mock = (name) => path.resolve(here, name);
const replacements = [
  [/contexts\/AuthContext$/, mock('mockAuthContext.jsx')],
  [/services\/waBusinessService$/, mock('mockWaBusinessService.js')],
  [/lib\/supabase$/, mock('mockSupabase.js')],
  [/services\/crmService$/, mock('mockCrmService.js')],
  [/services\/mediaUploadService$/, mock('mockMediaUploadService.js')],
  [/utils\/imageUploadUtils$/, mock('mockImageUploadUtils.js')],
  [/services\/productMediaService$/, mock('mockProductMediaService.js')],
];

export default defineConfig({
  root: here,
  plugins: [
    { name: 'product-editor-e2e-mocks', enforce: 'pre', resolveId(source) {
      const normalized = source.replace(/\\/g, '/').replace(/\.(jsx?|tsx?)$/, '');
      return replacements.find(([pattern]) => pattern.test(normalized))?.[1] || null;
    } },
    react(),
  ],
  resolve: { alias: {
    components: path.resolve(repo, 'src/components'), pages: path.resolve(repo, 'src/pages'),
    services: path.resolve(repo, 'src/services'), utils: path.resolve(repo, 'src/utils'),
    hooks: path.resolve(repo, 'src/hooks'), config: path.resolve(repo, 'src/config'),
    constants: path.resolve(repo, 'src/constants'), lib: path.resolve(repo, 'src/lib'), contexts: path.resolve(repo, 'src/contexts'),
  } },
  server: { host: '127.0.0.1', port: 4179, strictPort: true },
});
