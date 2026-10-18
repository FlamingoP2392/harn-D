import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', '.next/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', 'public/sw.js'] },
  eslint.configs.recommended, tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: { allowDefaultProject: ['*.mjs'] } } } },
);
