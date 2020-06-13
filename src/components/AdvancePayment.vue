<template>
  <div class="flex flex-col flex-1">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">{{ _('Activation Fee') }}</h1>
    </PageHeader>
    <div class="px-8 my-8">
      <h1>
        Pay Via Google Pay, BHIM or PhonePe:
        <span class="font-bold">{{ frappe.globalConfig.upi }}</span>
      </h1>
      <div class="tracking-wider my-8 text-sm">
        <p class="my-4 border-t py-2">
          Grand Total:
          <span class="font-bold">{{ formatCurrency(billingAmount) }}</span>
        </p>
      </div>

      <label>Enter UPI Transaction ID:</label>
      <input
        class="ml-2 rounded-8 text-md filled bg-gray-100 p-2 my-4"
        placeholder="015221250995"
        v-model="paymentReference"
      />
      <Button
        :disabled="!paymentReference"
        type="primary"
        @click="updatePayment"
        >Save</Button
      >
    </div>
  </div>
</template>
<script>
import Button from '@/components/Button';
import Users from '@/users';
import frappe from 'frappejs';
import numberFormat from 'frappejs/utils/numberFormat';
import PageHeader from '@/components/PageHeader';
import { DateTime } from 'luxon';

export default {
  name: 'PaymentForm',
  data() {
    return {
      paymentReference: '',
      billingAmount: '',
      companyInfo: {},
      dueDate: null
    };
  },

  components: {
    Button,
    PageHeader
  },

  created() {
    const companyInfo = frappe.currentUser.remote.data();
    console.log('companyInfo', companyInfo);
    this.dueDate = DateTime.fromJSDate(companyInfo.billingPeriodStart.toDate())
      .plus({ days: 1 })
      .toJSDate();

    this.billingAmount = frappe.globalConfig.advanceAmount;
  },

  methods: {
    formatCurrency(value) {
      let currency = frappe.AccountingSettings.currency;
      let currencySymbol = frappe.currencySymbols[currency] || '';
      return currencySymbol + ' ' + numberFormat.formatNumber(value);
    },

    async updatePayment() {
      if (!this.paymentReference) {
        return;
      }

      console.log(this.paymentReference);
      await Users.updateAdvancePayment(this.paymentReference);
      this.$emit('close');
    }
  }
};
</script>
