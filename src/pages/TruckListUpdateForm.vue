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
          <div class="mt-8 px-6">
            <h1 class="text-2xl font-semibold">
              {{ doc.label }}
            </h1>
            <div class="flex justify-between mt-2">
              <div class="w-1/3">        
                <FormControl
                  class="mt-4 text-base mb-4"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('truckList')"
                  :value="doc.truckList"
                  @change="value => doc.set('truckList', value)"
                />
                <input type="file" @change="handleFileUpload" />
                <FormControl
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
          <div class="flex px-6 mt-10 window-no-drag">
            <Button
              type="primary"
              class="text-sm text-white"
              :disabled="loading"
              @click="updateTruckList"
            >
              Update
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Spinner :loading="loading" />
  </div>
</template>
<script>
import frappe from 'frappejs';
const { DateTime, Interval } = require('luxon');
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import FormControl from '@/components/Controls/FormControl';
import BackLink from '@/components/BackLink';
import Spinner from '@/components/Spinner.vue';
import _ from 'lodash';

import { showMessageDialog } from '@/utils';

export default {
  name: 'TruckListUpdate',
  props: ['name'],
  components: {
    PageHeader,
    Button,
    FormControl,
    BackLink,
    Spinner
  },

  data() {
    return {
      doc: null,
      loading: false,
    };
  },
  computed: {
    meta() {
      return frappe.getMeta('TruckListUpdate');
    },
  },
  
  async created() {
    this.doc = await frappe.getNewDoc('TruckListUpdate');
  },

  methods: {
    async updateTruckList(e) {
      if (!this.doc.truckList) {
        return showMessageDialog({
          message: this._('Please select a truck list')
        });
      }

      const truckList = await frappe.getDoc('TruckList', this.doc.truckList);
      truckList.set('trucks', truckList.trucks + '\n' + this.doc.trucks);
      try {
        await truckList.update();
        return showMessageDialog({
          message: 'Truck List Updated Successfully'
        });
      } catch (ex) {
        return showMessageDialog({
          message: 'Failed to update truck list',
          description: ex.message
        });
      }
    },
    handleFileUpload(e) {
      var files = e.target.files || e.dataTransfer.files;
      console.log("files selected", files);
      if (!files.length)
        return;
      //this.doc.set('image', files[0]);
      //if (this.doc.trucks) return this.doc.trucks;
      this.loading = true;
      frappe.events.trigger("trucks-ocr", {
        path: files[0].path,
        type: files[0].type
      });
      frappe.events.once("trucks-ocr-results", (data) => {
        this.doc.set('trucks', data);
        this.loading = false;
      });
    },
  }
};

</script>

