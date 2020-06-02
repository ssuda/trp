<template>
  <div class="m-4">
    <h1>
      Please Pay Immediately via UPI VPA:
      <span class="font-bold">ssuda777@oksbi</span>
    </h1>
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
      paymentReference: ''
    };
  },
  components: {
    Button
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
