<template>
  <div class="flex flex-col">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">{{ _('Dashboard') }}</h1>
      <template slot="actions">
        <SearchBar class="ml-2" />
      </template>
    </PageHeader>
    <div class="px-8">
      <div class="my-10 border-t" />
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
import Cashflow from './Cashflow';
import UnpaidInvoices from './UnpaidInvoices';
import ProfitAndLoss from './ProfitAndLoss';
import Expenses from './Expenses';
import TripStats from './TripStats';

import frappe from 'frappejs';

export default {
  name: 'Dashboard',
  components: {
    PageHeader,
    SearchBar,
    Cashflow,
    UnpaidInvoices,
    ProfitAndLoss,
    Expenses,
    TripStats
  },

  created() {
    if (
      !frappe.AccountingSettings.i3msUsername ||
      !frappe.AccountingSettings.i3msPassword
    ) {
      this.$router.push('/i3msAccount');
    }
  }
};
</script>
