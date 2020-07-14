import frappe from 'frappejs';
import fs from 'fs';
import { _ } from 'frappejs/utils';
import migrate from './migrate';
import { remote, shell, ipcRenderer } from 'electron';
import SQLite from 'frappejs/backends/sqlite';
import Database from '@/database';

import postStart from '../server/postStart';
import getSingle from '../server/getSingle';

import router from '@/router';
import Avatar from '@/components/Avatar';
import config from '@/config';
import Vue from 'vue';
import FileSaver from 'file-saver';
import path from 'path';

import { firebaseAuth } from '@/firebase';

export function createNewDatabase() {
  return new Promise(resolve => {
    remote.dialog.showSaveDialog(
      remote.getCurrentWindow(),
      {
        title: _('Select folder'),
        defaultPath: 'spinbi-trp.db'
      },
      filePath => {
        if (filePath) {
          if (!filePath.endsWith('.db')) {
            filePath = filePath + '.db';
          }
          if (fs.existsSync(filePath)) {
            showMessageDialog({
              // prettier-ignore
              message: _('A file exists with the same name and it will be overwritten. Are you sure you want to continue?'),
              buttons: [
                {
                  label: _('Overwrite'),
                  action() {
                    fs.unlinkSync(filePath);
                    resolve(filePath);
                  }
                },
                { label: _('Cancel'), action() {} }
              ]
            });
          } else {
            resolve(filePath);
          }
        }
      }
    );
  });
}

export function loadExistingDatabase() {
  return new Promise(resolve => {
    remote.dialog.showOpenDialog(
      remote.getCurrentWindow(),
      {
        title: _('Select file'),
        properties: ['openFile'],
        filters: [{ name: 'SQLite DB File', extensions: ['db'] }]
      },
      files => {
        if (files && files[0]) {
          resolve(files[0]);
        }
      }
    );
  });
}

export async function onlyConnectToRemoteDatabase() {
  frappe.login('Administrator');

  const userProfile = firebaseAuth.currentUser;

  frappe.db = new Database({
    connection: userProfile.displayName
  });

  await frappe.db.connect();
  await getSingle();
}

export async function connectToRemoteDatabase() {
  frappe.login('Administrator');

  const userProfile = firebaseAuth.currentUser;

  frappe.db = new Database({
    connection: userProfile.displayName
  });

  await frappe.db.connect();

  await migrate();
  await postStart();
}

const trucksRegexp = /[A-Z]{2}[0-9]{1,2}(?:[A-Z])?(?:[A-Z]*)?[0-9]{4}/gi;

export function extractTrucks(text) {
  return [...new Set(Array.from(text.matchAll(trucksRegexp), m => m[0]))];
}

export async function connectToLocalDatabase(filepath) {
  console.log('called local db connect', filepath);
  frappe.login('Administrator');

  let files = config.get('files') || [];
  console.log('files', files);
  let file = files.find(file => file.filePath === filepath);
  if (file && file.companyName && !filepath.includes(file.companyName)) {
    //move file to company name
    file.filePath = dbPath(file.companyName);
    fs.renameSync(filepath, file.filePath);
    filepath = file.filePath;
    config.set('files', files);
  }

  console.log('before local db connect', filepath);

  frappe.db = new SQLite({
    dbPath: filepath
  });

  frappe.db.typeMap.LongText = 'text';
  frappe.db.typeMap.Password = 'text';

  frappe._turnOffSync = true;
  await frappe.db.connect();
  await migrate();
  await postStart();
  frappe._turnOffSync = false;

  console.log('after local db connect', filepath);

  if (filepath === ':memory:') {
    return;
  }

  // set file info in config
  if (!file) {
    files = [
      {
        companyName: frappe.AccountingSettings.companyName,
        filePath: filepath
      },
      ...files
    ];
    config.set('files', files);
  } else if (!file.companyName) {
    file.companyName = frappe.AccountingSettings.companyName;
    config.set('files', files);
  }

  // set last selected file
  config.set('lastSelectedFilePath', filepath);
  console.log('lastSelectedFilePath', config.get('lastSelectedFilePath', null));
}

