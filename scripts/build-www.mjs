/* Copia el sitio a www/ para que Capacitor lo empaquete.
 *
 * Capacitor no acepta webDir: "." (rechaza la raíz explícitamente), y aunque
 * la aceptara meteríamos node_modules/, android/ y .git/ dentro del APK.
 * Las fuentes siguen en la raíz para que GitHub Pages sirva el repo tal cual;
 * www/ es solo un artefacto de build y no se versiona.
 */
import { cp, rm, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

const ASSETS = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'icons'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of ASSETS) {
  await cp(join(root, name), join(out, name), { recursive: true });
}

console.log(`www/ generado con: ${ASSETS.join(', ')}`);
