const { SourceMapConsumer } = require('source-map');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'dist/assets');
const files = fs.readdirSync(assetsDir);

// Trouver tous les bundles avec leurs source maps
const bundles = {};
files.filter(f => f.endsWith('.js.map')).forEach(mapFile => {
  const jsFile = mapFile.replace('.map', '');
  bundles[jsFile] = path.join(assetsDir, mapFile);
});

// Positions à décompiler depuis le componentStack + l'erreur elle-même
// Le crash: fb@index:2:41801, sy@index:3:232662, Mi@vendor-tanstack:1:40132, ry@index:3:234907
// Aussi chercher ce qui est ENTRE Mi et fb — c'est là que le throw se produit

async function decode() {
  // Chercher dans vendor-tanstack (Mi@vendor-tanstack:1:40132)
  const tanstackMap = Object.keys(bundles).find(k => k.includes('vendor-tanstack'));
  if (tanstackMap) {
    const rawMap = JSON.parse(fs.readFileSync(bundles[tanstackMap], 'utf8'));
    await SourceMapConsumer.with(rawMap, null, consumer => {
      const pos = consumer.originalPositionFor({ line: 1, column: 40132 });
      console.log('\n=== Mi@vendor-tanstack:1:40132 ===');
      console.log('Source:', pos.source);
      console.log('Ligne:', pos.line, '| Nom:', pos.name);
    });
  }

  // Chercher dans index principal
  const indexFile = Object.keys(bundles).filter(k => k.startsWith('index-')).sort((a, b) => {
    return fs.statSync(path.join(assetsDir, b)).size - fs.statSync(path.join(assetsDir, a)).size;
  })[0];
  
  if (!indexFile) { console.error('Pas de bundle index trouvé'); return; }
  console.log('\nBundle index:', indexFile);
  
  const rawMap = JSON.parse(fs.readFileSync(bundles[indexFile], 'utf8'));
  await SourceMapConsumer.with(rawMap, null, consumer => {
    // Chercher autour de fb:2:41801 — regarder les positions proches pour trouver le throw
    // Le throw est probablement quelques colonnes AVANT 41801
    console.log('\n=== Recherche du throw autour de fb:2:41801 ===');
    for (const col of [41700, 41750, 41780, 41801, 41820, 41850, 41900, 41950, 42000]) {
      const pos = consumer.originalPositionFor({ line: 2, column: col });
      if (pos.source) console.log(`  col ${col}: ${pos.source}:${pos.line}:${pos.column} (${pos.name})`);
    }

    // Chercher autour de sy:3:232662
    console.log('\n=== Recherche autour de sy:3:232662 ===');
    for (const col of [232500, 232550, 232600, 232662, 232700, 232750, 232800]) {
      const pos = consumer.originalPositionFor({ line: 3, column: col });
      if (pos.source) console.log(`  col ${col}: ${pos.source}:${pos.line}:${pos.column} (${pos.name})`);
    }

    // Chercher autour de ry:3:234907
    console.log('\n=== Recherche autour de ry:3:234907 ===');
    for (const col of [234700, 234800, 234907, 235000, 235100]) {
      const pos = consumer.originalPositionFor({ line: 3, column: col });
      if (pos.source) console.log(`  col ${col}: ${pos.source}:${pos.line}:${pos.column} (${pos.name})`);
    }

    // Chercher dans la zone entre fb et sy — c'est là que le throw se produit
    console.log('\n=== Zone entre fb(2:41801) et sy(3:232662) — recherche du throw ===');
    // Ligne 2 après 41801
    for (const col of [42000, 43000, 44000, 45000, 50000, 60000, 70000, 80000, 90000, 100000]) {
      const pos = consumer.originalPositionFor({ line: 2, column: col });
      if (pos.source && pos.source.includes('src/')) {
        console.log(`  L2:col ${col}: ${pos.source}:${pos.line}:${pos.column} (${pos.name})`);
      }
    }
  });
}

decode().catch(console.error);