export function showMessageDialog({
  message,
  description,
  buttons = [{ label: 'Ok' }]
}) {
  return new Promise((resolve, reject) => {
    Vue.modal.show('dialog', {
      title: message,
      text: description,
      buttons: buttons.map(a => ({
        title: a.label,
        handler: () => {
          a.action && a.action();
          Vue.modal.hide('dialog');
          resolve();
        }
      }))
    });
  });
}

export function isNullOrUndefined(val) {
  return val == null || typeof val == 'undefined';
}

export function dbPath(companyName) {
  return path.join(remote.getGlobal('userData'), `${companyName}.db`);
}

export async function exportData(title, columns, rows = [], titleOnly = false) {
  let csvDataArray = [columns, ...rows];
  console.log(csvDataArray);
  csvDataArray = csvDataArray.map(r => r.join(','));
  let csvData = csvDataArray.join('\n');
  let d = new Date();
  let fileName = titleOnly
    ? `${title}.csv`
    : [
        title.replace(/\s/g, '-'),
        [d.getDate(), d.getMonth(), d.getFullYear()].join('-'),
        `${d.getTime()}.csv`
      ].join('_');
  var blob = new Blob([csvData], { type: 'text/plain;charset=utf-8' });
  await FileSaver.saveAs(blob, fileName);
}

export function deleteDocWithPrompt(doc) {
  return new Promise(resolve => {
    showMessageDialog({
      message: _('Are you sure you want to delete {0} "{1}"?', [
        doc.doctype,
        doc.name
      ]),
      description: _('This action is permanent'),
      buttons: [
        {
          label: _('Delete'),
          action: () => {
            doc
              .delete()
              .then(() => resolve(true))
              .catch(e => {
                handleErrorWithDialog(e, doc);
              });
          }
        },
        {
          label: _('Cancel'),
          action() {
            resolve(false);
          }
        }
      ]
    });
  });
}

export function partyWithAvatar(party) {
  return {
    data() {
      return {
        imageURL: null,
        label: null
      };
    },
    components: {
      Avatar
    },
    async mounted() {
      this.imageURL = await frappe.db.getValue('Party', party, 'image');
      this.label = party;
    },
    template: `
      <div class="flex items-center" v-if="label">
        <Avatar class="flex-shrink-0" :imageURL="imageURL" :label="label" size="sm" />
        <span class="ml-2 truncate">{{ label }}</span>
      </div>
    `
  };
}

export function openQuickEdit({ doctype, name, hideFields, defaults = {} }) {
  let currentRoute = router.currentRoute;
  let query = currentRoute.query;
  let method = 'push';
  if (query.edit && query.doctype === doctype) {
    // replace the current route if we are
    // editing another document of the same doctype
    method = 'replace';
  }

  console.log('method', method, hideFields);
  router[method]({
    query: {
      edit: 1,
      doctype,
      name,
      hideFields,
      values: defaults,
      lastRoute: currentRoute
    }
  });
}

export function getErrorMessage(e, doc) {
  let errorMessage = e.message || _('An error occurred');

  if (e.type === frappe.errors.LinkValidationError) {
    errorMessage = _('{0} {1} is linked with existing records.', [
      doc.doctype,
      doc.name
    ]);
  } else if (
    e.type === frappe.errors.DuplicateEntryError ||
    /duplicate key/i.test(e.message)
  ) {
    errorMessage = _('{0} {1} already exists.', [doc.doctype, doc.name]);
  }
  return errorMessage;
}

export function handleErrorWithDialog(e, doc) {
  let errorMessage = getErrorMessage(e, doc);
  //showMessageDialog({ message: errorMessage });
  Vue.notify({
    type: 'error',
    group: 'trp',
    title: errorMessage
  });
  throw e;
}

