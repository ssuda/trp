<template>
  <label
    :style="style"
    :class="_class"
    class="focus:outline-none rounded-md shadow-button flex-center px-2 py-2 text-xs flex text-white bg-green-600 font-weight-bold cursor-pointer"
  >
    <feather-icon
      v-if="icon"
      name="upload"
      class="w-4 h-4 font-bold text-white mr-2"
    />
    <span v-if="value">Selected File: {{ value.name }}</span>
    <span v-else>{{ label || 'Select File' }} </span>
    <input
      ref="fileInput"
      class="hidden"
      type="file"
      @change="handleFileChange"
    />
  </label>
</template>

<script>
export default {
  props: {
    value: File,
    label: String,
    icon: {
      type: Boolean,
      default: true
    },
    disabled: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      default: 'primary'
    }
  },

  methods: {
    handleFileChange(e) {
      this.$emit('input', e.target.files[0]);
      this.$refs.fileInput.value = '';
    }
  },

  computed: {
    style() {
      return {
        padding: this.icon ? '6px 12px' : '6px 24px',
        'background-image':
          this.type === 'primary'
            ? 'linear-gradient(180deg, #2C9AF1 0%, #2490EF 100%)'
            : 'linear-gradient(180deg, #F9F9FA 0%, #F4F4F6 100%)'
      };
    },
    _class() {
      return {
        'opacity-50 cursor-not-allowed pointer-events-none': this.disabled
      };
    }
  }
};
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
