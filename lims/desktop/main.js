/**
 * LabCore — Windows ish stansiyasi dasturi.
 *
 * Bu dastur laboratoriya serveridagi interfeysni ochadi va brauzerda
 * bo'lmaydigan uchta narsani beradi:
 *
 *   1. Kompyuterning HAQIQIY nomi (os.hostname) har bir so'rovga
 *      X-Computer-Name sarlavhasi bilan qo'shiladi — audit jurnalida
 *      "LAB-PC-02" aniq ko'rinadi, taxminiy nom emas.
 *   2. Server manzili bir marta sozlanadi va saqlanadi; xodim har safar
 *      manzil terib o'tirmaydi.
 *   3. Chop etish, shtrix-kod skaneri va to'liq ekran rejimi tizim
 *      darajasida ishlaydi; F5/Ctrl+P kabi tugmalar sozlangan.
 */

const { app, BrowserWindow, session, dialog, Menu, shell } = require('electron');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_FILE = path.join(app.getPath('userData'), 'labcore.json');
const COMPUTER_NAME = (process.env.LABCORE_STATION || os.hostname() || 'WINDOWS-PC')
  .toUpperCase()
  .slice(0, 100);

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}

let win = null;

function createWindow(serverUrl) {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'LabCore',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#f4f6f9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // Kompyuter nomi preload'ga shu argument orqali yetkaziladi.
      additionalArguments: [`--labcore-station=${COMPUTER_NAME}`],
    },
  });

  // Har bir so'rovga ish stansiyasi nomini qo'shamiz — audit uchun.
  // Sahifa o'zi ham x-computer-name yuborishi mumkin; ikkita sarlavha
  // bo'lib qolmasligi uchun avval har qanday registrdagi nusxani olib tashlaymiz.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = {};
    for (const [key, value] of Object.entries(details.requestHeaders)) {
      if (key.toLowerCase() !== 'x-computer-name') headers[key] = value;
    }
    headers['X-Computer-Name'] = COMPUTER_NAME;
    callback({ requestHeaders: headers });
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Natija blankasi va chek alohida oynada ochiladi (chop etish uchun).
    if (url.startsWith(serverUrl) || url.startsWith('about:blank')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(serverUrl).catch(() => showConnectionError(serverUrl));

  win.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
    if (failedUrl === serverUrl || failedUrl.startsWith(serverUrl)) {
      showConnectionError(serverUrl, `${desc} (${code})`);
    }
  });
}

function showConnectionError(serverUrl, detail = '') {
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'Serverga ulanib bo‘lmadi',
    message: `Laboratoriya serveriga ulanib bo‘lmadi:\n${serverUrl}\n\n${detail}`,
    detail:
      'Tekshiring:\n' +
      '  • server kompyuteri yoqilganmi\n' +
      '  • tarmoq kabeli / Wi-Fi ulanganmi\n' +
      '  • server manzili to‘g‘ri kiritilganmi',
    buttons: ['Qayta urinish', 'Manzilni o‘zgartirish', 'Chiqish'],
    defaultId: 0,
    cancelId: 2,
  });

  if (choice === 0) win?.loadURL(serverUrl).catch(() => showConnectionError(serverUrl));
  else if (choice === 1) { writeConfig({ serverUrl: null }); app.relaunch(); app.exit(0); }
  else app.exit(0);
}

/** Birinchi ishga tushirishda server manzilini so'raymiz. */
function askServerUrl() {
  const setupWin = new BrowserWindow({
    width: 460,
    height: 400,
    resizable: false,
    title: 'LabCore — sozlash',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      additionalArguments: [`--labcore-station=${COMPUTER_NAME}`],
    },
  });
  setupWin.setMenu(null);
  setupWin.loadFile(path.join(__dirname, 'setup.html'), {
    query: { station: COMPUTER_NAME },
  });
  return setupWin;
}

function buildMenu(serverUrl) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Fayl',
      submenu: [
        { label: 'Chop etish', accelerator: 'CmdOrCtrl+P', click: () => win?.webContents.print() },
        { type: 'separator' },
        { label: 'Chiqish', role: 'quit' },
      ],
    },
    {
      label: 'Ko‘rinish',
      submenu: [
        { label: 'Yangilash', accelerator: 'F5', click: () => win?.reload() },
        { label: 'To‘liq ekran', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Kattalashtirish', role: 'zoomIn' },
        { label: 'Kichiklashtirish', role: 'zoomOut' },
        { label: 'Odatiy o‘lcham', role: 'resetZoom' },
      ],
    },
    {
      label: 'Yordam',
      submenu: [
        {
          label: 'Tizim haqida',
          click: () => dialog.showMessageBox({
            type: 'info',
            title: 'LabCore',
            message: 'LabCore — laboratoriya ish stansiyasi',
            detail:
              `Ish stansiyasi: ${COMPUTER_NAME}\n` +
              `Server: ${serverUrl}\n` +
              `Versiya: ${app.getVersion()}\n\n` +
              'Bu kompyuterdagi har bir amal audit jurnaliga yoziladi.',
          }),
        },
        {
          label: 'Server manzilini o‘zgartirish',
          click: () => { writeConfig({ serverUrl: null }); app.relaunch(); app.exit(0); },
        },
        { label: 'Dasturchi vositalari', accelerator: 'F12', click: () => win?.webContents.toggleDevTools() },
      ],
    },
  ]));
}

app.whenReady().then(() => {
  const cfg = readConfig();

  if (!cfg.serverUrl) {
    const setupWin = askServerUrl();
    const { ipcMain } = require('electron');
    ipcMain.handle('labcore:save-server', (_e, url) => {
      writeConfig({ serverUrl: url });
      setupWin.close();
      buildMenu(url);
      createWindow(url);
      return true;
    });
    ipcMain.handle('labcore:test-server', async (_e, url) => {
      try {
        const res = await fetch(new URL('/api/health', url), { signal: AbortSignal.timeout(5000) });
        const body = await res.json();
        return { ok: !!body.ok, lab: body.lab || null };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    return;
  }

  buildMenu(cfg.serverUrl);
  createWindow(cfg.serverUrl);
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const cfg = readConfig();
    if (cfg.serverUrl) createWindow(cfg.serverUrl);
  }
});