export function makePDF(html, destination) {
  const { BrowserWindow } = remote;

  let printWindow = new BrowserWindow({
    width: 595,
    height: 842,
    show: false,
    webPreferences: {
      nodeIntegration: true
    }
  });

  let webpackDevServerURL = remote.getGlobal('WEBPACK_DEV_SERVER_URL');
  if (webpackDevServerURL) {
    // Load the url of the dev server if in development mode
    printWindow.loadURL(webpackDevServerURL + 'print');
  } else {
    // Load the index.html when not in development
    printWindow.loadURL(`app://./print.html`);
  }

  printWindow.on('closed', () => {
    printWindow = null;
  });

  const code = `
    document.body.innerHTML = \`${html}\`;
  `;

  printWindow.webContents.executeJavaScript(code);

  return new Promise(resolve => {
    printWindow.webContents.on('did-finish-load', () => {
      printWindow.webContents.printToPDF(
        {
          marginsType: 1, // no margin
          pageSize: 'A4',
          printBackground: true
        },
        (error, data) => {
          if (error) throw error;
          printWindow.close();
          fs.writeFile(destination, data, error => {
            if (error) throw error;
            resolve(shell.openItem(destination));
          });
        }
      );
    });
  });
}

export function getActionsForList(listConfig) {
  if (!listConfig) return [];

  let actions = (listConfig.actions || [])
    .filter(d => (d.condition ? d.condition() : true))
    .map(d => {
      return {
        label: d.label,
        component: d.component,
        action: d.action.bind(this, router)
      };
    });

  return actions;
}

export function getActionsForDocument(doc) {
  if (!doc) return [];

  let deleteAction = {
    component: {
      template: `<span class="text-red-700">{{ _('Delete') }}</span>`
    },
    condition: doc => !doc.isNew() && !doc.submitted && !doc.meta.isSingle,
    action: () =>
      deleteDocWithPrompt(doc).then(res => {
        if (res) {
          router.push(`/list/${doc.doctype}`);
        }
      })
  };

  let actions = [...(doc.meta.actions || []), deleteAction]
    .filter(d => (d.condition ? d.condition(doc) : true))
    .map(d => {
      return {
        label: d.label,
        component: d.component,
        action: d.action.bind(this, doc, router)
      };
    });

  return actions;
}

export function normalizeCompanyName(name) {
  return name
    .trim()
    .replace(/a unit of.*$/i, '')
    .replace(/&amp;/i, '&')
    .replace(/&amp;/i, '&')
    .replace(/ & /i, ' AND ')
    .replace(/^m\/?s +/i, '')
    .replace(/ (\(?Pr?i?v?a?t?e?\)?\.? ?)?(Ltd\.?|Limited)$/i, '')
    .replace(/ LLP$/i, '')
    .trim()
    .toUpperCase();
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function openSettings(tab = 'General') {
  ipcRenderer.send('open-settings-window', tab);
}

export function splitToChunks(array, parts) {
  let result = [];
  let [...arr] = array;
  for (let i = parts; i > 0; i--) {
    result.push(arr.splice(0, Math.ceil(arr.length / i)));
  }
  return result;
}

export async function syncDoc(data) {
  const modelDef = frappe.models[data.doctype];

  if (modelDef.isSingle) {
    const finalData = {};
    const fields = modelDef.fields.map(f => f.fieldname);

    for (let field in data) {
      if (fields.includes(field)) {
        finalData[field] = data[field];
      }
    }

    console.log('Syncing single', data.doctype, data, finalData);
    return frappe.db.updateSingle(data.doctype, finalData);
  }

  console.log('Syncing record', data.doctype);
  return frappe.syncDoc(data);
}

export async function getDoc(data) {
  let doc;
  if (await frappe.db.exists(data.doctype, data.name)) {
    doc = await frappe.getDoc(data.doctype, data.name);
    Object.assign(doc, data);
    await doc.applyFormula();
  } else {
    doc = frappe.newDoc(data);
    await doc.applyFormula();
  }

  return doc;
}
