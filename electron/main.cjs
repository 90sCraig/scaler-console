const { app, BrowserWindow, dialog, shell } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

let mainWindow;
let embeddedServer;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createMainWindow(port) {
  const localOrigin = `http://127.0.0.1:${port}`;
  mainWindow = new BrowserWindow({
    title: 'Scaler Console',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localOrigin)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(localOrigin);
}

app.on('second-instance', focusMainWindow);

app.whenReady().then(async () => {
  try {
    const serverModuleUrl = pathToFileURL(join(__dirname, '..', 'src', 'server.js')).href;
    const { startServer } = await import(serverModuleUrl);
    const started = await startServer({ port: 0 });
    embeddedServer = started.server;
    createMainWindow(started.port);
  } catch (error) {
    dialog.showErrorBox('Scaler Console could not start', error.message);
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) focusMainWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (embeddedServer?.listening) embeddedServer.close();
});
