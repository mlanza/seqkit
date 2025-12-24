export default {
  input: 'src/notes.js',
  output: {
    file: 'bin/notes',
    format: 'es',
    banner: '#!/usr/bin/env deno run --allow-net --allow-env --allow-read'
  },
  external: [
    'deno.land/x/cliffy',
    'https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts'
  ]
}
