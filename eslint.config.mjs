import { defineConfig } from 'eslint/config';
import nextPlugin from '@next/eslint-plugin-next';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';

export default defineConfig([
  // 全局忽略配置
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      'next-env.d.ts',
      '**/*.d.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
  },
  // 基础配置：ES2020 环境 + 模块
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        project: './tsconfig.json',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      'import': importPlugin,
      '@next/next': nextPlugin,
    },
  },
  // Next.js 推荐规则集
  ...nextPlugin.configs.recommended,
  // TypeScript 推荐规则集 (严格)
  ...tsPlugin.configs['recommended-type-checked'],
  ...tsPlugin.configs['strict-type-checked'],
  // React 规则
  {
    rules: {
      'react/jsx-uses-react': 'off',          // React 17+ 无需导入 React
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',              // 使用 TypeScript 代替
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // 自定义规则（优化 AI 动态站点代码质量）
  {
    rules: {
      // TypeScript 严格规则（适度放宽）
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],

      // 导入排序（保持模块整洁）
      'import/order': ['warn', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      }],
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off', // TypeScript 已处理

      // 通用最佳实践
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
    },
  },
  // 针对 Next.js App Router 的特殊规则（禁用某些冲突规则）
  {
    files: ['**/app/**/*.tsx', '**/app/**/*.jsx'],
    rules: {
      'react-hooks/exhaustive-deps': 'warn', // App Router 中 useEffect 依赖可适当放松
    },
  },
]);