import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, '**/.superpowers/**'],
      // HAKit's browser ESM imports named exports from CommonJS lodash.
      server: { deps: { inline: ['@hakit/core', '@hakit/components'] } },
    },
  })
);
