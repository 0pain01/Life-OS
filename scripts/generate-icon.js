// One-off build utility: renders scripts/icon-design.html offscreen at high
// resolution, downsamples it to the standard Windows icon sizes, and hand-
// assembles them into a real multi-size .ico (PNG-compressed frames are
// valid inside an ICO container since Vista, so no native image library is
// needed). Run with: npx electron scripts/generate-icon.js
const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const OUT_ICO = path.join(__dirname, '..', 'build', 'icon.ico');
const OUT_PNG = path.join(__dirname, '..', 'build', 'icon.png');

function buildIco(pngBuffersBySize) {
  const sizes = Object.keys(pngBuffersBySize).map(Number).sort((a, b) => a - b);
  const count = sizes.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const imageBuffers = [];
  for (const size of sizes) {
    const png = pngBuffersBySize[size];
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // image data size
    entry.writeUInt32LE(offset, 12); // image data offset
    dirEntries.push(entry);
    imageBuffers.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

async function main() {
  await app.whenReady();

  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: false },
  });
  await win.loadFile(path.join(__dirname, 'icon-design.html'));
  await win.webContents.executeJavaScript('new Promise(r => { const check = () => window.__done ? r() : setTimeout(check, 30); check(); })');

  const full = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });

  const pngBuffersBySize = {};
  for (const size of SIZES) {
    const resized = full.resize({ width: size, height: size, quality: 'best' });
    pngBuffersBySize[size] = resized.toPNG();
  }

  fs.mkdirSync(path.dirname(OUT_ICO), { recursive: true });
  fs.writeFileSync(OUT_ICO, buildIco(pngBuffersBySize));
  fs.writeFileSync(OUT_PNG, pngBuffersBySize[256]);

  console.log('Wrote', OUT_ICO, 'and', OUT_PNG);
  win.destroy();
  app.quit();
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
