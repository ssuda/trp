<template>
  <component :is="printComponent" :doc="doc" :print-settings="printSettings" />
</template>

<script>
import Basic from './Templates/Basic';
import Minimal from './Templates/Minimal';
import Business from './Templates/Business';
import SpinBi from './Templates/SpinBi';

export default {
  name: 'InvoiceTemplate',
  props: ['doc', 'printSettings'],
  computed: {
    printComponent() {
      let type = this.printSettings.template;
      let templates = {
        Basic,
        Minimal,
        Business,
        SpinBi
      };
      if (!(type in templates)) {
        type = 'Basic';
      }
      return templates[type];
    }
  }
};
</script>
