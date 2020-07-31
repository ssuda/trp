<template>
  <div class="flex flex-col max-w-full">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">{{ report.title }}</h1>
      <template slot="actions">
        <Button
          class="mr-2"
          :icon="true"
          type="primary"
          @click="downloadReport"
        >
          <feather-icon name="download" class="w-4 h-4 text-white" />
        </Button>
        <SearchBar class="ml-2" />
      </template>
    </PageHeader>
    <div class="mt-2 flex text-base px-8" v-if="report.filterFields">
      <div
        class="ml-3 first:ml-0 w-32"
        v-for="df in filterFields"
        :key="df.fieldname"
      >
        <FormControl
          size="small"
          input-class="bg-gray-100"
          :df="df"
          :value="filters[df.fieldname]"
          @change="value => onFilterChange(df, value)"
        />
      </div>
    </div>
    <div class="mt-4 flex text-base px-8" v-if="report.dimensionFields">
      <div
        class="ml-3 first:ml-0 w-32"
        v-for="df in dimensionFields"
        :key="df.fieldname"
      >
        <FormControl
          size="small"
          input-class="bg-gray-100"
          :df="df"
          :label="df.label"
          :showLabel="true"
          :value="dimensions[df.fieldname]"
          @change="value => onDimensionChange(df, value)"
        />
      </div>
    </div>
    <div ref="datatable" class="pl-8 pr-4 mt-4"></div>
  </div>
</template>
<script>
import frappe from 'frappejs';
import DataTable from 'frappe-datatable';
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import SearchBar from '@/components/SearchBar';
import Row from '@/components/Row';
import WithScroll from '@/components/WithScroll';
import FormControl from '@/components/Controls/FormControl';
import reportViewConfig from '@/../reports/view';

import { exportData } from '@/utils';

