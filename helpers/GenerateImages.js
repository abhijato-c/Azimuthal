import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(dirname, '..', 'public', 'Satellites');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
fs.writeFileSync(path.join(dir, 'ImageNames.json'), JSON.stringify(files));