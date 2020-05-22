<template>
  <Dropdown
    v-if="actions && actions.length"
    class="text-xs"
    :items="actions"
    right
  >
    <template v-slot="{ toggleDropdown }">
      <Button class="text-md text-base" :icon="true" @click="toggleDropdown()">
        <feather-icon
          name="more-horizontal"
          class="w-4 h-4 mr-2 stroke-current text-gray-800"
        />
        More
      </Button>
    </template>
  </Dropdown>
</template>

<script>
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';

export default {
  name: 'DropdownWithActions',
  props: ['actions'],
  components: {
    Dropdown,
    Button
  }
};
</script>
