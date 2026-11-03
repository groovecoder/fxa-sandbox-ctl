import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Rule 1: colours and sizes come from theme.css tokens. The fox palettes are the one exception.
const HEX = '/#[0-9a-fA-F]{3,8}\\b/';
const ARBITRARY = '/-\\[/';
const noHex = (node) => ({ selector: `${node}=${HEX}]`, message: 'Use a token from theme.css, not a hex value.' });
const noArbitrary = (node) => ({ selector: `${node}=${ARBITRARY}]`, message: 'Use a token class, not an arbitrary value.' });

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/teams/fox.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        ...['Literal[value', 'TemplateElement[value.raw', 'JSXText[value'].flatMap((n) => [noHex(n), noArbitrary(n)])],
    },
  },
);
