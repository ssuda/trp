<template>
  <div class="flex flex-col flex-1">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">
        {{ _('Terms and Conditions') }}
      </h1>
    </PageHeader>
    <div class="px-8 my-2">
      <ul class="tracking-wider list-disc">
        <li v-if="!trailExpired">
          Trial will be expired in
          <span class="font-bold">{{ trailPeriod }} days </span>
        </li>
        <li class="mt-2">
          Activation Charges after trial: Rs
          <span class="font-bold">
            {{ formatCurrency(advanceAmount) }}
          </span>
        </li>
        <!-- 
        <li class="mt-2">
          Billing is <span class="font-bold">Monthly</span> and Only billed for
          Successfully Tagged Trucks
        </li>

        <li class="mt-2">
          Monthly payment is calculated after Billing period and should be paid
          within <span class="font-bold">{{ gracePeriod }} days</span>.
          Otherwise, your service will be disabled
        </li> -->

        <li class="mt-2">
          Monthly Price Rs
          <span class="font-bold">
            {{ formatCurrency(frappe.globalConfig.price) }}</span
          >
          <!-- (Upto 20,000 Trucks). After 20,000 Trucks, Rs
          <span class="font-bold">
            {{ formatCurrency(frappe.globalConfig.truckWisePayment) }}</span
          >
          Per Truck. -->
        </li>

        <li class="mt-2" v-if="taxRate">
          <span class="font-bold">{{ taxRate }}%</span> GST will be additional*
        </li>
      </ul>
      <Button
        class="mt-8 text-white text-md text-base"
        type="primary"
        @click="closeModal"
        >Ok</Button
      >
    </div>
  </div>
</template>
<script>
import Button from '@/components/Button';
import Users from '@/users';
import frappe from 'frappejs';
import numberFormat from 'frappejs/utils/format';
import PageHeader from '@/components/PageHeader';
import { DateTime } from 'luxon';

export default {
  name: 'PaymentForm',
  data() {
    return {
      advanceAmount: 0,
      truckWisePayment: 0,
      taxRate: 0,
      trailPeriod: 0,
      gracePeriod: 0,
      trailExpired: false
    };
  },

  components: {
    Button,
    PageHeader
  },

  created() {
    const companyInfo = frappe.currentUser.remote.data();
    const billingStart = DateTime.fromJSDate(
      companyInfo.billingPeriodStart.toDate()
    );

    this.trailExpired = parseInt(-billingStart.diffNow('days').days) > 0;

    this.trailPeriod =
      companyInfo.trailPeriodDays || frappe.globalConfig.trailPeriodDays;
    this.advanceAmount =
      companyInfo.advanceAmount || frappe.globalConfig.advanceAmount;
    this.truckWisePayment =
      companyInfo.truckWisePayment || frappe.globalConfig.truckWisePayment;
    this.taxRate = frappe.globalConfig.taxRate * 100;
    this.gracePeriod =
      companyInfo.gracePeriodDays || frappe.globalConfig.gracePeriodDays;
  },

  methods: {
    formatCurrency(value) {
      let currency = frappe.AccountingSettings.currency;
      let currencySymbol = frappe.currencySymbols[currency] || '';
      return currencySymbol + ' ' + numberFormat.formatNumber(value);
    },

    async closeModal() {
      this.$emit('close');
    }
  }
};
</script>
