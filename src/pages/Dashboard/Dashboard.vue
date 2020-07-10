<template>
  <div class="flex flex-col">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">{{ _('Dashboard') }}</h1>
      <template slot="actions">
        <SearchBar class="ml-2" />
      </template>
    </PageHeader>
    <div class="px-8 flex-1">
      <div ref="datatable" class="border-b mt-4"></div>
      <div class="my-10" />
      <TripStats />
      <!-- <div class="border-t" />
      <Cashflow />
      <div class="my-10 border-t" />
      <UnpaidInvoices />
      <div class="my-10 border-t" />
      <div class="flex -mx-4">
        <div class="w-1/2 px-4">
          <ProfitAndLoss />
        </div>
        <div class="w-1/2 px-4">
          <Expenses />
        </div>
      </div> -->
    </div>
  </div>
</template>

<script>
import PageHeader from '@/components/PageHeader';
import SearchBar from '@/components/SearchBar';
import DataTable from 'frappe-datatable';
import { DateTime } from 'luxon';
// import Cashflow from './Cashflow';
// import UnpaidInvoices from './UnpaidInvoices';
// import ProfitAndLoss from './ProfitAndLoss';
// import Expenses from './Expenses';
import TripStats from './TripStats';
import tripConfig from '../../../reports/Trip/viewConfig';

import frappe from 'frappejs';

export default {
  name: 'Dashboard',
  components: {
    PageHeader,
    SearchBar,
    // Cashflow,
    // UnpaidInvoices,
    // ProfitAndLoss,
    // Expenses,
    TripStats
  },

  created() {
    if (
      !frappe.AccountingSettings.i3msUsername ||
      !frappe.AccountingSettings.i3msPassword
    ) {
      this.$router.push('/i3msAccount');
    }

    const d = DateTime.local().toFormat('yyyy-LL-dd');

    this.filters = {
      dateRange: 'today',
      fromDate: d,
      toDate: d
    };

    this.dimensions = {
      permit: true,
      source: true,
      transportedFrom: true
    };
  },

  activated() {
    if (!this.datatable) {
      this.datatable = new DataTable(this.$refs.datatable, {
        columns: this.columns,
        layout: 'ratio'
      });
    }
    this.fetchReportData();
  },

  computed: {
    columns() {
      return tripConfig.getColumns(this.dimensions, this.filters);
    }
  },

  methods: {
    async fetchReportData() {
      this.loading = true;
      let data = await frappe.call({
        method: tripConfig.method,
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

      this.loading = false;
      this.datatable.refresh(
        rows.map(row => this.columns.map(c => row[c.fieldname])),
        this.columns.map(c => ({
          name: c.name || c.label,
          editable: false,
          resizable: false,
          focusable: false,
          sortable: true
        }))
      );
    }
  }
};
</script>

<style scoped>
@import '../../styles/frappe-datatable.css';
</style>
