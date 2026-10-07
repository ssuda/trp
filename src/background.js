'use strict';

import { app, protocol, BrowserWindow, ipcMain, Menu } from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  createProtocol
  //installVueDevtools
} from 'vue-cli-plugin-electron-builder/lib';
import theme from '@/theme';
import { getMainWindowSize } from './screenSize';

import {
  tagVehicles,
  getPermit,
  twoMonthPermits,
  permitTrips,
  newPermits,
  refreshPermits,
  releaseVehicles,
  initializeBrowser,
  busyFlag,
  companyName,
  disconnect,
  setTaggingBrowserVisibility,
  startTaggingPool,
  shutdown
} from '../api';

import gemini from '../api/gemini';

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
const messageQueue = fastq(processMessage, 2);

async function handleMessage(message) {
  const { event, args, type } = message;

  let cancelPromiseResolve;

  const cancelPromise = new Promise(
    (resolve, reject) => (cancelPromiseResolve = resolve)
  );

  function disconnectHandler() {
    cancelPromiseResolve();
  }

  switch (type) {
    case 'i3ms-company':
      {
        console.log('i3ms-company is called');
        const r = await initializeBrowser(
          null,
          true,
          false,
          disconnectHandler,
          true
        );

        if (r) {
          console.log('sending company name to browser', r);
          event.sender.send('i3ms-company-name', r);
        }
      }
      break;

    case 'permit-report':
      {
        console.log('permit-report', args.startDate, args.endDate);
        await initializeBrowser(
          args.credentials,
          !args.showBrowser,
          false,
          disconnectHandler
        );
        const r = await Promise.race([
          cancelPromise,
          permitTrips(args, event.sender)
        ]);
        if (r) {
          console.log('sending permit-report results to browser', r.trips);
          event.sender.send('permit-report-results', r);
        }
      }
      break;

    case 'tag-vehicles':
      {
        console.log('tag-vehicles', args);
        // Awaited directly: a disconnect mid-run must not orphan this job.
        // tagVehicles recovers its own tabs and every step is timeout-bounded,
        // so the queue slot is released only when tagging has really finished.
        const r = await tagVehicles(args, event.sender);
        console.log('sending tag-vehicles results to browser', r || {});
        event.sender.send('tag-results', r || {});
      }
      break;

    case 'release-vehicles':
      {
        console.log('release-vehicles', args);
        await initializeBrowser(
          args.credentials,
          false,
          false,
          disconnectHandler
        );
        const r = await Promise.race([
          cancelPromise,
          releaseVehicles(args, event.sender)
        ]);
        if (r) {
          console.log('sending release-vehicles results to browser', r);
          event.sender.send('release-vehicles-results', r);
        }
      }
      break;

    case 'permit-details':
      {
        console.log('permit-details', args);
        await initializeBrowser(
          args.credentials,
          !args.showBrowser,
          false,
          disconnectHandler
        );
        const r = await Promise.race([
          cancelPromise,
          getPermit(args, event.sender)
        ]);

        if (r) {
          console.log('sending permit-details results to browser', r);
          event.sender.send('permit-details-results', r);
        }
      }
      break;

    case 'permits-details':
      {
        console.log('permits details', args);

        if (args.refresh) {
          for (let permit of args.permits) {
            await initializeBrowser(
              permit.credentials,
              !args.showBrowser,
              false,
              disconnectHandler
            );
            await getPermit(permit, event.sender);
          }
          return event.sender.send('permits-details-results');
        }

        await initializeBrowser(
          args.credentials,
          !args.showBrowser,
          false,
          disconnectHandler
        );
        const r = await Promise.race([
          cancelPromise,
          twoMonthPermits(args, event.sender)
        ]);
        if (r) {
          console.log('sending permits-details results to browser', r);
          event.sender.send('permits-details-results', r);
        }
      }
      break;
  }
}

