<template>
  <div class="flex flex-col flex-1">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">{{ _('Billing') }}</h1>
    </PageHeader>
    <div class="px-8 my-8">
      <h1>
        Pay Via Google Pay, BHIM or PhonePe:
        <span class="font-bold">{{ frappe.globalConfig.upi }}</span>
      </h1>
      <div class="tracking-wider my-8 text-sm">
        <p>
          Due Date:
          <span class="font-bold">{{ frappe.format(dueDate, 'Date') }} </span>
        </p>
        <p>
          Billing Period:
          <span class="font-bold"
            >{{
              frappe.format(companyInfo.billingPeriodStart.toDate(), 'Date')
            }}
            - {{ frappe.format(companyInfo.billingPeriodEnd.toDate(), 'Date') }}
          </span>
        </p>
        <p class="mt-1">
          Total Tagged:
          <span class="font-bold">{{ companyInfo.billingTagged }}</span>
        </p>
        <p class="mt-1">
          Sub Total:
          <span class="font-bold">{{
            formatCurrency(actualBillingAmount)
          }}</span>
        </p>
        <p class="mt-1">
          Referal Bonus:
          <span class="font-bold">{{ formatCurrency(referalBonus) }}</span>
        </p>
        <p class="mt-1">
          GST (18%):
          <span class="font-bold">{{ formatCurrency(gstAmount) }}</span>
        </p>

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
      <Button :disabled="!paymentReference" primary @click="updatePayment"
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
      actualBillingAmount: '',
      gstAmount: '',
      referalBonus: '',
      companyInfo: {},
      taxRate: 0,
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
    this.dueDate = DateTime.fromJSDate(companyInfo.billingPeriodEnd.toDate())
      .plus({ days: 1 })
      .toJSDate();
    this.companyInfo = companyInfo;
    this.taxRate = frappe.globalConfig.taxRate || 0;
    this.referalBonus = -companyInfo.referalBonus || 0;
    this.actualBillingAmount =
      companyInfo.billingTagged * frappe.globalConfig.truckWisePayment ||
      frappe.globalConfig.price;
    const billingAmount = this.actualBillingAmount - this.referalBonus;
    this.gstAmount = billingAmount * this.taxRate;
    this.billingAmount = billingAmount + this.gstAmount;
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
      await Users.updatePayment(this.paymentReference);
      this.$emit('close');
    }
  }
};
</script>
