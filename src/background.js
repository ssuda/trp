'use strict';

import { app, protocol, BrowserWindow, ipcMain, Menu } from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  createProtocol,
  installVueDevtools
} from 'vue-cli-plugin-electron-builder/lib';
import theme from '@/theme';
import { getMainWindowSize } from './screenSize';

import {
  tagVehicles,
  permitDetails,
  permitsDetails,
  permitReport,
  newPermits,
  refreshPermits,
  releaseVehicles,
  browserInit,
  busyFlag,
  disconnect
} from '../i3ms/i3ms';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

global.userData = app.getPath('userData');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let winURL;
let checkedForUpdate = false;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
]);

import fastq from 'fastq';
const messageQueue = fastq(processMessage, 1);

async function processMessage(message, cb) {
  const { event, args, type } = message;

  busyFlag.isBusy = true;

  switch (type) {
    case 'permit-report':
      {
        console.log('permit-report', args.startDate, args.endDate);
        await browserInit(args.credentials, !args.showBrowser);
        const r = await permitReport(args, event.sender);
        console.log('sending permit-report results to browser', r);
        event.sender.send('permit-report-results', r);
      }
      break;

    case 'tag-vehicles':
      {
        console.log('tag-vehicles', args);
        await browserInit(args.credentials, !args.showBrowser);
        const r = await tagVehicles(args, event.sender);
        console.log('sending tag-vehicles results to browser', r);
        event.sender.send('tag-results', r);
      }
      break;

    case 'release-vehicles':
      {
        console.log('release-vehicles', args);
        await browserInit(args.credentials, !args.showBrowser);
        const r = await releaseVehicles(args, event.sender);
        console.log('sending release-vehicles results to browser', r);
        event.sender.send('release-vehicles-results', r);
      }
      break;

    case 'permit-details':
      {
        console.log('permit-details', args);
        await browserInit(args.credentials, !args.showBrowser);
        const r = await permitDetails(args, event.sender);
        console.log('sending permit-details results to browser', r);
        event.sender.send('permit-details-results', r);
      }
      break;

    case 'permits-details':
      {
        console.log('permits details', args);

        if (args.refresh) {
          for (let permit of args.permits) {
            await browserInit(permit.credentials, !args.showBrowser);
            await permitDetails(permit, event.sender);
          }
          return event.sender.send('permits-details-results');
        }

        await browserInit(args.credentials, false);
        const r = await permitsDetails(args, event.sender);
        console.log('sending permits-details results to browser', r);
        event.sender.send('permits-details-results', r);
      }
      break;
  }

  cb(null);
  busyFlag.isBusy = false;
}

function createWindow() {
  // Create the browser window.
  let { width, height } = getMainWindowSize();
  mainWindow = new BrowserWindow({
    vibrancy: 'sidebar',
    transparent: isMac,
    backgroundColor: '#80FFFFFF',
    width,
    height,
    webPreferences: {
      nodeIntegration: true
    },
    frame: isLinux,
    resizable: true
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          click() {
            app.quit();
          }
        },
        {
          label: 'Toggle Developer Tools',
          role: 'toggleDevTools'
        }
      ]
    },
    {
      label: 'About',
      submenu: [{ label: `v${app.getVersion()}` }]
    }
  ]);
  Menu.setApplicationMenu(menu);

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    winURL = process.env.WEBPACK_DEV_SERVER_URL;
    mainWindow.loadURL(winURL);
    // to share with renderer process
    global.WEBPACK_DEV_SERVER_URL = process.env.WEBPACK_DEV_SERVER_URL;
    if (!process.env.IS_TEST) mainWindow.webContents.openDevTools();
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    winURL = 'app://./index.html';
    mainWindow.loadURL(winURL);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow(tab = 'General') {
  let settingsWindow = new BrowserWindow({
    parent: mainWindow,
    frame: isLinux,
    width: 460,
    height: 577,
    backgroundColor: theme.backgroundColor.gray['200'],
    webPreferences: {
      nodeIntegration: true
    },
    resizable: false
  });

  settingsWindow.loadURL(`${winURL}#/settings/${tab}`);
}

ipcMain.on('check-for-updates', () => {
  if (!isDevelopment && !checkedForUpdate) {
    autoUpdater.checkForUpdatesAndNotify();
    checkedForUpdate = true;
  }
});

ipcMain.on('open-browser', async (event, args) => {
  console.log('open browser called');
  await disconnect();
  await browserInit(args.credentials, !args.showBrowser, true);
});

ipcMain.on('close-browser', async () => {
  console.log('close browser called');
  await disconnect();
});

ipcMain.on('open-settings-window', (event, tab) => {
  createSettingsWindow(tab);
});

ipcMain.on('reload-main-window', () => {
  mainWindow.reload();
});

ipcMain.on('auto-tagging', (event, args) => {
  newPermits(args, event.sender);
});

ipcMain.on('refresh-permits', (event, args) => {
  refreshPermits(args, event.sender);
});

//openBrowser(true);

function messageQueueCallback(err, result) {}

ipcMain.on('permit-report', async (event, args) => {
  messageQueue.push(
    {
      type: 'permit-report',
      event,
      args
    },
    messageQueueCallback
  );
});

// ipcMain.on('truck-passes', async (event, args) => {
//   const r = await tpno(args);
//   console.log('sending results to browser', r);
//   event.sender.send('tp-results', r);
// });

ipcMain.on('tag-vehicles', async (event, args) => {
  messageQueue.push(
    {
      type: 'tag-vehicles',
      event,
      args
    },
    messageQueueCallback
  );
});

ipcMain.on('release-vehicles', async (event, args) => {
  messageQueue.push(
    {
      type: 'release-vehicles',
      event,
      args
    },
    messageQueueCallback
  );
});

ipcMain.on('permit-details', async (event, args) => {
  messageQueue.push(
    {
      type: 'permit-details',
      event,
      args
    },
    messageQueueCallback
  );
});

ipcMain.on('permits-details', async (event, args) => {
  messageQueue.push(
    {
      type: 'permits-details',
      event,
      args
    },
    messageQueueCallback
  );
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    // Devtools extensions are broken in Electron 6.0.0 and greater
    // See https://github.com/nklayman/vue-cli-plugin-electron-builder/issues/378 for more info
    // Electron will not launch with Devtools extensions installed on Windows 10 with dark mode
    // If you are not using Windows 10 dark mode, you may uncomment these lines
    // In addition, if the linked issue is closed, you can upgrade electron and uncomment these lines
    try {
      await installVueDevtools();
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString());
    }
  }
  createWindow();
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', data => {
      if (data === 'graceful-exit') {
        app.quit();
      }
    });
  } else {
    process.on('SIGTERM', () => {
      app.quit();
    });
  }
}