export default {
  name: 'Report',
  props: ['reportName', 'defaultFilters'],
  components: {
    PageHeader,
    Button,
    SearchBar,
    Row,
    FormControl,
    WithScroll
  },
  mounted() {
    console.log('columns', this.columns);
    this.datatable = new DataTable(this.$refs.datatable, {
      columns: this.columns,
      //checkboxColumn: true,
      inlineFilters: true,
      layout: 'ratio'
    });
  },
  provide() {
    return {
      doc: this.filters
    };
  },
  data() {
    let filters = {};
    for (let df of reportViewConfig[this.reportName].filterFields) {
      filters[df.fieldname] = null;
    }

    let dimensions = {};

    if (reportViewConfig[this.reportName].dimensionFields) {
      for (let df of reportViewConfig[this.reportName].dimensionFields(
        filters
      )) {
        dimensions[df.fieldname] = true;
      }
    }

    return {
      loading: true,
      filters,
      dimensions,
      reportData: {
        rows: [],
        columns: []
      }
    };
  },
  async activated() {
    await this.setDefaultFilters();
    await this.fetchReportData();
  },
  methods: {
    onBodyScroll({ scrollLeft }) {
      this.$nextTick(() => {
        this.$refs.header.scrollLeft = scrollLeft;
      });
    },

    downloadReport() {
      const rows = this.reportData.rows.map(row =>
        this.columns.map(c => row[c.fieldname])
      );
      const columns = this.columns.map(c => c.name);
      exportData(this.report.title, columns, rows, true);
    },

    async fetchReportData() {
      this.loading = true;
      await this.populateFormulaFields();

      let data = await frappe.call({
        method: this.report.method,
        args: {
          ...this.filters,
          dimensions: this.dimensions
        }
      });

      let rows;
      if (data.rows) {
        rows = data.rows;
      } else {
        rows = data;
      }

      if (!rows) {
        rows = [];
      }

      this.reportData.rows = this.addTreeMeta(rows);
      this.loading = false;
      this.datatable.refresh(
        this.reportData.rows.map(row =>
          this.columns.map(c => row[c.fieldname])
        ),
        this.columns.map(c => ({
          name: c.name || c.label,
          editable: false,
          resizable: false,
          focusable: false,
          sortable: true
        }))
      );

      this.datatable.columnmanager.toggleFilter(true);
      this.datatable.columnmanager.focusFilter(1);
    },

    addTreeMeta(rows) {
      return rows.map(row => {
        if ('indent' in row) {
          row.isBranch = true;
          row.expanded = true;
          row.isLeaf = !row.isGroup;
        }
        row.isShown = true;
        return row;
      });
    },

    toggleChildren(row, rowIndex) {
      if (!row.isBranch) return;

      let flag;
      if (row.expanded) {
        row.expanded = false;
        flag = false;
      } else {
        row.expanded = true;
        flag = true;
      }

      let _rows = this.rows.slice(rowIndex + 1);
      for (let _row of _rows) {
        if (row.isBranch && _row.indent > row.indent) {
          _row.expanded = flag;
          _row.isShown = flag;
          continue;
        }
        break;
      }
    },

    onFilterChange(df, value) {
      this.filters[df.fieldname] = value;
      this.fetchReportData();
    },

    onDimensionChange(df, value) {
      this.dimensions[df.fieldname] = value;
      setTimeout(() => this.fetchReportData(), 0);
    },

    async setDefaultFilters() {
      for (let df of this.report.filterFields) {
        let defaultValue = null;
        if (df.default) {
          if (typeof df.default === 'function') {
            defaultValue = await df.default();
          } else {
            defaultValue = df.default;
          }
        }
        this.filters[df.fieldname] = defaultValue;
      }

      if (this.defaultFilters) {
        Object.assign(this.filters, this.defaultFilters);
      }
    },

    async populateFormulaFields() {
      for (let df of this.report.filterFields) {
        if (df.formula) {
          let value;
          if (typeof df.formula === 'function') {
            value = await df.formula(this.filters);
          } else {
            value = df.formula;
          }
          this.filters[df.fieldname] = value;
        }
      }
    },

    cellComponent(cellValue, column) {
      if (typeof cellValue === 'object') {
        // cellValue has a component definition
        return cellValue;
      }
      if (column.component) {
        // column has a component definition
        return column.component(cellValue, column);
      }

      // default cell component
      let formattedValue =
        cellValue != null && cellValue !== ''
          ? frappe.format(cellValue, column)
          : '';
      return {
        render(h) {
          return h('span', formattedValue);
        }
      };
    },

    getColumnAlignClass(column) {
      return {
        'text-right': ['Int', 'Float', 'Currency'].includes(column.fieldtype)
      };
    },

    getCellClasses(row, column) {
      let padding = ['pl-0', 'pl-6', 'pl-12', 'pl-18', 'pl-20'];
      let treeCellClasses;
      if (row.isBranch && column === this.columns[0]) {
        treeCellClasses = [
          padding[row.indent],
          'hover:bg-gray-100 cursor-pointer'
        ];
      }
      return [
        //this.getColumnAlignClass(column),
        treeCellClasses,
        this.loading ? 'text-gray-100' : 'text-gray-900'
      ];
    }
  },
  computed: {
    filterFields() {
      return this.report.filterFields.filter(
        df => !df.condition || df.condition(this.filters)
      );
    },

    dimensionFields() {
      if (!this.report.dimensionFields) {
        return [];
      }

      return this.report.dimensionFields(this.filters).map(df => ({
        fieldname: df.fieldname,
        fieldtype: 'Check',
        label: df.label
      }));
    },

    columns() {
      return this.loading
        ? this.blankStateData.columns
        : this.report.getColumns(this.dimensions, this.filters);
    },
    rows() {
      return this.loading ? this.blankStateData.rows : this.reportData.rows;
    },
    blankStateData() {
      let columns = Array.from(new Array(6)).map((v, i) => {
        return {
          fieldtype: 'Data',
          fieldname: `Test ${i + 1}`,
          label: `Test ${i + 1}`
        };
      });
      let rows = Array.from(new Array(14)).map(() => {
        return columns.reduce((obj, col) => {
          obj[col.fieldname] = 'Test Data ' + col.fieldname;
          obj.isShown = true;
          return obj;
        }, {});
      });
      return {
        columns,
        rows
      };
    },
    report() {
      return reportViewConfig[this.reportName];
    },
    columnWidth() {
      return 'minmax(7rem, 1fr)';
    },
    gridTemplateColumns() {
      return this.columns
        .map(col => {
          let multiplier = col.width;
          if (!multiplier) {
            multiplier = 1;
          }
          let minWidth = `${7 * multiplier}rem`;
          let maxWidth = `${1 * multiplier}fr`;

          return `minmax(${minWidth}, ${maxWidth})`;
        })
        .join(' ');
    }
  }
};
</script>

<style>
@import '../styles/frappe-datatable.css';
.dt-scrollable {
  overflow-x: hidden !important;
}
.report-scroll-container {
  height: calc(100vh - 12rem);
}
.report-scroll-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.report-scroll-container::-webkit-scrollbar-thumb {
  background-color: theme('colors.gray.200');
}
.report-scroll-container::-webkit-scrollbar-thumb:hover {
  background-color: theme('colors.gray.300');
}
.report-scroll-container::-webkit-scrollbar-track {
  background-color: white;
}
</style>