async function processMessage(message, cb) {
  const { event, type } = message;

  // A rejected task that skipped cb() would leak a fastq slot (two leaks
  // wedge every queued i3ms operation) and leave busyFlag set, silently
  // stopping the permit refresher. Every outcome lands in the finally.
  busyFlag.isBusy = true;
  try {
    await handleMessage(message);
  } catch (ex) {
    console.error('i3ms operation failed:', type, ex.message);
    if (event && event.sender && !event.sender.isDestroyed()) {
      if (type === 'tag-vehicles') {
        // Always release the renderer's tagging lock, even for an unexpected
        // main-process failure outside the normal per-truck recovery paths.
        event.sender.send('tag-results', {});
      }
      event.sender.send('i3ms-operation-failed', {
        type,
        message: ex.message
      });
    }
  } finally {
    cb(null);
    busyFlag.isBusy = false;
  }
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

// ipcMain.on('check-for-updates', () => {
//   if (!isDevelopment && !checkedForUpdate) {
//     autoUpdater.checkForUpdatesAndNotify();
//     checkedForUpdate = true;
//   }
// });

ipcMain.on('open-browser', async (event, args) => {
  console.log('open browser called');
  await disconnect();
  const r = await initializeBrowser(
    args.credentials,
    !args.showBrowser,
    true,
    null,
    args.returnCompanyName
  );

  if (args.returnCompanyName && r) {
    event.sender.send('i3ms-company-name', r);
  }
});

ipcMain.on('open-tabs', async (event, args) => {
  console.log('open-tabs (warming tagging pool)', args && args.numBrowsers);
  // startTaggingPool is idempotent: ready tabs with matching credentials and
  // headless mode are reused, missing ones are opened, so this is safe to
  // call on every login as well as after the pool died.
  try {
    await startTaggingPool(args || {});
  } catch (ex) {
    console.error('Unable to start tagging pool:', ex.message);
  }
});

ipcMain.on('close-browser', async () => {
  console.log('close browser called');
  await disconnect();
});

ipcMain.on('open-settings-window', (event, tab) => {
  createSettingsWindow(tab);
});

ipcMain.on('reload-main-window', async () => {
  await disconnect();
  mainWindow.reload();
});

ipcMain.on('auto-tagging', (event, args) => {
  console.log('Received auto tagging from renderer');
  newPermits(args.credentials, args.showBrowser, event.sender).catch(ex => {
    console.error('Unable to start auto tagging monitor:', ex);
    if (!event.sender.isDestroyed()) {
      event.sender.send('i3ms-operation-failed', {
        type: 'auto-tagging',
        message: ex.message
      });
    }
  });
});

ipcMain.on('show-browser', async () => {
  console.log('showing browsers');
  await setTaggingBrowserVisibility(true);
});

ipcMain.on('hide-browser', async () => {
  console.log('hiding browsers');
  await setTaggingBrowserVisibility(false);
});

ipcMain.on('refresh-permits', (event, args) => {
  refreshPermits(args, event.sender);
});

ipcMain.on('relaunch-app', (event, args) => {
  app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) });
  app.exit(0);
});

//openBrowser(true);

function messageQueueCallback() {}

ipcMain.on('i3ms-company', async (event, args) => {
  messageQueue.push(
    {
      type: 'i3ms-company',
      event,
      args
    },
    messageQueueCallback
  );
});

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

ipcMain.on('trucks-ocr', async (event, args) => {
  console.log('trucks-ocr background', args);
  const r = await gemini(args);
  if (r) {
    console.log('sending ocr results to browser', r);
    event.sender.send('trucks-ocr-results', r);
  }
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Close every puppeteer-controlled Chromium before quitting so no chrome
// child processes are orphaned. First quit request runs shutdown, defers the
// actual quit; the second passes straight through.
let shuttingDown = false;
app.on('before-quit', event => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log('Closing i3ms browsers before quit...');
  event.preventDefault();
  const hardExitTimer = setTimeout(() => app.exit(0), 20000);
  if (hardExitTimer.unref) {
    hardExitTimer.unref();
  }
  shutdown()
    .catch(ex => console.error('Shutdown failed:', ex.message))
    .finally(() => {
      clearTimeout(hardExitTimer);
      app.quit();
    });
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
      //await installVueDevtools();
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
