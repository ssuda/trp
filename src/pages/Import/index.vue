<template>
  <div class="flex flex-col">
    <!-- <PageHeader>
      <BackLink slot="title" />
      <template slot="actions">
        <FileSelect class="ml-8" label="Upload CSV" v-model="uploadedFile" @change="uploadCSV" />
        <Button type="primary" class="ml-2 text-white" @click="downloadTemplate">Download CSV Template</Button>
        <Button type="primary" class="ml-2 text-white" @click="saveCSV">Save</Button>
        <SearchBar @input="search" class="ml-2" v-model="searchText" />
      </template>
    </PageHeader> -->

    <PageHeader>
      <BackLink slot="title" />
      <template slot="actions">
        <Button
          type="primary"
          class="text-white text-xs ml-2"
          @click="downloadTemplate"
        >
          {{ _('Download CSV Template') }}
        </Button>
        <FileSelect
          :icon="false"
          class="ml-8"
          :label="_('Upload CSV')"
          @input="uploadCSV"
        />

        <Button
          :disabled="!submitting"
          type="primary"
          class="text-white text-xs ml-2"
          @click="saveCSV"
          >{{ _('Submit') }}</Button
        >
      </template>
    </PageHeader>

    <div class="flex-1 flex h-full">
      <List
        ref="list"
        :data="data"
        :listConfig="listConfig"
        :filters="filters"
        class="flex-1"
      />
    </div>
  </div>
</template>
<script>
import frappe from 'frappejs';
//import Observable from 'frappejs/utils/observable';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import SearchBar from '@/components/SearchBar';
import List from './List';
import csv2json from 'csvjson-csv2json';
//import Icon from '@/components/Icon';
import FileSelect from '@/components/FileSelect';
import { exportData, getDoc, showMessageDialog } from '@/utils';
import BackLink from '@/components/BackLink';
import { DateTime } from 'luxon';
import { isNullOrUndefined } from '@/utils';

export default {
  name: 'ImportData',
  props: ['doctype', 'filters'],
  components: {
    PageHeader,
    List,
    Button,
    SearchBar,
    //Icon,
    FileSelect,
    BackLink
  },
  data() {
    return {
      submitting: false,
      data: [],
      searchText: '',
      currentFilters: null
    };
  },
  activated() {
    if (typeof this.filters === 'object') {
      this.currentFilters = this.filters;
      this.$refs.filterDropdown.setFilter(this.filters);
    }
  },
  methods: {
    async saveCSV() {
      this.submitting = false;
      if (!this.data || !this.data.length) {
        return showMessageDialog({
          message: 'Data Import Failed',
          description: `Please upload CSV file`
        });
      }
      try {
        await Promise.all(this.data.map(doc => doc.update()));
        showMessageDialog({
          message: 'Data Import Success',
          description: `Data Imported Successfully`
        });
      } catch (ex) {
        return showMessageDialog({
          message: 'Data Import Failed',
          description: ex.message
        });
      }
    },

    uploadCSV(file) {
      console.log(file);
      this.data = [];
      var reader = new FileReader();
      reader.onload = async () => {
        const meta = frappe.getMeta(this.doctype);
        const fieldMap = {};

        let header = reader.result.split('\n')[0];

        header = header
          .split(',')
          .map(label => {
            let fieldname;
            label = label.replace(/\(.*$/, '');
            meta.fields.some(field => {
              if (field.label === label.trim()) {
                fieldname = field.fieldname;
                fieldMap[fieldname] = field;
                return true;
              }
            });
            return fieldname;
          })
          .filter(Boolean);

        let csvString = reader.result.split('\n');
        csvString[0] = header;
        csvString = csvString.join('\n');
        const json = csv2json(csvString, { parseNumbers: true });
        json.forEach(row => {
          header.forEach(h => {
            if (isNullOrUndefined(row[h]) || row[h] === '') {
              delete row[h];
            }
          });
        });
        console.log('json', json);
        this.data = await Promise.all(json.map(row => this.makeNewDoc(row)));
        this.submitting = true;
      };
      reader.readAsBinaryString(file);
    },
    downloadTemplate() {
      const meta = frappe.getMeta(this.doctype);
      let columns;
      if (meta.importFields) {
        columns = meta.importFields.map(fieldname => {
          const field = meta.fields.find(f => f.fieldname == fieldname);
          if (field.fieldtype === 'Date') {
            return `${field.label}(YYYY-MM-DD)`;
          }
          return field.label;
        });
      } else {
        columns = meta.fields
          .filter(
            field =>
              !meta.importFields || meta.importFields.includes(field.fieldname)
          )
          .map(field =>
            field.required ? field.label : `${field.label}(Optional)`
          );
      }
      exportData(`${this.doctype} Import Template`, columns, [], true);
    },

    selectItem(d) {
      if (d.action) {
        d.action(this.$router);
      }
    },

    async makeNewDoc(data) {
      const doc = await frappe.getDoc(this.doctype, data.name);
      Object.assign(doc, data);
      return doc;
    },

    applyFilter(filters) {
      this.currentFilters = filters;
      this.$refs.list.updateData(filters);
    },

    search() {
      const filters = this.currentFilters || {};
      filters.keywords = ['like', `%${this.searchText}%`];
      this.$refs.list.updateData(filters);
    },
    getFormPath(name) {
      if (this.listConfig.formRoute) {
        let path = this.listConfig.formRoute(name);
        return path;
      }
      return {
        path: `/list/${this.doctype}`,
        query: {
          edit: 1,
          doctype: this.doctype,
          name
        }
      };
    }
  },
  computed: {
    meta() {
      return frappe.getMeta(this.doctype);
    },
    listConfig() {
      let columns;
      if (this.meta.importFields) {
        columns = this.meta.importFields;
      } else {
        columns = this.meta.fields.filter(field => field.required);
      }
      return {
        title: this.doctype,
        doctype: this.doctype,
        columns
      };
    },
    title() {
      return this.listConfig.title || this.doctype;
    }
  }
};
</script>
