<template>
  <label>
    <div class=" focus:outline-none rounded-md shadow-button flex-center px-2 py-1 text-md flex text-white bg-green-600 font-weight-bold cursor-pointer">
      <feather-icon name="upload" class="w-4 h-4 font-weight-bold text-white" />
      <span v-if="value">Selected File: {{value.name}}</span>
      <span v-else>{{ label || 'Select File' }} </span>
    </div>
    <input class="hidden" type="file" @change="handleFileChange"/>
  </label>
</template>

<script>
export default {
  props: {
    value: File,
    label: String
  },

  methods: {
    handleFileChange(e) {
      this.$emit('input', e.target.files[0])
    }
  }
}
</script>

<style scoped>
/* .file-select > .select-button {
  padding: 1rem;

  color: white;
  background-color: #2EA169;

  border-radius: .3rem;

  text-align: center;
  font-weight: bold; 
}*/
</style>