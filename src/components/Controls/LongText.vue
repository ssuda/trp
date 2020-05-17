<template>
  <div>
    <div class="text-gray-600 text-sm mb-1" v-if="showLabel">
      {{ df.label }}
    </div>
    <textarea
      ref="input"
      rows="3"
      :class="[inputClasses]"
      :value="value"
      :placeholder="inputPlaceholder"
      :readonly="isReadOnly"
      @blur="e => triggerChange(e.target.value)"
      @focus="e => $emit('focus', e)"
      @input="e => $emit('input', e)"
    ></textarea>
  </div>
</template>

<script>
import Base from './Base';

export default {
  name: 'Text',
  extends: Base
};
</script>

<style scoped>
textarea {
    min-height: 20rem;
    max-height: 50rem;
    overflow: auto;
}
</style>
