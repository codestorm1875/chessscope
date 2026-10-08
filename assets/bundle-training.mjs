import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=async name=>readFile(path.join(root,name),'utf8');
const stripExports=text=>text.replace(/^export /gm,'');
const chess=stripExports(await source('chess.js'));
const ecoBook=stripExports(await source('eco-book.js'));
const openings=stripExports((await source('openings.js')).replace(/^import .*\n/gm,''));
const tactics=stripExports(await source('tactics.js'));
const training=(await source('training.js'))
  .replace(/^import .*\n/gm,'')
  .replace(/^const files='abcdefgh';\n/m,'');
const start='// BEGIN TRAINING BUNDLE';
const end='// END TRAINING BUNDLE';
const bundle=`${start}\n(() => {\n${chess}\n${ecoBook}\n${openings}\n${tactics}\n${training}\n})();\n${end}`;
const appPath=path.join(root,'app.js');
let app=await readFile(appPath,'utf8');
const begin=app.indexOf(start), finish=app.indexOf(end);
if((begin<0)!==(finish<0))throw Error('Training bundle markers are incomplete.');
app=begin<0?`${app.trimEnd()}\n\n${bundle}\n`:`${app.slice(0,begin)}${bundle}${app.slice(finish+end.length)}`;
await writeFile(appPath,app);
console.log('Bundled training boards and lessons into app.js');
