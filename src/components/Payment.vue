<template>
  <div class="m-4">
    <h1>
      Please Pay Immediately Rs/- {{ billingAmount }}. Via UPI VPA:
      <span class="font-bold">ssuda777@oksbi</span>
    </h1>
    <div class="px-8 my-8">
      <p>
        Billing Amount: <span class="font-bold">{{ actualBillingAmount }}</span>
      </p>
      <p>
        Referal Bonus: <span class="font-bold">{{ referalBonus }}</span>
      </p>
      <p>
        GST (18%): <span class="font-bold">{{ gstAmount }}</span>
      </p>
    </div>

    <label>Enter UPI Transaction ID:</label>
    <input
      class="ml-2 text-md filled bg-gray-100 p-2 my-4"
      placeholder="015221250995"
      v-model="paymentReference"
    />
    <Button class="primary" @click="updatePayment">Ok</Button>
  </div>
</template>
<script>
import Button from '@/components/Button';
import Users from '@/users';

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
    const user = frappe.currentUser;

    this.referalBonus = -user.referalBonus;
    this.actualBillingAmount = user.billingAmount;
    const billingAmount = user.billingAmount - user.referalBonus;
    this.gstAmount = billingAmount * 0.18;
    this.billingAmount = billingAmount + this.gstAmount;
  },

  methods: {
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
