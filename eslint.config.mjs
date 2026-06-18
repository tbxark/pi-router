// @ts-check
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.vscode-test',
      'examples',
      'out',
      '**/*.d.ts'
    ]
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      curly: 'warn',
      '@stylistic/semi': ['warn', 'always'],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_'
        }
      ]
    }
  }
);
