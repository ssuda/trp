<template>
  <div class="flex flex-col">
    <PageHeader>
      <BackLink slot="title" />
    </PageHeader>
    <div class="flex justify-center flex-1 mb-8 mt-2">
      <div
        class="border rounded-lg shadow h-full flex flex-col justify-between"
        style="width: 600px"
      >
        <div>
          <div class="px-6 pt-6">
            <div class="flex text-sm text-gray-900 border-b pb-4">
              <div class="text-xl text-gray-700 font-semibold">
                I3MS Monthly Returns
              </div>
            </div>
          </div>
          <div class="flex justify-end px-8 mt-5 window-no-drag">
            <span class="mr-8"
              >This will take some time, as it will fetch from i3ms</span
            >
            <Button
              @click="onClick"
              type="primary"
              class="text-sm text-white"
              :disabled="loading"
            >
              {{ buttonText }}
            </Button>
          </div>
          <div class="px-8 mt-5 font-medium text-green-600">
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
import BackLink from '@/components/BackLink';
import Trip from '../../reports/Trip/Trip';
import { exportData } from '@/utils';

import { twoMonthsOldPermits } from '@/permit';

import { handleErrorWithDialog } from '@/utils';

export default {
  name: 'PermitActionForm',
  props: ['name'],
  components: {
    PageHeader,
    Button,
    BackLink
  },

  data() {
    return {
      doc: null,
      loading: false,
      message: ''
    };
  },
  computed: {
    buttonText() {
      return this.loading ? this._(`Refreshing...`) : this._('Next');
    }
  },

  methods: {
    async onClick() {
      this.loading = true;
      this.message = '';
      //refresh last month permits

      let startDate = DateTime.local()
        .minus({ months: 1 })
        .startOf('month')
        .toISO();
      let endDate = DateTime.local()
        .minus({ months: 1 })
        .endOf('month')
        .toISO();

      const credentials = {
        username: frappe.AccountingSettings.i3msUsername,
        password: frappe.AccountingSettings.i3msPassword
      };

      const permits = await twoMonthsOldPermits();

      frappe.events.trigger('permits-details', {
        credentials,
        permits,
        showBrowser: true,
        i3msReturns: true
      });

      frappe.events.once('permits-details-results', async () => {
        this.loading = false;

        try {
          let rows = await new Trip().run({
            fromDate: startDate,
            toDate: endDate,
            periodicity: 'day',
            i3msReturns: true
          });

          rows = rows.map(row => {
            return [
              row.periodicity,
              '',
              row.transportedFrom,
              row.permit,
              '',
              row.material,
              row.loadQty,
              (row.destination || '').replace(/,.*$/, '').toUpperCase(),
              row.source.replace(/\(.*$/, '')
            ];
          });

          const columns = [
            'Date',
            'Name of the Lessee/Licensee',
            'Name of the Mines/Plant',
            'Permission no.',
            'Place',
            'Materials',
            'Despatched qty from mines/plant',
            'Destination',
            'Contract/Order issued by the lessees/end user industries'
          ];
          exportData(
            `I3MS ${DateTime.local()
              .minus({ months: 1 })
              .toFormat('LLL yyyy')} Returns`,
            columns,
            rows,
            true
          );
        } catch (ex) {
          console.error(ex);
        }
        this.message = 'Success';
      });
    },

    handleError(e) {
      handleErrorWithDialog(e, this.doc);
    }
  }
};
</script>
