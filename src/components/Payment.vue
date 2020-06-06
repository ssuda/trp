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
          Billing Period:
          <span class="font-bold"
            >{{
              frappe.format(companyInfo.billingPeriodStart.toDate(), 'Date')
            }}
            - {{ frappe.format(companyInfo.billingPeriodEnd.toDate(), 'Date') }}
          </span>
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

export default {
  name: 'PaymentForm',
  data() {
    return {
      paymentReference: '',
      billingAmount: '',
      actualBillingAmount: '',
      gstAmount: '',
      referalBonus: '',
      companyInfo: {}
    };
  },

  components: {
    Button,
    PageHeader
  },

  mounted() {
    const companyInfo = frappe.currentUser.remote.data();

    this.companyInfo = companyInfo;
    this.referalBonus = -companyInfo.referalBonus || 0;
    this.actualBillingAmount = frappe.globalConfig.price;
    const billingAmount = this.actualBillingAmount - this.referalBonus;
    this.gstAmount = billingAmount * 0.18;
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
