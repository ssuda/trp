<template>
  <div class="flex flex-col">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold" v-if="title">{{ title }}</h1>
      <template slot="actions">
        <FilterDropdown
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
    <div class="my-2 flex flex-row items-center">
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

      <div v-if="listConfig.upload" class="flex flex-col">
        <div class="flex flex-row">
          <Button :icon="true" class="ml-8 text-white" type="primary">
            <feather-icon
              name="download"
              class="w-4 h-4 font-weight-bold text-white"
            />
            <span class="ml-4">Template</span>
          </Button>

          <FileSelect class="ml-8" label="Upload" v-model="uploadedFile" />
        </div>
      </div>
    </div>

    <div class="flex-1 flex h-full">
      <List
        ref="list"
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
import listConfigs from './listConfig';
//import Icon from '@/components/Icon';
import FilterDropdown from '@/components/FilterDropdown';
import FileSelect from '@/components/FileSelect';

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
    FileSelect
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
    selectItem(d) {
      if (d.action) {
        d.action(this);
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
    title() {
      return this.listConfig.title || this.doctype;
    }
  }
};
</script>
