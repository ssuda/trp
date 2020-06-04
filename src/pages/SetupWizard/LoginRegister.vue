<template>
  <div class="flex-1 py-10 bg-white window-drag">
    <div class="px-12">
      <h1 class="text-2xl font-semibold">{{ _('Login') }}</h1>
    </div>
    <div class="px-8 mt-5 window-no-drag" v-if="doc">
      <TwoColumnForm :fields="fields" :doc="doc" />
    </div>
    <div
      class="flex flex-1 items-center justify-between mr-8 mt-5 window-no-drag"
    >
      <div class=""></div>
      <button
        @click="forgotPassword"
        class="cursor-pointer text-sm text-blue-700"
      >
        {{ _('Forgot Password?') }}
      </button>
      <Button
        @click="submit"
        type="primary"
        class="text-sm text-white"
        :disabled="!valuesFilled || loading"
      >
        {{ buttonText }}
      </Button>
    </div>
  </div>
</template>
<script>
import frappe from 'frappejs';
import TwoColumnForm from '@/components/TwoColumnForm';
import FormControl from '@/components/Controls/FormControl';
import Button from '@/components/Button';
import Popover from '@/components/Popover';
import Users from '@/users';

import {
  getErrorMessage,
  handleErrorWithDialog,
  showMessageDialog
} from '@/utils';

export default {
  name: 'LoginRegister',
  data() {
    return {
      login: true,
      doc: null,
      loading: false,
      valuesFilled: false,
      emailError: null
    };
  },
  provide() {
    return {
      doctype: 'LoginRegister',
      name: 'LoginRegister'
    };
  },
  components: {
    TwoColumnForm,
    FormControl,
    Button,
    Popover
  },
  async mounted() {
    this.doc = await frappe.newDoc({ doctype: 'LoginRegister' });
    this.doc.on('change', () => {
      this.valuesFilled = this.allValuesFilled();
      console.log('change called', this.valuesFilled, this.fields);
    });
  },
  methods: {
    async forgotPassword() {
      if (!this.doc.email) {
        this.$notify({
          type: 'error',
          group: 'trp',
          title: this._('Please enter email')
        });
        return;
      }

      this.loading = true;
      this.resetEmail = true;
      await Users.forgotPassword(this.doc.email);
      this.resetEmail = false;
      this.loading = false;
      showMessageDialog({
        description: this._('Please check your email and reset password')
      });
    },
    allValuesFilled() {
      let values = this.fields.map(f => this.doc[f.fieldname]);
      return values.every(Boolean);
    },
    async submit() {
      if (!this.allValuesFilled()) {
        this.$notify({
          type: 'error',
          group: 'trp',
          title: this._('Please fill all values')
        });
        return;
      }
      try {
        this.loading = true;
        await Users.login(this.doc.email, this.doc.password);
        //await onlyConnectToRemoteDatabase();
        this.$emit('login-complete');
      } catch (e) {
        this.loading = false;
        handleErrorWithDialog(e, this.doc);
      }
    }
  },
  computed: {
    meta() {
      return frappe.getMeta('LoginRegister');
    },
    fields() {
      return this.meta.getQuickEditFields();
    },
    buttonText() {
      return this.loading
        ? this.resetEmail
          ? this._('Sending reset email...')
          : this._('Logging in...')
        : this._('Next');
    }
  }
};
</script>
