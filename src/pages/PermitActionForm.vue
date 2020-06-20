<template>
  <div class="flex flex-col" v-if="doc">
    <PageHeader>
      <BackLink slot="title" />
    </PageHeader>
    <div class="flex justify-center flex-1 mb-8 mt-2" v-if="meta">
      <div
        class="border rounded-lg shadow h-full flex flex-col justify-between"
        style="width: 600px"
      >
        <div>
          <div class="px-6 pt-6" v-if="doc.permit">
            <div class="flex text-sm text-gray-900 border-b pb-4">
              <div class="w-1/3">
                <div class="text-xl text-gray-700 font-semibold">
                  {{ doc.permit.name }}
                </div>
              </div>
            </div>
          </div>
          <div class="mt-8 px-6">
            <h1 class="text-2xl font-semibold">
              {{ doc.label }}
            </h1>
            <div class="flex justify-between mt-2">
              <div class="w-1/3">
                <FormControl
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('showBrowser')"
                  :value="doc.showBrowser"
                  :showLabel="true"
                  @change="value => doc.set('showBrowser', value)"
                />

                <FormControl
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('numBrowsers')"
                  :value="doc.numBrowsers"
                  :showLabel="true"
                  v-if="doc.action == 'tagging'"
                  @change="value => doc.set('numBrowsers', value)"
                />

                <FormControl
                  v-if="doc.action == 'tagging' && !doc.permit"
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('taggingUrl')"
                  :value="doc.taggingUrl"
                  @change="value => doc.set('taggingUrl', value)"
                />

                <FormControl
                  v-if="doc.action == 'tagging'"
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('truckList')"
                  :value="doc.truckList"
                  @change="value => doc.set('truckList', value)"
                />
                <FormControl
                  v-if="doc.action == 'release'"
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('trucks')"
                  :value="doc.trucks"
                  placeholder="Paste the trucks"
                  @change="value => doc.set('trucks', value)"
                />
              </div>
            </div>
          </div>
          <div class="flex justify-end px-8 mt-5 window-no-drag">
            <Button
              @click="onClick"
              type="primary"
              class="text-sm text-white"
              :disabled="loading"
            >
              {{ buttonText }}
            </Button>
          </div>

          <div
            class="flex text-sm px-8 mt-5 window-no-drag"
            v-if="doc.action === 'tagging'"
          >
            <p>Total: {{ total }}</p>
            <p class="ml-8">Success: {{ success }}</p>
            <p class="ml-8">Failed: {{ failed }}</p>
          </div>
          <div
            class="px-8 mt-5 font-medium text-green-600"
            v-if="doc.action === 'tagging'"
          >
            <p>{{ message }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
import frappe from 'frappejs';
const { DateTime } = require('luxon');
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import FormControl from '@/components/Controls/FormControl';
import BackLink from '@/components/BackLink';
import _ from 'lodash';
import {
  handleErrorWithDialog,
  showMessageDialog,
  extractTrucks
} from '@/utils';

import { refreshPermit } from '@/permit';

export default {
  name: 'PermitActionForm',
  props: ['name'],
  components: {
    PageHeader,
    Button,
    FormControl,
    BackLink
  },

  data() {
    return {
      doc: null,
      loading: false,
      failed: 0,
      total: 0,
      message: ''
    };
  },
  computed: {
    meta() {
      return frappe.getMeta('PermitAction');
    },
    buttonText() {
      return this.loading
        ? this._(`${this.doc.buttonText}...`)
        : this._('Next');
    },
    success() {
      if (this.total && this.failed) {
        return parseInt(this.total) - parseInt(this.failed);
      }

      if (this.total) {
        return parseInt(this.total);
      }

      if (this.failed) {
        return 0;
      }

      return '';
    }
  },
  async created() {
    try {
      this.doc = await frappe.getDoc('PermitAction', this.name);
    } catch (error) {
      console.log(error);
      if (error instanceof frappe.errors.NotFoundError) {
        this.routeToList();
        return;
      }
      this.handleError(error);
    }
  },

  methods: {
    async onClick() {
      // if (!this.doc.account) {
      //   showMessageDialog({ message: this._('Please select account') });
      //   return;
      // }
      this.loading = true;

      if (this.doc.action === 'fetchNew') {
        const dt = DateTime.local()
          .minus({ months: 2 })
          .toISO();
        // const credentials = await frappe.getDoc(
        //   'I3MSAccount',
        //   this.doc.account
        // );
        const credentials = {
          username: frappe.AccountingSettings.i3msUsername,
          password: frappe.AccountingSettings.i3msPassword
        };
        let permits = await frappe.db.getAll({
          doctype: 'Permit',
          fields: ['*'],
          filters: {
            startDate: ['>=', dt],
            type: 'I3MS'
          }
        });
        permits = permits.map(permit => ({
          tag_url: permit.taggingUrl,
          vehicle_details: permit.vehicleDetails,
          permit_number: permit.name,
          start_date: permit.startDate,
          end_date: permit.endDate
        }));
        frappe.events.trigger('permits-details', {
          credentials,
          permits: permits,
          showBrowser: this.doc.showBrowser
        });
        frappe.events.once('permits-details-results', async () => {
          this.loading = false;
          await showMessageDialog({
            description: 'Permits fetched successfully',
            buttons: [{ label: 'Ok' }]
          });
          this.$router.back();
        });
      } else if (this.doc.action === 'tagging') {
        if (!this.doc.truckList && !this.doc.trucks) {
          showMessageDialog({ message: this._('Please provide trucks') });
          this.loading = false;
          return;
        }

        if (this.doc.numBrowsers > 10) {
          showMessageDialog({
            message: this._('Number of browsers not more than 10')
          });
          this.loading = false;
          return;
        }
        const permit = this.doc.permit || {};
        const credentials = {
          username: frappe.AccountingSettings.i3msUsername,
          password: frappe.AccountingSettings.i3msPassword
        };

        let trucks;

        if (this.doc.truckList) {
          const truckList = await frappe.getDoc(
            'TruckList',
            this.doc.truckList
          );
          console.log(credentials, truckList);
          trucks = truckList.trucks.split('\n').filter(Boolean);
        } else {
          trucks = extractTrucks(this.doc.trucks);
        }

        let taggedObj = permit.tagged ? JSON.parse(permit.tagged) : {};
        let tagged = Object.keys(taggedObj);
        trucks = _.difference(trucks, tagged);

        this.total = tagged.length;
        this.failed = tagged.filter(t => taggedObj[t]).length;

        console.log(
          'Trucks remaining',
          taggedObj,
          this.total,
          this.failed,
          trucks.length
        );

        let obj = {
          credentials,
          trucks,
          showBrowser: this.doc.showBrowser,
          numBrowsers: this.doc.numBrowsers
        };

        if (this.doc.permit) {
          obj = {
            ...obj,
            ...permit
          };
        } else {
          obj.taggingUrl = this.doc.taggingUrl;
          let ret = await new Promise((resolve, reject) => {
            refreshPermit(
              {
                ...obj,
                noTrips: true,
                validate: true
              },
              permit => {
                resolve(permit);
              }
            );
          });

          if (!ret) {
            showMessageDialog({
              description: this._(
                'No Permit to tag vehicles, please check in i3ms'
              ),
              buttons: [
                {
                  label: _('Ok')
                }
              ]
            });
            this.loading = false;
          }
          return;
        }

        if (trucks.length) {
          this.loading = true;
          frappe.events.trigger('tag-vehicles', obj);

          const totalCb = total => {
            console.log('received total', this.total, total);
            this.total += parseInt(total);
          };

          const failedCb = failed => {
            console.log('received failed', failed);
            this.failed += parseInt(failed);
          };

          frappe.events.off('total', totalCb);
          frappe.events.off('failed', failedCb);

          frappe.events.on('total', totalCb);
          frappe.events.on('failed', failedCb);

          frappe.events.once('tag-results', async () => {
            this.loading = false;
            frappe.events.off('total', totalCb);
            frappe.events.off('failed', failedCb);
            await showMessageDialog({
              description: `${this.success} Vehicles Tagged successfully`,
              buttons: [{ label: 'Ok' }]
            });
            this.$router.back();
          });
        } else {
          showMessageDialog({
            description: this._('All Trucks Already Tagged'),
            buttons: [
              {
                label: _('Ok')
              }
            ]
          });
          this.loading = false;
          return;
        }
      } else if (this.doc.action === 'release') {
        const permit = this.doc.permit;
        const credentials = {
          username: frappe.AccountingSettings.i3msUsername,
          password: frappe.AccountingSettings.i3msPassword
        };
        let trucks = extractTrucks(this.doc.trucks);

        if (trucks.length) {
          this.loading = true;
          frappe.events.trigger('release-vehicles', {
            credentials,
            ...permit,
            trucks,
            showBrowser: this.doc.showBrowser
          });

          frappe.events.once('release-vehicles-results', async () => {
            this.loading = false;
            await showMessageDialog({
              description: `${trucks.length} Vehicles Released successfully`,
              buttons: [{ label: 'Ok' }]
            });
            this.$router.back();
          });
        } else {
          showMessageDialog({
            description: this._('No Trucks to release'),
            buttons: [
              {
                label: _('Ok')
              }
            ]
          });
          this.loading = false;
          return;
        }
      } else if (this.doc.action === 'refresh') {
        //call permit refresh
        refreshPermit(
          {
            ...this.doc.permit,
            showBrowser: this.doc.showBrowser
          },
          async () => {
            this.loading = false;
            await showMessageDialog({
              description: `Permit ${this.doc.permit.name} Refreshed from i3ms successfully`,
              buttons: [{ label: 'Ok' }]
            });
            this.$router.back();
          }
        );
      }
    },

    handleError(e) {
      handleErrorWithDialog(e, this.doc);
    },

    routeToList() {
      this.$router.push(`/list/Permit`);
    }
  }
};
</script>

<style scoped>
hr {
  border: none;
  border-top: 2px dotted #f00;
  color: #fff;
  background-color: #fff;
  height: 1px;
  width: 100%;
}
</style>
