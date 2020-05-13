<template>
  <div class="flex flex-col" v-if="doc">
    <PageHeader>
      <BackLink slot="title" />
      <template slot="actions">
        <DropdownWithActions class="ml-2" :actions="actions" />
        <Button
          v-if="showSave"
          type="primary"
          class="text-white text-xs ml-2"
          @click="onSaveClick"
        >
          {{ _('Save') }}
        </Button>
      </template>
    </PageHeader>
    <div class="flex justify-center flex-1 mb-8 mt-2" v-if="meta">
      <div
        class="border rounded-lg shadow h-full flex flex-col justify-between"
        style="width: 600px"
      >
        <div class="px-6 text-base">
          <FormControl
            :df="meta.getField('trucks')"
            :value="doc.trucks"
            :showHeader="true"
            :max-rows-before-overflow="4"
            @change="value => doc.set('trucks', value)"
          />
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
import DropdownWithActions from '@/components/DropdownWithActions';
import BackLink from '@/components/BackLink';
//import { openSettings } from '@/utils';
import {
  handleErrorWithDialog,
  getActionsForDocument
  //showMessageDialog
} from '@/utils';

export default {
  name: 'TruckListForm',
  props: ['doctype', 'name'],
  components: {
    PageHeader,
    Button,
    FormControl,
    DropdownWithActions,
    BackLink
  },
  provide() {
    return {
      doctype: this.doctype,
      name: this.name
    };
  },
  data() {
    return {
      doc: null,
      printSettings: null,
      companyName: null
    };
  },
  computed: {
    meta() {
      return frappe.getMeta(this.doctype);
    },
    address() {
      return this.printSettings && this.printSettings.getLink('address');
    },
    showSave() {
      return this.doc && (this.doc._notInserted || this.doc._dirty);
    },
    actions() {
      return getActionsForDocument(this.doc);
    }
  },
  async mounted() {
    try {
      this.doc = await frappe.getDoc(this.doctype, this.name);
      window.d = this.doc;
    } catch (error) {
      if (error instanceof frappe.errors.NotFoundError) {
        this.routeToList();
        return;
      }
      this.handleError(error);
    }
    this.printSettings = await frappe.getSingle('PrintSettings');
    this.companyName = (
      await frappe.getSingle('AccountingSettings')
    ).companyName;

    let query = this.$route.query;
    if (query.values && query.doctype === this.doctype) {
      this.doc.set(this.$router.currentRoute.query.values);
    }
  },
  methods: {
    async onSaveClick() {
      await this.doc.set(
        'trucks',
        this.doc.trucks.filter(row => row.truck_number)
      );
      return this.doc.insertOrUpdate().catch(this.handleError);
    },
    handleError(e) {
      handleErrorWithDialog(e, this.doc);
    },
    routeToList() {
      this.$router.push(`/list/${this.doctype}`);
    },
    formattedValue(fieldname, doc) {
      if (!doc) {
        doc = this.doc;
      }
      let df = doc.meta.getField(fieldname);
      return frappe.format(doc[fieldname], df, doc);
    }
  }
};
</script>
