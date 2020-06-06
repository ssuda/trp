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
          <div class="px-6 pt-6">
            <div class="flex text-sm text-gray-900 border-b pb-4">
              <div class="w-1/3">
                <h1 class="text-2xl font-semibold">
                  I3MS Account
                </h1>
              </div>
            </div>
          </div>
          <div class="mt-4 px-6">
            <div class="flex justify-between mt-2">
              <div class="w-1/3">
                <FormControl
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('i3msUsername')"
                  :value="doc.i3msUsername"
                  :show-label="true"
                  @change="value => setValue('i3msUsername', value)"
                />
                <FormControl
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('i3msPassword')"
                  :value="doc.i3msPassword"
                  :show-label="true"
                  @change="value => setValue('i3msPassword', value)"
                />
              </div>
            </div>

            <div class="mt-4 text-xl text-gray-700 font-semibold">
              <span v-if="statusText" class="ml-2 text-base text-gray-600">{{
                statusText
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
import frappe from 'frappejs';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import FormControl from '@/components/Controls/FormControl';
import BackLink from '@/components/BackLink';
import { handleErrorWithDialog, showMessageDialog } from '@/utils';

import { _ } from 'frappejs';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export default {
  name: 'I3msAccount',
  components: {
    PageHeader,
    Button,
    FormControl,
    BackLink
  },

  data() {
    return {
      doc: null,
      statusText: ''
    };
  },
  computed: {
    meta() {
      return frappe.getMeta('AccountingSettings');
    }
  },

  created() {
    this.doc = frappe.AccountingSettings;
  },

  methods: {
    async setValue(field, value) {
      this.statusText = _('Saving...');
      await this.doc.set(field, value);
      await delay(1000);
      this.statusText = _('Saved');
    }
  }
};
</script>
