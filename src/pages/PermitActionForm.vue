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
                  {{ doc.permit }}
                </div>
              </div>
            </div>
          </div>
          <div class="mt-8 px-6">
            <h1 class="text-2xl font-semibold">
              {{ doc.name }}
            </h1>
            <div class="flex justify-between mt-2">
              <div class="w-1/3">
                <FormControl
                  class="mt-2 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('account')"
                  :value="doc.account"
                  :placeholder="'Account'"
                  @change="value => doc.set('account', value)"
                  :read-only="doc.permit"
                />
                <FormControl
                  v-if="doc.action == 'tagging'"
                  class="mt-2 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('truckList')"
                  :value="doc.truckList"
                  :placeholder="'Truck List'"
                  @change="value => doc.set('truckList', value)"
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
//import { openSettings } from '@/utils';
import { handleErrorWithDialog, showMessageDialog } from '@/utils';

export default {
  name: 'PermitActionForm',
  props: ['doc'],
  components: {
    PageHeader,
    Button,
    FormControl,
    BackLink
  },

  data() {
    return {
      doctype: null,
      name: null,
      loading: false
    };
  },
  computed: {
    meta() {
      return frappe.getMeta(this.doctype);
    },
    buttonText() {
      return this.loading ? this._('Setting Up...') : this._('Next');
    }
  },
  async created() {
    console.log('received', this.doc);
    try {
      this.doctype = this.doc.doctype;
      this.name = this.doc.name;
      window.d = this.doc;
    } catch (error) {
      if (error instanceof frappe.errors.NotFoundError) {
        this.routeToList();
        return;
      }
      this.handleError(error);
    }
  },
  methods: {
    async onClick() {
      if (!this.doc.account) {
        showMessageDialog({ message: this._('Please select account') });
        return;
      }
      this.loading = true;
      const dt = DateTime.local()
        .minus({ months: 2 })
        .toISO();
      const credentials = await frappe.getDoc('I3MSAccount', this.doc.account);
      let permits = await frappe.db.getAll({
        doctype: 'Permit',
        fields: ['*'],
        filters: { account: this.doc.account, startDate: ['>=', dt] }
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
        permits: permits
      });
      frappe.events.once('permits-details-results', () => {
        this.loading = false;
        this.$router.back();
      });
    },

    handleError(e) {
      handleErrorWithDialog(e, this.doc);
    },

    routeToList() {
      this.$router.back();
    }
  }
};
</script>
