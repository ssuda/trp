<template>
  <div class="px-5 pb-16 text-base flex flex-col overflow-y-hidden">
    <div class="flex px-3">
      <div class="py-4 mr-3 w-7" v-if="hasImage"></div>
      <Row
        class="flex-1 text-gray-700"
        :columnCount="columns.length"
        gap="1rem"
      >
        <div
          v-for="column in columns"
          :key="column.label"
          class="py-4 truncate"
          :class="
            column.fieldtype == 'Int'
              ? 'text-center'
              : ['Float', 'Currency'].includes(column.fieldtype)
              ? 'text-right'
              : ''
          "
        >
          {{ column.label }}
        </div>
      </Row>
    </div>
    <div class="overflow-y-auto mb-4">
      <div
        class="px-3 flex hover:bg-gray-100 rounded-md"
        v-for="doc in data"
        :key="doc.name"
      >
        <div class="w-7 py-4 mr-3" v-if="hasImage">
          <Avatar :imageURL="doc.image" :label="doc.name" />
        </div>
        <Row
          gap="1rem"
          class="cursor-pointer text-gray-900 flex-1"
          @click.native="openForm(doc)"
          :columnCount="columns.length"
        >
          <ListCell
            v-for="column in columns"
            :key="column.label"
            :class="{
              'text-center': column.fieldtype == 'Int',
              'text-right': ['Float', 'Currency'].includes(column.fieldtype)
            }"
            :doc="doc"
            :column="column"
          ></ListCell>
        </Row>
      </div>
    </div>
    <Paginate
      v-if="showPagination"
      class="justify-end mb-4"
      :page-count="pagination.pageCount"
      :prev-text="'Prev'"
      :next-text="'Next'"
      :click-handler="handlePageSelected"
      :container-class="'pagination'"
      :page-class="'page-item'"
      :prev-class="'page-item'"
      :prev-link-class="'page-link'"
      :next-class="'page-item'"
      :next-link-class="'page-link'"
      :page-link-class="'page-link'"
    >
    </Paginate>
  </div>
</template>
<script>
import frappe from 'frappejs';
import Row from '@/components/Row';
import ListCell from './ListCell';
import Avatar from '@/components/Avatar';
import Paginate from 'vuejs-paginate';
import { openQuickEdit } from '@/utils';

export default {
  name: 'List',
  props: ['listConfig', 'filters'],
  components: {
    Row,
    ListCell,
    Avatar,
    Paginate
  },
  // watch: {
  //   listConfig(oldValue, newValue) {
  //     if (oldValue.doctype !== newValue.doctype) {
  //       console.log('calling setup from watch');
  //       this.setupColumnsAndData();
  //     }
  //   }
  // },
  data() {
    return {
      data: [],
      showPagination: false,
      pagination: {
        limit: 50,
        page: 1,
        pageCount: 1
      }
    };
  },
  computed: {
    columns() {
      return this.prepareColumns();
    },
    meta() {
      return frappe.getMeta(this.listConfig.doctype);
    },
    hasImage() {
      return this.meta.hasField('image');
    }
  },

  async mounted() {
    console.log('mounted is called', this.doctype);
  },

  async activated() {
    console.log('activated is called', this.doctype);
    await this.setupColumnsAndData();
    const cb = () => {
      this.updateData();
    };

    frappe.db.on(`change:${this.listConfig.doctype}`, cb);
    this.$once('hook:beforeDestroy', () => {
      console.log('before destroy called');
      frappe.db.off(`change:${this.listConfig.doctype}`, cb);
    });

    this.$once('hook:deactivated', () => {
      console.log('before destroy called');
      frappe.db.off(`change:${this.listConfig.doctype}`, cb);
    });
  },

  deactivated() {
    console.log('deactivated is called', this.doctype);
    this.deactivated = true;
  },

  methods: {
    async getCount(doctype, filters) {
      const meta = frappe.getMeta(doctype);
      const baseDoctype = meta.getBaseDocType();
      if (meta.filters) {
        filters = Object.assign({}, filters, meta.filters);
      }

      const builder = frappe.db.knex.count('name as count').from(baseDoctype);
      frappe.db.applyFiltersToBuilder(builder, filters);

      const res = await builder.first();
      console.log('res', res);
      return res.count;
    },

    handlePageSelected(pageNumber) {
      this.pagination.page = pageNumber;
      this.updateData();
    },

    async setupColumnsAndData() {
      this.doctype = this.listConfig.doctype;
      console.log('setupcolumns is called', this.doctype);
      this.deactivated = false;

      console.log('calling updatedata', this.doctype);
      await this.updateData();
    },

    openForm(doc) {
      if (this.listConfig.formRoute) {
        this.$router.push(this.listConfig.formRoute(doc.name));
        return;
      }
      openQuickEdit({
        doctype: this.doctype,
        name: doc.name
      });
    },

    async updateData(filters) {
      if (this.deactivated) return;

      if (!filters) filters = this.getFilters();

      let filterLength = Object.keys(filters).length;

      if (filterLength == 1 && filters.hasOwnProperty('keywords')) {
        filterLength = 0;
      }
      console.log(
        'Filters length',
        filterLength,
        this.doctype,
        this.listConfig.doctype,
        this
      );

      if (!filterLength && this.pagination.page == 1) {
        const totalRows = parseInt(await this.getCount(this.doctype, filters));
        this.pagination.pageCount = Math.ceil(
          totalRows / this.pagination.limit
        );
        this.showPagination = totalRows > this.pagination.limit;
        console.log(totalRows, this.showPagination, this.pagination.limit);
      }

      this.data = await frappe.db.getAll({
        doctype: this.doctype,
        fields: ['*'],
        filters,
        orderBy: this.listConfig.orderBy || 'creation',
        order: this.listConfig.order || 'desc',
        limit: !this.showPagination ? null : this.pagination.limit,
        start: !this.showPagination
          ? null
          : (this.pagination.page - 1) * this.pagination.limit
      });

      // if (
      //   this.doctype == 'Permit' &&
      //   Object.keys(filters).length == 0 &&
      //   !this.data.length
      // ) {
      //   try {
      //     const doc = await frappe.getNewDoc('PermitAction');
      //     doc.set({
      //       label: this._('Fetch Permits From I3MS'),
      //       buttonText: this._('Fetching'),
      //       action: 'fetchNew'
      //     });

      //     this.$router.push({
      //       name: 'PermitAction',
      //       params: {
      //         name: doc.name
      //       }
      //     });
      //   } catch (ex) {
      //     console.error(ex);
      //   }
      // }
    },
    getFilters() {
      let filters = {};
      Object.assign(filters, this.listConfig.filters || {});
      Object.assign(filters, this.filters);
      return filters;
    },
    prepareColumns() {
      return this.listConfig.columns
        .map(col => {
          if (typeof col === 'string') {
            const field = this.meta.getField(col);
            if (!field) return null;
            return field;
          }
          return col;
        })
        .filter(Boolean);
    }
  }
};
</script>
