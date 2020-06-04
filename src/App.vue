<template>
  <div
    id="app"
    class="h-screen flex flex-col font-sans overflow-hidden antialiased"
  >
    <WindowsTitleBar
      v-if="platform === 'Windows'"
      @close="reloadMainWindowOnSettingsClose"
    />
    <Desk class="flex-1" v-if="activeScreen === 'Desk'" />
    <DatabaseSelector
      v-if="activeScreen === 'DatabaseSelector'"
      @database-connect="showSetupWizardOrDesk(true)"
    />
    <SetupWizard
      v-if="activeScreen === 'SetupWizard'"
      @setup-complete="isLogin => showSetupWizardOrDesk(true, isLogin, true)"
    />
    <LoginRegister
      v-if="activeScreen === 'LoginRegister'"
      @login-complete="showSetupWizardOrDesk(true, true)"
    />
    <Settings v-if="activeScreen === 'Settings'" />
    <portal-target name="popovers" multiple></portal-target>
    <notifications group="trp" position="bottom center" />
    <v-dialog />
  </div>
</template>

<script>
import './styles/index.css';
import 'frappe-charts/dist/frappe-charts.min.css';
import frappe from 'frappejs';
import Users from '@/users';
import Desk from './pages/Desk';
import SetupWizard from './pages/SetupWizard/SetupWizard';
import DatabaseSelector from './pages/DatabaseSelector';
import Settings from '@/pages/Settings/Settings.vue';
import WindowsTitleBar from '@/components/WindowsTitleBar';
import LoginRegister from './pages/SetupWizard/LoginRegister';
import Vue from 'vue';
import { remote } from 'electron';
import path from 'path';
import fs from 'fs';

import { connectToLocalDatabase, showMessageDialog } from '@/utils';
import { getMainWindowSize } from '@/screenSize';
//import config from '@/config';
import { DateTime } from 'luxon';
import SetupSync from '@/sync';

import PaymentForm from './components/Payment.vue';

export default {
  name: 'App',
  data() {
    return {
      activeScreen: null
    };
  },
  watch: {
    activeScreen(value) {
      if (!value) return;
      let { width, height } = getMainWindowSize();
      let size = {
        Desk: [width, height],
        DatabaseSelector: [600, 600],
        SetupWizard: [600, 550],
        Settings: [460, 577],
        LoginRegister: [600, 600]
      }[value];
      let resizable = value === 'Desk';

      let win = remote.getCurrentWindow();
      if (size.length) {
        win.setSize(...size);
        win.setResizable(resizable);
      }
    }
  },
  components: {
    Desk,
    SetupWizard,
    DatabaseSelector,
    Settings,
    WindowsTitleBar,
    LoginRegister
  },
  async mounted() {
    Vue.modal = this.$modal;

    const dbpath = path.join(remote.getGlobal('userData'), 'spin-trp.db');
    const toBool = v => {
      v = v.toLowerCase();
      return v === 'true' || v === '1' || v === 'on';
    };

    if (
      process.env.NODE_ENV === 'development' &&
      toBool(process.env.VUE_APP_DELETE_DB)
    ) {
      try {
        console.log('deleting db');
        fs.unlinkSync(dbpath);
      } catch (ex) {
        console.error(ex);
      }
    }

    try {
      await connectToLocalDatabase(dbpath);
    } catch (ex) {
      console.error(ex);
    }

    this.showSetupWizardOrDesk(false);
  },
  methods: {
    async showSetupWizardOrDesk(
      resetRoute = false,
      isLogin,
      comingFromSetupWizard
    ) {
      const { setupComplete } = frappe.AccountingSettings || {};
      console.log('setupcomplete', setupComplete);
      if (!setupComplete && !isLogin) {
        this.activeScreen = 'SetupWizard';
      } else if (this.$route.path.startsWith('/settings')) {
        this.activeScreen = 'Settings';
      } else {
        let syncEnabled = false;
        let user;
        try {
          user = await Users.getCurrentUser(null, true);
        } catch (ex) {
          console.error(ex);
        }

        console.log('current user', user);
        //check whether he is logged in or not
        if (user) {
          try {
            if (user.local && user.local.status != 'Active') {
              return showMessageDialog({
                description:
                  'Your account is disabled, please contact your administrator'
              });
            }
            let doc = user.remote;

            console.log(doc, doc.exists);
            if (doc && doc.exists) {
              doc = doc.data();

              syncEnabled = !!doc.syncEnabled;

              console.log('enabled', doc.enabled);
              if (!doc.enabled) {
                return showMessageDialog({
                  description:
                    'Your Account is Disabled, Please contact SpinBi at 8105245255'
                });
              }

              const billingStart = DateTime.fromJSDate(
                doc.billingPeriodStart.toDate()
              );
              const duration = parseInt(-billingStart.diffNow('days').days);
              console.log('billingEnd', duration);

              if (duration > frappe.globalConfig.gracePeriodDays) {
                //make payment
                await new Promise((resolve, reject) => {
                  this.$modal.show(
                    PaymentForm,
                    {},
                    {
                      height: 'auto'
                    },
                    {
                      'before-close': event => {
                        resolve();
                      }
                    }
                  );
                });
              } else if (duration >= 0) {
                //warn users for payment
                await showMessageDialog({
                  description: `Your recharge is pending, your service will be disabled in ${frappe
                    .globalConfig.gracePeriodDays -
                    duration} days, please pay before to avoid disruption to your service`,
                  buttons: [{ label: 'Ok' }]
                });
              }
            }
          } catch (ex) {
            console.error(ex);
          }

          //if (syncEnabled) {
          SetupSync();
          //}

          if (comingFromSetupWizard && !isLogin) {
            showMessageDialog({
              description: `Your billing will start in ${frappe.globalConfig.trialPeriodDays}days. There will be monthly subcription fee of ${frappe.globalConfig.price}`,
              buttons: [{ label: 'Ok' }]
            });
          }
          this.activeScreen = 'Desk';
        } else {
          this.activeScreen = 'LoginRegister';
        }
        this.checkForUpdates();
      }
      if (resetRoute) {
        this.$router.replace('/');
      }
    },
    reloadMainWindowOnSettingsClose() {
      if (this.activeScreen === 'Settings') {
        frappe.events.trigger('reload-main-window');
      }
    },
    checkForUpdates() {
      frappe.events.trigger('check-for-updates');
    }
  }
};
</script>
