<template>
  <div class="px-5 pb-16 text-base flex flex-col overflow-y-hidden">
    <div class="flex px-3">
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
    <div class="overflow-y-auto">
      <div
        class="px-3 flex hover:bg-gray-100 rounded-md"
        v-for="doc in data"
        :key="doc.name"
      >
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
  props: ['listConfig', 'data'],
  components: {
    Row,
    ListCell,
    Avatar,
    Paginate
  },

  computed: {
    columns() {
      return this.prepareColumns();
    },
    meta() {
      return frappe.getMeta(this.listConfig.doctype);
    }
  },
  async mounted() {
    this.doctype = this.listConfig.doctype;
  },
  methods: {
    openForm(doc) {
      openQuickEdit({
        doctype: this.doctype,
        name: doc.name
      });
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
