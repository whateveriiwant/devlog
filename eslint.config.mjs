import js from '@eslint/js';
import ts from 'typescript-eslint';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-plugin-prettier/recommended';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default ts.config(
  {
    ignores: [
      '.next/**',
      '.astro/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'work/**',
      'outputs/**',
      'eslint.config.mjs',
      'postcss.config.mjs',
      'next-env.d.ts',
      'public/**',
      'dist/**',
      'playwright-report/**',
      'test-results/**',
      'e2e/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...ts.configs.strictTypeChecked,
      ...ts.configs.stylisticTypeChecked,
    ],
    plugins: { react, 'react-hooks': hooks },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...hooks.configs.recommended.rules,
      'react/jsx-key': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  prettier
);
