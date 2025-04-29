// frappejs imports
import frappe from 'frappejs';
import common from 'frappejs/common';
import coreModels from 'frappejs/models';
import FeatherIcon from 'frappejs/ui/components/FeatherIcon';
import outsideClickDirective from 'frappejs/ui/plugins/outsideClickDirective';
import models from '../models';
import { ipcMain, ipcRenderer } from 'electron';
import { firestore } from '@/firebase';
import moment from 'moment';

// vue imports
import Vue from 'vue';
import PortalVue from 'portal-vue';
import Notifications from 'vue-notification';
import VModal from 'vue-js-modal';

import App from './App';
import router from './router';

import _ from 'lodash';

import BaseDocument from '@/basedocument';
import Document from 'frappejs/model/document';
import { FieldValue } from '@/firebase';
import { normalizeCompanyName } from './utils';
import { DateTime } from 'luxon';
import tessaract from '../api/tessaract';

(async () => {
  frappe.isServer = true;
  frappe.isElectron = true;
  Document.prototype.compareWithCurrentDoc =
    BaseDocument.prototype.compareWithCurrentDoc;
  Document.prototype.trigger = BaseDocument.prototype.trigger;
  frappe.init();
  frappe.registerLibs(common);
  frappe.registerModels(coreModels);
  frappe.registerModels(models);
  frappe.fetch = window.fetch.bind();

  // if (process.env.NODE_ENV !== 'development') {
  //   console.log = function() {};
  // }

  async function savePermit(permit) {
    console.log('Got result from i3ms', permit);
    let isNew = true;

    if (!permit) {
      return;
    }

    let tagged = permit.tagged || {};
    let oldTagged = {};

    try {
      const currentDoc = await frappe.getDoc('Permit', permit.name);
      oldTagged = currentDoc.tagged ? JSON.parse(currentDoc.tagged) : {};
      isNew = false;
    } catch (ex) {
      console.log('Permit not found', ex);
    }

    tagged = Object.assign(oldTagged, tagged);

    let trips = permit.trips || [];
    //save permit
    await frappe.syncDoc({
      doctype: 'Permit',
      ..._.omit(permit, ['tagged', 'trips']),
      delivered: trips.reduce((p, t) => p + +t.load_carrying, 0),
      numTrips: trips.length,
      tagged: JSON.stringify(tagged)
    });

    if (permit.trips) {
      // insertOrUpdate Trucks
      for (let truck of permit.trips.map(t => t.truck_number)) {
        console.log('inserting truck', truck);
        await frappe.syncDoc({
          doctype: 'Truck',
          name: truck
        });
      }

      for (let trip of permit.trips) {
        console.log('inserting trip', {
          doctype: 'Trip',
          name: trip.tp_number,
          permit: permit.name,
          truck: trip.truck_number,
          tpNumber: trip.tp_number,
          tpUrl: trip.tp_url,
          loadQty: trip.load_carrying,
          startDate: trip.tp_date
        });

        let dt = DateTime.fromFormat(trip.tp_date, 'M/d/yyyy h:m:s a');

        if (!dt.isValid) {
          dt = DateTime.fromFormat(trip.tp_date, 'd MMM yyyy');
        }

        dt = dt.toJSDate();

        await frappe.syncDoc({
          doctype: 'Trip',
          name: trip.tp_number,
          permit: permit.name,
          truck: trip.truck_number,
          tpNumber: trip.tp_number,
          tpUrl: trip.tp_url,
          loadQty: trip.load_carrying,
          startDate: dt
        });
      }

      const doc = await frappe.getDoc('Permit', permit.name);
      const changed = await doc.applyFormula();
      console.log('before permit update', doc, changed);
      await doc.update();
    }

    console.log('returning from savepermit', isNew);
    return isNew;
  }

  frappe.events.on('reload-main-window', () => {
    ipcRenderer.send('reload-main-window');
  });

  frappe.events.on('relaunch-app', () => {
    ipcRenderer.send('relaunch-app');
  });

  frappe.events.on('trucks-ocr', data => {
    console.log('Sending trucks ocr to main process', data);
    ipcRenderer.send('trucks-ocr', {
      ...data,
      ...frappe.globalConfig
    });
  });

  ipcRenderer.on('trucks-ocr-results', (e, results) => {
    frappe.events.trigger('trucks-ocr-results', results);
  });

  ipcRenderer.on('i3ms-company-name', (e, name) => {
    const i3msCompanyName = normalizeCompanyName(name);

    frappe.AccountingSettings.update({
      i3msCompanyName
    });

    frappe.events.trigger('i3ms-company-name', i3msCompanyName);
  });

  frappe.events.on('open-browser', args => {
    console.log('open browser called');
    ipcRenderer.send('open-browser', args);
  });

  frappe.events.on('open-tabs', args => {
    console.log('open tabs called', args.numBrowsers);
    ipcRenderer.send('open-tabs', args);
  });

  frappe.events.on('show-browser', args => {
    console.log('show browser called');
    ipcRenderer.send('show-browser', args);
  });

  frappe.events.on('hide-browser', args => {
    console.log('hide browser called');
    ipcRenderer.send('hide-browser', args);
  });

  frappe.events.on('i3ms-company', args => {
    console.log('i3ms-company called');
    ipcRenderer.send('i3ms-company', args);
  });

  ipcRenderer.on('failed', (e, results) => {
    console.log('received failed from main process', results);
    frappe.events.trigger('failed', results);
  });

  ipcRenderer.on('total', (event, results) => {
    console.log('received total from main process', results);
    frappe.events.trigger('total', results);
  });

  ipcRenderer.on('permit-details-results', (e, permit) => {
    savePermit(permit);
    frappe.events.trigger('permit-details-results', permit);
  });

  ipcRenderer.on('permits-details-results', e => {
    frappe.events.trigger('permits-details-results', e);
  });

  ipcRenderer.on('captcha', async (evt, payload) => {
    console.log('Received captcha image from background', payload);
    const resp = await tessaract(payload.image);
    evt.sender.send('captcha-response', { data: resp, id: payload.id });
  });

  ipcRenderer.on('sample', async (evt, data) => {
    console.log('Received sample data', data);
  });

  frappe.events.on('permit-details', args => {
    ipcRenderer.send('permit-details', args);
  });

  frappe.events.on('permits-details', args => {
    ipcRenderer.send('permits-details', args);
  });

  frappe.events.on('tag-vehicles', permit => {
    console.log('received tagvehicles', permit);
    ipcRenderer.send('tag-vehicles', permit);

    ipcRenderer.once('tag-results', function(e, response) {
      ipcRenderer.removeAllListeners('tag-result');

      let tagged = permit.tagged ? JSON.parse(permit.tagged) : {};
      let finallyTagged = Object.assign(tagged, response);
      permit.tagged = JSON.stringify(finallyTagged);

      if (!permit.name) {
        savePermit(response);
      } else {
        // End of the tagging
        frappe.syncDoc({
          doctype: 'Permit',
          name: permit.name,
          tagged: permit.tagged
        });
      }
      frappe.events.trigger('tag-results', response);
    });

    let batchSize = 0;

    ipcRenderer.on('tag-result', async function(e, response) {
      permit = permit || {};

      if (!permit.name) {
        permit = await frappe.getNewDoc('Permit');
        permit.set({
          name: response.name,
          taggingUrl: response.taggingUrl
        });
      }

      console.log('received tag-result from main process', response);

      let tagged = permit.tagged ? JSON.parse(permit.tagged) : {};
      let finallyTagged = Object.assign(tagged, response.truck);
      permit.tagged = JSON.stringify(finallyTagged);

      batchSize++;
      if (batchSize >= 10) {
        if (!frappe.currentUser.remote) {
          try {
            frappe.currentUser.remote = await firestore
              .collection('customers')
              .doc(frappe.AccountingSettings.gstin)
              .get();
          } catch (ex) {}
        }

        if (!frappe.currentUser.remote) {
          await frappe.currentUser.remote.ref.update({
            tagged: FieldValue.increment(batchSize)
          });
        }

        batchSize = 0;
        frappe.syncDoc({
          doctype: 'Permit',
          name: permit.name,
          tagged: permit.tagged,
          _turnOffSync: Object.keys(finallyTagged).length % 100
        });
      }
    });
  });

  frappe.events.on('release-vehicles', permit => {
    ipcRenderer.send('release-vehicles', permit);

    ipcRenderer.once('release-vehicles-results', function(e, response) {
      console.log(
        'Updating permit after release',
        Object.keys(response).length
      );
      // End of the release
      frappe.syncDoc({
        doctype: 'Permit',
        name: permit.name,
        tagged: JSON.stringify(response)
      });
      frappe.events.trigger('release-vehicles-results', response);
    });
  });

  frappe.events.on('check-for-updates', () => {
    let { autoUpdate } = frappe.AccountingSettings;
    if (autoUpdate == null || autoUpdate === 1) {
      ipcRenderer.send('check-for-updates');
    }
  });

  frappe.events.on('refresh-permits', args => {
    ipcRenderer.send('refresh-permits', args);
  });

  async function tagPermit(doc) {
    console.log('Auto Tagging new permit', doc.name);

    const credentials = {
      username: frappe.AccountingSettings.i3msUsername,
      password: frappe.AccountingSettings.i3msPassword
    };

    const truckList = await frappe.getDoc('TruckList', doc.truckList);

    console.log(truckList);
    let trucks = truckList.trucks.split('\n').filter(Boolean);

    let permit = doc.permit;

    let obj = {
      credentials,
      trucks,
      showBrowser: true,
      numBrowsers: doc.numBrowsers
    };

    obj = {
      ...obj,
      ...permit
    };

    if (trucks.length) {
      frappe.events.trigger('tag-vehicles', obj);
    }
  }

  frappe.events.on('auto-tagging', async docs => {
    console.log('Setting up auto tagging');
    //Fetch autoTagging
    docs = docs || [];

    let oldDocs = await frappe.db.getAll({
      doctype: 'AutoTagging'
    });

    docs = docs.concat(oldDocs);

    console.log('Setting up auto tagging number of docs', docs.length);

    if (docs.length) {
      const credentials = {
        username: frappe.AccountingSettings.i3msUsername,
        password: frappe.AccountingSettings.i3msPassword
      };

      ipcRenderer.send('auto-tagging', credentials);

      ipcRenderer.on('new-permits', async (e, permits) => {
        //filter out permits today(startDate), replace DateTime with moment
        const today = moment();

        permits = permits.filter(p => {
          const startDate = moment(p.startDate, 'YYYY-MM-DD');
          console.log(
            'startDAte',
            today,
            startDate,
            startDate.isSame(today, 'day')
          );
          return startDate.isSame(today, 'day');
        });

        if (frappe.isTagging) {
          console.log('Already Tagging');
          return;
        }

        console.log('Received new permits', permits);
        let newPermits = [];

        for (let i = 0; i < permits.length; ++i) {
          const isNew = await savePermit(permits[i]);
          if (isNew) {
            console.log('New permit saved', permits[i].name);
            newPermits.push(permits[i]);
          }
        }

        //find docs;
        let autoTags = docs.filter(doc => {
          let permit = newPermits.find(
            p =>
              p.source.toUpperCase() == doc.source.toUpperCase() &&
              (!doc.transportedFrom ||
                doc.transportedFrom.toUpperCase() ==
                  p.transportedFrom.toUpperCase())
          );

          if (permit) {
            doc.permit = permit;
            return true;
          }

          return false;
        });

        console.log('Matched new Permit with Auto Tagging', autoTags.length);

        //sort by priority and sort by permit number
        if (autoTags.length) {
          if (autoTags.length > 1) {
            autoTags = autoTags.sort((a, b) => {
              if (a.priority < b.priority) {
                return -1;
              }

              if (a.priority > b.priority) {
                return 1;
              }

              if (a.permit.name > b.permit.name) {
                return 1;
              }

              return -1;
            });
          }

          console.log('AutoTagging', autoTags);

          //if (process.env.NODE_ENV !== 'development') {
          const permit = autoTags[0].permit;

          try {
            const doc = frappe.getNewDoc('PermitAction');
            await doc.set({
              label: _('Tagging'),
              action: 'tagging',
              buttonText: _('Tagging'),
              permit: permit.name,
              truckList: autoTags[0].truckList,
              isCloudTagging: true
            });

            router.push({
              name: 'PermitAction',
              params: {
                name: doc.name
              }
            });
          } catch (ex) {
            console.error(ex);
          }

          // for (let i = 0; i < autoTags.length; ++i) {
          //   await tagPermit(autoTags[i]);
          // }
          //}
        }
      });
    }
  });

  window.frappe = frappe;

  Vue.config.productionTip = false;
  Vue.component('feather-icon', FeatherIcon);
  Vue.directive('on-outside-click', outsideClickDirective);
  Vue.use(PortalVue);
  Vue.use(Notifications);
  Vue.use(VModal, {
    dynamic: true,
    injectModalsContainer: true,
    dynamicDefaults: { clickToClose: false },
    dialog: true,
    clickToClose: false
  });
  Vue.mixin({
    computed: {
      frappe() {
        return frappe;
      },
      platform() {
        return {
          win32: 'Windows',
          darwin: 'Mac',
          linux: 'Linux'
        }[process.platform];
      }
    },
    methods: {
      _(...args) {
        return frappe._(...args);
      }
    }
  });

  Vue.config.errorHandler = (err, vm, info) => {
    console.error(err, vm, info);
  };

  /* eslint-disable no-new */
  new Vue({
    el: '#app',
    router,
    components: {
      App
    },
    template: '<App/>'
  });
})();
