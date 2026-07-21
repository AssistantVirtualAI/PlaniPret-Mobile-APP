const fs = require('fs');
const path = require('path');

// Find main bundle
const distDir = 'dist/assets';
const files = fs.readdirSync(distDir).filter(f => f.startsWith('index-') && f.endsWith('.js') && !f.endsWith('.map'));
const mainBundle = files.sort((a, b) => fs.statSync(path.join(distDir, b)).size - fs.statSync(path.join(distDir, a)).size)[0];
console.log('Main bundle:', mainBundle);

const mapFile = path.join(distDir, mainBundle + '.map');
if (!fs.existsSync(mapFile)) {
  console.log('No source map found at', mapFile);
  process.exit(1);
}

const { SourceMapConsumer } = require('source-map');
const rawMap = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

// Positions from crash componentStack (line 2 = index 1, line 3 = index 2)
const positions = [
  { line: 2, column: 41801, label: 'xb (ThemeProvider area)' },
  { line: 3, column: 232662, label: 'ry (LanguageProvider area)' },
  { line: 3, column: 235241, label: 'iy (AppErrorBoundary area)' },
];

SourceMapConsumer.with(rawMap, null, consumer => {
  for (const p of positions) {
    const orig = consumer.originalPositionFor({ line: p.line, column: p.column });
    console.log(`\n${p.label} (${p.line}:${p.column}):`);
    console.log('  source:', orig.source);
    console.log('  line:', orig.line);
    console.log('  column:', orig.column);
    console.log('  name:', orig.name);
    
    // Also check nearby positions to find the actual throw
    for (let offset = -100; offset <= 100; offset += 20) {
      const col = p.column + offset;
      if (col < 0) continue;
      const near = consumer.originalPositionFor({ line: p.line, column: col });
      if (near.source && near.source !== orig.source) {
        console.log(`  nearby (col ${col}): ${near.source}:${near.line}:${near.column} [${near.name}]`);
      }
    }
  }
});
