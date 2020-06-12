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

import BaseDocument from '@/basedocument';
import Document from 'frappejs/model/document';

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

  async function savePermit(permit, args) {
    console.log('Got result from i3ms', permit);

    let tagged = permit.tagged;
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

    tagged = Object.assign(oldTagged || {}, tagged);

    //save permit
    await frappe.syncDoc({
      doctype: 'Permit',
      name: permit.permit_number,
      //account: args.credentials.username,
      taggingUrl: permit.tag_url,
      vehicleDetails: permit.vehicle_details,
      startDate: permit.start_date,
      endDate: permit.end_date,
      quantity: permit.quantity,
      delivered: permit.trips.reduce((p, t) => p + +t.load_carrying, 0),
      numTrips: permit.trips.length,
      tagged: JSON.stringify(tagged)
    });

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
        permit: permit.permit_number,
        truck: trip.truck_number,
        tpNumber: trip.tp_number,
        tpUrl: trip.tp_url,
        loadQty: trip.load_carrying,
        startDate: trip.tp_date
      });

      await frappe.syncDoc({
        doctype: 'Trip',
        name: trip.tp_number,
        permit: permit.permit_number,
        truck: trip.truck_number,
        tpNumber: trip.tp_number,
        tpUrl: trip.tp_url,
        loadQty: trip.load_carrying,
        startDate: trip.tp_date
      });
    }

    const doc = await frappe.getDoc('Permit', permit.permit_number);
    const changed = await doc.applyFormula();
    console.log('before permit update', doc, changed);
    await doc.update();
  }

  frappe.events.on('reload-main-window', () => {
    ipcRenderer.send('reload-main-window');
  });

  frappe.events.on('open-browser', args => {
    console.log('open browser called');
    ipcRenderer.send('open-browser', args);
  });

  frappe.events.on('permit-details', args => {
    ipcRenderer.send('permit-details', args);
    ipcRenderer.removeAllListeners();
    ipcRenderer.on('permit-details-results', (e, permit) => {
      savePermit(permit, args);
      frappe.events.trigger('permit-details-results', e);
    });
  });

  frappe.events.on('permits-details', args => {
    ipcRenderer.send('permits-details', args);
    ipcRenderer.removeAllListeners();
    ipcRenderer.on('permits-details-results', e => {
      frappe.events.trigger('permits-details-results', e);
    });

    ipcRenderer.on('permit-details-results', async (e, permit) => {
      savePermit(permit, args);
    });
  });

  frappe.events.on('tag-vehicles', permit => {
    ipcRenderer.send('tag-vehicles', permit);
    ipcRenderer.removeAllListeners('tag-results');

    ipcRenderer.on('tag-results', function(e, response) {

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

    ipcRenderer.removeAllListeners('tag-truck-result');

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
        batchSize = 0;
        frappe.syncDoc({
          doctype: 'Permit',
          name: permit.name,
          tagged: permit.tagged,
          _turnOffSync: Object.keys(finallyTagged).length % 100
        });
      }
    });

    ipcRenderer.removeAllListeners('failed');
    ipcRenderer.on('failed', (e, results) => {
      console.log('received failed from main process', results);
      frappe.events.trigger('failed', results);
    });

    ipcRenderer.removeAllListeners('total');
    ipcRenderer.on('total', (event, results) => {
      console.log('received total from main process', results);
      frappe.events.trigger('total', results);
    });
  });

  frappe.events.on('release-vehicles', permit => {
    ipcRenderer.send('release-vehicles', permit);
    ipcRenderer.removeAllListeners('release-vehicles-results');

    ipcRenderer.on('release-vehicles-results', function(e, response) {
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
