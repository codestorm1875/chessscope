// Rebuild the self-contained piece data in app.js after rendering in Blender.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appPath = path.join(root,'app.js');
const start = '// BEGIN EMBEDDED WOODEN PIECES';
const end = '// END EMBEDDED WOODEN PIECES';
const images = {};
const flatImages = {};
for (const side of ['w','b']) {
  for (const kind of 'KQRBNP') {
    const data = await readFile(path.join(root,'assets','pieces',`${side}${kind}.png`));
    images[side+kind] = `data:image/png;base64,${data.toString('base64')}`;
    const flat = await readFile(path.join(root,'assets','flat-pieces',`${side}${kind}.svg`));
    flatImages[side+kind] = `data:image/svg+xml;base64,${flat.toString('base64')}`;
  }
}
const app = await readFile(appPath,'utf8');
const begin = app.indexOf(start), finish = app.indexOf(end);
if (begin < 0 || finish < begin) throw Error('Could not find embedded piece markers in app.js');
const replacement = `${start}\nconst woodPieceImages = ${JSON.stringify(images)};\nconst flatPieceImages = ${JSON.stringify(flatImages)};\n${end}`;
await writeFile(appPath,app.slice(0,begin)+replacement+app.slice(finish+end.length));
console.log('Embedded twelve wooden piece sprites in app.js');
