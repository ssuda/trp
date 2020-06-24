// frappejs imports
import frappe from 'frappejs';
import common from 'frappejs/common';
import coreModels from 'frappejs/models';
import FeatherIcon from 'frappejs/ui/components/FeatherIcon';
import outsideClickDirective from 'frappejs/ui/plugins/outsideClickDirective';
import models from '../models';
import { ipcRenderer } from 'electron';
//import { syncDoc } from '@/utils';

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

  async function savePermit(permit, args) {
    console.log('Got result from i3ms', permit);

    let tagged = permit.tagged || {};

    let oldTagged = args.tagged
      ? typeof args.tagged === 'string'
        ? JSON.parse(args.tagged)
        : args.tagged
      : null;

    if (!oldTagged) {
      try {
        const currentDoc = frappe.getDoc('Permit', permit.name);
        oldTagged = currentDoc.tagged ? JSON.parse(currentDoc.tagged) : {};
      } catch (ex) {
        oldTagged = {};
      }
    }

    oldTagged = Object.keys(oldTagged).reduce((p, v) => {
      if (oldTagged[v]) {
        p[v] = oldTagged[v];
      }
      return p;
    }, {});

    tagged = Object.assign(oldTagged || {}, tagged);
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

        await frappe.syncDoc({
          doctype: 'Trip',
          name: trip.tp_number,
          permit: permit.name,
          truck: trip.truck_number,
          tpNumber: trip.tp_number,
          tpUrl: trip.tp_url,
          loadQty: trip.load_carrying,
          startDate: trip.tp_date
        });
      }

      const doc = await frappe.getDoc('Permit', permit.name);
      const changed = await doc.applyFormula();
      console.log('before permit update', doc, changed);
      await doc.update();
    }
  }

  frappe.events.on('reload-main-window', () => {
    ipcRenderer.send('reload-main-window');
  });

  frappe.events.on('relaunch-app', () => {
    ipcRenderer.send('relaunch-app');
  });

  frappe.events.on('open-browser', args => {
    console.log('open browser called');
    ipcRenderer.send('open-browser', args);
  });

  ipcRenderer.on('permit-details-results', (e, permit) => {
    if (permit) {
      savePermit(permit, {});
    }
    frappe.events.trigger('permit-details-results', permit);
  });

  ipcRenderer.on('permits-details-results', e => {
    frappe.events.trigger('permits-details-results', e);
  });

  ipcRenderer.on('failed', (e, results) => {
    console.log('received failed from main process', results);
    frappe.events.trigger('failed', results);
  });

  ipcRenderer.on('total', (event, results) => {
    console.log('received total from main process', results);
    frappe.events.trigger('total', results);
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
      ipcRenderer.removeAllListeners('tag-truck-result');

      let tagged = permit.tagged ? JSON.parse(permit.tagged) : {};
      let finallyTagged = Object.assign(tagged, response);
      permit.tagged = JSON.stringify(finallyTagged);

      if (!permit.name) {
        savePermit(response, permit);
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

    ipcRenderer.on('tag-truck-result', async function(e, response) {
      if (!permit.name) {
        permit = await frappe.db.knex
          .select('*')
          .from('Permit')
          .where('taggingUrl', permit.taggingUrl)
          .first();
      }

      console.log('received failed from main process', response);

      let tagged = permit.tagged ? JSON.parse(permit.tagged) : {};
      let finallyTagged = Object.assign(tagged, response);
      permit.tagged = JSON.stringify(finallyTagged);

      batchSize++;
      if (batchSize >= 10) {
        await frappe.currentUser.remote.ref.update({
          tagged: FieldValue.increment(batchSize)
        });
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

  frappe.events.on('auto-tagging', async () => {
    console.log('Setting up auto tagging');
    //Fetch autoTagging
    let docs = await frappe.db.getAll({
      doctype: 'AutoTagging'
    });

    if (docs.length) {
      const credentials = {
        username: frappe.AccountingSettings.i3msUsername,
        password: frappe.AccountingSettings.i3msPassword
      };

      ipcRenderer.send('auto-tagging', credentials);

      ipcRenderer.on('new-permits', async (e, permits) => {
        console.log('Received new permits', permits);

        for (let i = 0; i < permits.length; ++i) {
          savePermit(permits[i], {});
        }

        //find docs;
        let autoTags = docs.filter(doc => {
          let permit = permits.find(
            p =>
              p.source == doc.source.toUpperCase() &&
              (!doc.transportedFrom ||
                doc.transportedFrom.toUpperCase() == p.transportedFrom)
          );

          if (permit) {
            doc.permit = permit;
            return true;
          }

          return false;
        });

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

          if (process.env.NODE_ENV !== 'development') {
            for (let i = 0; i < autoTags.length; ++i) {
              await tagPermit(autoTags[i]);
            }
          }
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
