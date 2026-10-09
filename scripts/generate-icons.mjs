// Renders the toolbar/store icons from src/shared/securin-mark.svg: the Securin
// logomark in brand violet on a dark rounded tile, via headless Chromium.
//
//   CHROME_PATH=/path/to/chrome npm run icons
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const candidates = [
  process.env.CHROME_PATH,
  join(homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chrome = candidates.find((p) => existsSync(p));
if (!chrome) throw new Error('No Chrome found; set CHROME_PATH.');

const mark = readFileSync(new URL('../src/shared/securin-mark.svg', import.meta.url), 'utf8')
  .replace('fill="currentColor"', 'fill="#9C66FF"')
  .replace('<svg ', '<svg width="100%" height="100%" ');

const work = mkdtempSync(join(tmpdir(), 'securin-icons-'));
mkdirSync('public/icons', { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const pad = Math.max(2, Math.round(size * 0.16));
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;box-sizing:border-box;padding:${pad}px;
      border-radius:${Math.round(size * 0.22)}px;background:#1b1124;display:flex">${mark}</div>
    </body></html>`;
  const file = join(work, `icon-${size}.html`);
  writeFileSync(file, html);
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      `--window-size=${size},${size}`,
      `--screenshot=${join(process.cwd(), `public/icons/icon-${size}.png`)}`,
      `file://${file}`,
    ],
    { stdio: 'ignore' },
  );
}
rmSync(work, { recursive: true, force: true });
console.log('icons written to public/icons/');
