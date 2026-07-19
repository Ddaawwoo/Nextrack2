import { cp, mkdir, rm } from 'node:fs/promises';

const files = [
  'index.html',
  'manifest.json',
  'sw.js',
  'gdrive-advanced.js',
  'dropbox-advanced.js',
  'logo.png',
  'splash-screen.jpg',
  'source.png',
  'mega.png',
  'googledrive.png',
  'dropbox.png',
  'settings.png',
  'icons'
];

await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
await Promise.all(files.map(file => cp(file, `www/${file}`, { recursive: true })));
console.log('Webová aplikace byla připravena v adresáři www.');
