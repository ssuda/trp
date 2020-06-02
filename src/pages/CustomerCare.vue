<template>
  <div class="flex flex-col">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">{{ _('Customer Care') }}</h1>
    </PageHeader>
    <div class="px-8 my-8">
      <p>Email: <span class="font-bold">support@spinbi.com</span></p>
      <p>Phone: <span class="font-bold">8105245255</span></p>
      <div class="mt-4">
        <div class="mr-2">Please refer and get bonus of <span class="font-bold">1000/-</span></div>
        Referal Code: <span class="font-bold">{{ referalCode }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import PageHeader from '@/components/PageHeader';
import frappe from 'frappejs';

export default {
  name: 'CustomerCare',

  components: {
    PageHeader
  },

  data() {
    return {
      referalCode: ''
    };
  },

  mounted() {
    const user = frappe.currentUser;
    this.referalCode = user.fbAccount.referalCode;
  }
};
</script>
