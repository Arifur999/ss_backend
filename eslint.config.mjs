import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: ['dist', 'node_modules', 'src/generated'],
  },
  {
    // Everything in this repo runs in Node - the server and the scripts beside
    // it - so process, console, fetch and the timers are all defined.
    //
    // It went unnoticed until a plain .mjs script was added. typescript-eslint's
    // recommended config turns `no-undef` off for .ts files, because the type
    // checker already knows what exists; a .mjs file gets no such treatment, so
    // every console.log in the demo seeder was reported as an undefined
    // variable and CI stopped the deploy over it.
    languageOptions: {
      globals: globals.node,
    },
  }
);
