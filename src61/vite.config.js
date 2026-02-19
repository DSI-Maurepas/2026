import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Chargement des variables d'environnement (.env)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Le 'base' doit correspondre au nom de votre dépôt GitHub (ex: /elections-2026/)
    // Si vous utilisez un domaine personnalisé, laissez '/'
    base: mode === 'production' ? '/elections-2026/' : '/',

    plugins: [
      react({
        // Optimisation Fast Refresh pour les Hooks React 18
        fastRefresh: true,
      }),
    ],

    server: {
      port: 3000,
      strictPort: true,
      host: true,
      // ⚡ Désactiver la surveillance de fichiers inutiles
      watch: {
        ignored: ['**/node_modules/**', '**/.git/**'],
      },
    },

    // ⚡ Pré-bundler les dépendances lourdes une seule fois
    optimizeDeps: {
      include: ['react', 'react-dom'],
      // xlsx et recharts sont chargés en lazy, ne pas les pré-bundler au démarrage
      exclude: [],
    },

    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production', // Désactivé en prod pour la légèreté
      minify: 'esbuild',
      rollupOptions: {
        output: {
          // Découpage du code pour améliorer le chargement initial
          manualChunks: {
            vendor: ['react', 'react-dom'],
            charts: ['recharts'], // Si vous utilisez recharts pour les stats
            excel: ['xlsx'],      // Si vous utilisez xlsx pour les exports
          },
        },
      },
    },

    // Définition de constantes globales
    define: {
      __APP_VERSION__: JSON.stringify('1.0.0'),
      __SCRUTIN_DATE__: JSON.stringify('2026-03-15'),
    },
  };
});