<template>
  <div class="py-4 flex items-center truncate" :class="cellClass">
    <span class="truncate" v-if="!customRenderer">{{ columnValue }}</span>
    <component v-else :is="customRenderer" />
  </div>
</template>
<script>
import frappe from 'frappejs';

export default {
  name: 'ListCell',
  props: ['doc', 'column'],
  computed: {
    columnValue() {
      let { column, doc } = this;
      let value = doc[column.fieldname];
      if (value) {
        return frappe.format(value, column, doc);
      }
      return value;
    },
    customRenderer() {
      if (!this.column.render) return;
      return this.column.render(this.doc);
    },
    cellClass() {
      return ['Int'].includes(this.column.fieldtype)
        ? 'justify-center'
        : ['Float', 'Currency'].includes(this.column.fieldtype)
        ? 'justify-end'
        : '';
    }
  }
};
</script>
