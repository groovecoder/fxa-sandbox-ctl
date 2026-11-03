import { readFileSync } from 'node:fs';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Rule 1: colours and sizes come from theme.css tokens. The fox palettes are the one exception.
const HEX = '/#[0-9a-fA-F]{3,8}\\b/';
const ARBITRARY = '/-\\[/';
const noHex = (node) => ({ selector: `${node}=${HEX}]`, message: 'Use a token from theme.css, not a hex value.' });
const noArbitrary = (node) => ({ selector: `${node}=${ARBITRARY}]`, message: 'Use a token class, not an arbitrary value.' });
// Section 5.6: a copy-in keeps the project token names, never the shadcn aliases.
const SHADCN = '/\\b(bg|text|border|ring|fill|stroke|outline)-(background|foreground|primary|secondary|muted|accent|destructive|popover|input)\\b|--(background|foreground|muted-foreground|primary|secondary|accent|destructive|popover|ring)\\b/';
const noShadcn = (node) => ({ selector: `${node}=${SHADCN}]`, message: 'Use a project token, not a shadcn alias.' });

// A copy-in keeps relative imports: a path alias that tsconfig.json does not define, such as shadcn's "@/components/ui", fails.
const paths = Object.keys(JSON.parse(readFileSync(`${import.meta.dirname}/tsconfig.json`, 'utf8')).compilerOptions.paths ?? {});
const defined = paths.map((p) => p.replace(/\*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const ALIAS = `^${defined.length ? `(?!${defined.join('|')})` : ''}[@~#]/`;

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: ALIAS, message: 'Use a relative import: tsconfig.json defines no such path alias.' }] }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/teams/fox.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        ...['Literal[value', 'TemplateElement[value.raw', 'JSXText[value'].flatMap((n) => [noHex(n), noArbitrary(n), noShadcn(n)])],
    },
  },
);
