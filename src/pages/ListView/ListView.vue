<template>
  <div class="flex flex-col">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold" v-if="title">{{ title }}</h1>
      <template slot="actions">
        <!-- <Button v-if="listConfig.upload" class="mr-2" :icon="true" type="primary" @click="gotoImport">
          <feather-icon name="upload" class="w-4 h-4 text-white" />
        </Button> -->
        <DropdownWithActions :actions="actions" v-if="listConfig.actions" />

        <FilterDropdown
          class="ml-2 "
          ref="filterDropdown"
          @change="applyFilter"
          :fields="meta.fields"
        />
        <Button class="ml-2" :icon="true" type="primary" @click="makeNewDoc">
          <feather-icon name="plus" class="w-4 h-4 text-white" />
        </Button>
        <SearchBar @input="search" class="ml-2" v-model="searchText" />
      </template>
    </PageHeader>
    <!-- <div class="my-2 flex flex-row items-center">
      <div v-if="listConfig.actions" class="flex flex-col">
        <Button
          :key="action.label"
          v-for="action in listConfig.actions"
          class="ml-8 text-white"
          type="primary"
          @click="selectItem(action)"
        >
          {{ action.label }}
        </Button>
      </div>
    </div> -->

    <div class="flex-1 flex h-full">
      <List
        ref="list"
        :listConfig="listConfig"
        :filters="filters"
        class="flex-1"
      />
    </div>
    <!-- <div class="flex justify-end">
      <Paginate
        container-class="flex flex-row"
        :page-count="10">
      </Paginate>
    </div> -->
  </div>
</template>
<script>
import frappe from 'frappejs';
//import Observable from 'frappejs/utils/observable';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import SearchBar from '@/components/SearchBar';
import List from './List';
import listConfigs from './listConfig';
//import Icon from '@/components/Icon';
import FilterDropdown from '@/components/FilterDropdown';
import FileSelect from '@/components/FileSelect';
import { exportData, getActionsForList } from '@/utils';
import Paginate from 'vuejs-paginate';
import DropdownWithActions from '@/components/DropdownWithActions';

export default {
  name: 'ListView',
  props: ['doctype', 'filters'],
  components: {
    PageHeader,
    List,
    Button,
    SearchBar,
    //Icon,
    FilterDropdown,
    FileSelect,
    Paginate,
    DropdownWithActions
  },
  data() {
    return {
      uploadedFile: null,
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
    gotoImport() {
      const route = {
        path: `/import/${this.doctype}`
      };
      this.$router.push(route);
    },

    importTemplate() {
      const meta = frappe.getMeta(this.doctype);
      let columns;
      if (meta.importFields) {
        columns = meta.importFields.map(
          field => meta.fields.find(f => f.fieldname == field).label
        );
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
      exportData(`${this.doctype} Import Template`, columns);
    },

    selectItem(d) {
      if (d.action) {
        d.action(this.$router);
      }
    },
    async makeNewDoc() {
      const doctype = this.listConfig.doctype;
      const doc = await frappe.getNewDoc(doctype);
      if (this.listConfig.filters) {
        doc.set(this.listConfig.filters);
      }
      if (this.filters) {
        doc.set(this.filters);
      }
      let path = this.getFormPath(doc.name);
      this.$router.push(path);
      doc.on('afterInsert', () => {
        let path = this.getFormPath(doc.name);
        this.$router.replace(path);
      });
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
      if (listConfigs[this.doctype]) {
        return listConfigs[this.doctype];
      } else {
        return {
          title: this.doctype,
          doctype: this.doctype,
          columns: this.meta.getKeywordFields()
        };
      }
    },
    actions() {
      return getActionsForList(this.listConfig);
    },
    title() {
      return this.listConfig.title || this.doctype;
    }
  }
};
</script>
