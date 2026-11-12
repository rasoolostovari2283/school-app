const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nextAppDir = path.join(rootDir, '.next', 'server', 'app');
const nextStaticDir = path.join(rootDir, '.next', 'static');
const publicDir = path.join(rootDir, 'public');
const outDir = path.join(rootDir, 'out');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function exportAppHtml(dir, relBase = '') {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.join(relBase, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      exportAppHtml(fullPath, relPath);
    } else if (entry.endsWith('.html')) {
      const routeName = relPath.slice(0, -'.html'.length);
      if (routeName === 'index' || routeName === '_not-found') {
        const target = path.join(outDir, `${routeName}.html`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fullPath, target);
        if (routeName === '_not-found') {
          fs.copyFileSync(fullPath, path.join(outDir, '404.html'));
        }
      } else {
        // Write both /route/index.html (for trailingSlash & Capacitor WebViewLocalServer)
        // and /route.html (for direct file lookup)
        const dirIndexTarget = path.join(outDir, routeName, 'index.html');
        const flatTarget = path.join(outDir, `${routeName}.html`);
        fs.mkdirSync(path.dirname(dirIndexTarget), { recursive: true });
        fs.copyFileSync(fullPath, dirIndexTarget);
        fs.copyFileSync(fullPath, flatTarget);
      }
    } else if (entry.endsWith('.rsc')) {
      const routeName = relPath.slice(0, -'.rsc'.length);
      if (routeName === 'index') {
        const target = path.join(outDir, 'index.txt');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fullPath, target);
      } else {
        const dirTxtTarget = path.join(outDir, routeName, 'index.txt');
        const flatTxtTarget = path.join(outDir, `${routeName}.txt`);
        fs.mkdirSync(path.dirname(dirTxtTarget), { recursive: true });
        fs.copyFileSync(fullPath, dirTxtTarget);
        fs.copyFileSync(fullPath, flatTxtTarget);
      }
    }
  }
}

try {
  if (fs.existsSync(nextAppDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    copyRecursive(publicDir, outDir);
    copyRecursive(nextStaticDir, path.join(outDir, '_next', 'static'));
    exportAppHtml(nextAppDir);
    console.log('✅ [EduConnect] Static export directory (frontend/out) synchronized for Capacitor & Web.');
  }
} catch (err) {
  console.warn('⚠️ [EduConnect] sync-out warning:', err.message);
}
