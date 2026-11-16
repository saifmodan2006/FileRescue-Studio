import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {fileURLToPath, URL} from 'node:url';

export default defineConfig(({mode}) => {
  const port = loadEnv(mode,process.cwd(),'').PORT ?? '4310';
  return {
    plugins:[react(),tailwind()],
    resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
    worker:{format:'es'},
    optimizeDeps:{include:['pdfjs-dist','pdf-lib']},
    server:{port:5173,strictPort:true,proxy:{'/api':`http://127.0.0.1:${port}`}},
  };
});
