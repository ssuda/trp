<template>
  <div class="flex flex-col">
    <PageHeader>
      <h1 slot="title" class="text-2xl font-bold">{{ _('Customer Care') }}</h1>
    </PageHeader>
    <div class="px-8 my-8">
      <p>Email: <span class="font-bold">support@spinbi.com</span></p>
      <p>Phone: <span class="font-bold">8105245255</span></p>
    </div>
  </div>
</template>

<script>
import PageHeader from '@/components/PageHeader';

export default {
  name: 'CustomerCare',
  components: {
    PageHeader
  }
};
</script>
