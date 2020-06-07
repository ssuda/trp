<template>
  <div class="flex flex-col flex-1">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">{{ _('Customer Care') }}</h1>
    </PageHeader>
    <div class="px-8 my-8">
      <p>
        Email: <span class="font-bold">{{ customerCare.email }}</span>
      </p>
      <p>
        Phone: <span class="font-bold">{{ customerCare.phoneNumber }}</span>
      </p>

      <div class="mt-4">
        <div class="mr-2 py-3">
          Please refer and get bonus of
          <span class="font-bold"
            >{{ frappe.globalConfig.referalBonus }}/-</span
          >
        </div>
        <p class="flex my-2">
          <span class="py-1 pr-2">Referal Code:</span>
          <span
            class="ml-1 font-bold border-solid border-2 border-gray-400 px-3 py-1 rounded-lg"
            >{{ referalCode }}</span
          >
          <a
            @click.prevent="copyToClipboard(referalCode)"
            class="cursor-pointer text-gray-800 px-2 ml-2 border-solid border-2 border-gray-400 px-3 py-1 rounded-lg"
            primary
            >Copy</a
          >
        </p>
        <p class="flex my-2 py-2">
          <span class="py-1 pr-2">Link:</span>
          <span
            class="ml-1 font-bold border-solid border-2 border-gray-400 px-3 py-1 rounded-lg"
            >{{ frappe.globalConfig.downloadUrl }}</span
          >
          <a
            class="cursor-pointer text-gray-800 px-2 ml-2 border-solid border-2 border-gray-400 px-3 py-1 rounded-lg"
            @click.prevent="copyToClipboard(frappe.globalConfig.downloadUrl)"
            primary
            >Copy</a
          >
        </p>
      </div>
    </div>
  </div>
</template>

<script>
import PageHeader from '@/components/PageHeader';
import frappe from 'frappejs';
import { showMessageDialog } from '@/utils';

export default {
  name: 'CustomerCare',

  components: {
    PageHeader
  },

  data() {
    return {
      referalCode: '',
      customerCare: {}
    };
  },

  mounted() {
    const user = frappe.currentUser;
    console.log(frappe.currentUser);
    this.referalCode = user.remote.get('referalCode');
    this.customerCare = frappe.globalConfig.customerCare;
  },

  methods: {
    async copyToClipboard(value) {
      try {
        await navigator.clipboard.writeText(value);
        showMessageDialog({
          description: `Copied`,
          buttons: [{ label: 'Ok' }]
        });
      } catch (err) {
        showMessageDialog({
          description: `Error in copying ${err.message}`,
          buttons: [{ label: 'Ok' }]
        });
      }
    }
  }
};
</script>
