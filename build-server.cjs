const { execSync } = require('child_process');
const fs = require('fs');

execSync(
  'npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=server-bundle.cjs',
  { stdio: 'inherit' }
);

let code = fs.readFileSync('server-bundle.cjs', 'utf8');

// esbuild produces an empty import_meta in CJS mode, causing fileURLToPath(undefined) to crash.
// In CJS, __dirname and __filename are native globals — just remove the broken re-declarations.
code = code.replace(
  /var import_meta = \{\};\s*\nvar __filename = .+;\s*\nvar __dirname = .+;/,
  '// __dirname and __filename are native CJS globals'
);

fs.writeFileSync('server-bundle.cjs', code);
console.log('server-bundle.cjs patched successfully');
