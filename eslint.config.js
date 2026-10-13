// SPDX-License-Identifier: GPL-3.0-or-later
import js from '@eslint/js';

export default [
    {ignores: ['dist/**']},
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {console: 'readonly', global: 'readonly', URL: 'readonly'},
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrors: 'none'}],
            eqeqeq: 'error',
            'no-var': 'error',
            'prefer-const': 'error',
        },
    },
];
