import base from '@forgeboard/config/eslint';

export default [
  ...base,
  { ignores: ['prisma/seed.cjs'] },
  {
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', fetch: 'readonly' },
    },
  },
];
