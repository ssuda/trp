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
      @setup-complete="isLogin => showSetupWizardOrDesk(true, isLogin)"
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
import { firestore } from '@/firebase';
import SetupSync from '@/sync';

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
    let user;
    try {
      user = await Users.getCurrentUser();
    } catch (ex) {
      console.error(ex);
    }

    console.log(user);
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
      } catch (ex) {}
    }
    await connectToLocalDatabase(dbpath);
    this.showSetupWizardOrDesk(false);
  },
  methods: {
    async showSetupWizardOrDesk(resetRoute = false, isLogin) {
      const { setupComplete } = frappe.AccountingSettings || {};
      if (!setupComplete && !isLogin) {
        this.activeScreen = 'SetupWizard';
      } else if (this.$route.path.startsWith('/settings')) {
        this.activeScreen = 'Settings';
      } else {
        //check whether he is logged in or not
        if (frappe.currentUser) {
          try {
            let user = frappe.currentUser;
            if (user.local && user.local.status != 'Active') {
              return showMessageDialog({
                description:
                  'Your account is disabled, please contact your administrator'
              });
            }
            const accountingSettings = frappe.AccountingSettings;
            let doc = user.fbAccount;
           
            let syncEnabled = false;

            if (doc && doc.exists) {
              doc = doc.data();

              syncEnabled = !!doc.syncEnabled;

              if (!doc.enabled) {
                return showMessageDialog({
                  description:
                    'Your Account is Disabled, Please contact SpinBi at 8105245255'
                });
              }

              const trailPeriod = DateTime.fromJSDate(
                doc.trialExpiresOn.toDate()
              );
              const trailDuration = parseInt(trailPeriod.diffNow('days').days);
              console.log('trailDuration', trailDuration);
              if (trailDuration == 0) {
                showMessageDialog({
                  description: 'Your billing started',
                  buttons: [{ label: 'Ok' }]
                });
              } else if (trailDuration > 7) {
                showMessageDialog({
                  description: `Your trail expires in ${trailDuration} day(s)`,
                  buttons: [{ label: 'Ok' }]
                });
              } else if (trailDuration < 0) {
                const billingEnd = DateTime.fromJSDate(
                  doc.billingPeriodEnd.toDate()
                );
                const duration = parseInt(-billingEnd.diffNow('days').days);
                console.log('billingEnd', duration);

                if (duration > doc.billingGracePeriod) {
                  //disable services
                  return showMessageDialog({
                    description:
                      'Your payment is pending, please pay immediately to enable the service'
                  });
                } else if (duration >= 0) {
                  //warn users for payment
                  await showMessageDialog({
                    description: `Your payment is pending, your service will be disabled in ${doc.billingGracePeriod -
                      duration} days, please pay before to avoid disruption to your serivce`,
                    buttons: [{ label: 'Ok' }]
                  });
                } else if (duration >= -2) {
                  //give info to the user
                  await showMessageDialog({
                    description: `Your billing period ends in ${-duration} day(s)`,
                    buttons: [{ label: 'Ok' }]
                  });
                }
              }
            }
          } catch (ex) {
            console.error(ex);
          }

          if (syncEnabled) {
            SetupSync();
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
