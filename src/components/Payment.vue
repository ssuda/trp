<template>
  <div class="m-4">
    <h1>
      Please Pay Immediately Via UPI VPA:
      <span class="font-bold">ssuda777@oksbi</span>
    </h1>
    <div class="px-8 my-8 text-sm">
      <p>
        Sub Total:
        <span class="font-bold">{{ formatCurrency(actualBillingAmount) }}</span>
      </p>
      <p>
        Referal Bonus:
        <span class="font-bold">{{ formatCurrency(referalBonus) }}</span>
      </p>
      <p>
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
      class="ml-2 rounded-4 text-md filled bg-gray-100 p-2 my-4"
      placeholder="015221250995"
      v-model="paymentReference"
    />
    <Button :disabled="!paymentReference" primary @click="updatePayment"
      >Save</Button
    >
  </div>
</template>
<script>
import Button from '@/components/Button';
import Users from '@/users';
import frappe from 'frappejs';
import numberFormat from 'frappejs/utils/numberFormat';

export default {
  name: 'PaymentForm',
  data() {
    return {
      paymentReference: '',
      billingAmount: '',
      actualBillingAmount: '',
      gstAmount: '',
      referalBonus: ''
    };
  },

  components: {
    Button
  },

  mounted() {
    const user = frappe.currentUser.remote.data();

    this.referalBonus = -user.referalBonus || 0;
    this.actualBillingAmount = user.billingAmount;
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
