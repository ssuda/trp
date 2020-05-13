// frappejs imports
import frappe from 'frappejs';
import common from 'frappejs/common';
import coreModels from 'frappejs/models';
import FeatherIcon from 'frappejs/ui/components/FeatherIcon';
import outsideClickDirective from 'frappejs/ui/plugins/outsideClickDirective';
import models from '../models';
import { ipcRenderer } from 'electron';
import { syncDoc } from '@/utils';

// vue imports
import Vue from 'vue';
import PortalVue from 'portal-vue';
import App from './App';
import router from './router';

(async () => {
  frappe.isServer = true;
  frappe.isElectron = true;
  frappe.init();
  frappe.registerLibs(common);
  frappe.registerModels(coreModels);
  frappe.registerModels(models);
  frappe.fetch = window.fetch.bind();

  frappe.events.on('reload-main-window', () => {
    ipcRenderer.send('reload-main-window');
  });

  frappe.events.on('permits-details', args => {
    ipcRenderer.send('permits-details', args);
    ipcRenderer.removeAllListeners();
    ipcRenderer.on('permit-details-results', async (e, permit) => {
      console.log('Got result from i3ms', permit)
      //save permit
      const doc = await syncDoc({
        doctype: 'Permit',
        name: permit.permit_number,
        account: args.credentials.name,
        taggingUrl: permit.tag_url,
        vehicleDetails: permit.vehicle_details,
        startDate: permit.start_date,
        endDate: permit.end_date,
        quantity: permit.quantity,
        tagged: JSON.stringify({
          success: permit.tagged
        })
      })

      // insertOrUpdate Trucks
      for (let truck of permit.trips.map(t => t.truck_number)) {
        await frappe.syncDoc({
          doctype: 'Truck',
          name: truck
        })
      }

      for (let trip of permit.trips) {
        await frappe.syncDoc({
          doctype: 'Trip',
          permit: doc.name,
          truck: trip.truck_number,
          tpNumber: trip.tp_number,
          tpUrl: trip.tp_url,
          loadQty: trip.load_carrying,
          startDate: trip.tp_date
        })
      }
    })
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
