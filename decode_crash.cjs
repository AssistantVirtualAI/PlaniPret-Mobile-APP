const { SourceMapConsumer } = require('source-map');
const fs = require('fs');
const path = require('path');

// Le crash est toujours à fb:2:41801 dans index-*.js
// Chercher le bundle index principal (le plus gros)
const assetsDir = path.join(__dirname, 'dist/assets');
const files = fs.readdirSync(assetsDir);

// Trouver le fichier index principal et sa source map
const indexFiles = files.filter(f => f.startsWith('index-') && f.endsWith('.js') && !f.endsWith('.map'));
const indexFile = indexFiles.sort((a, b) => {
  return fs.statSync(path.join(assetsDir, b)).size - fs.statSync(path.join(assetsDir, a)).size;
})[0];

console.log('Bundle index principal:', indexFile);

const mapFile = indexFile + '.map';
const mapPath = path.join(assetsDir, mapFile);

if (!fs.existsSync(mapPath)) {
  console.error('Source map non trouvée:', mapPath);
  process.exit(1);
}

const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

SourceMapConsumer.with(rawMap, null, consumer => {
  // Position du crash: ligne 2, colonne 41801
  const pos1 = consumer.originalPositionFor({ line: 2, column: 41801 });
  console.log('\n=== Position fb:2:41801 ===');
  console.log('Source:', pos1.source);
  console.log('Ligne:', pos1.line);
  console.log('Colonne:', pos1.column);
  console.log('Nom:', pos1.name);

  // Position sy:3:232662
  const pos2 = consumer.originalPositionFor({ line: 3, column: 232662 });
  console.log('\n=== Position sy:3:232662 ===');
  console.log('Source:', pos2.source);
  console.log('Ligne:', pos2.line);
  console.log('Colonne:', pos2.column);
  console.log('Nom:', pos2.name);

  // Position ry:3:234907
  const pos3 = consumer.originalPositionFor({ line: 3, column: 234907 });
  console.log('\n=== Position ry:3:234907 ===');
  console.log('Source:', pos3.source);
  console.log('Ligne:', pos3.line);
  console.log('Colonne:', pos3.column);
  console.log('Nom:', pos3.name);
});
