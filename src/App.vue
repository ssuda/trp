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
import glob from 'glob';

import { connectToLocalDatabase, showMessageDialog, dbPath } from '@/utils';
import { getMainWindowSize } from '@/screenSize';
import config from '@/config';
import { DateTime } from 'luxon';
import SetupSync from '@/sync';

import PaymentForm from './components/Payment.vue';
import TermsAndConditions from './components/TermsAndConditions.vue';
import AdvancePayment from './components/AdvancePayment.vue';

const toBool = v => {
  v = v.toLowerCase();
  return v === 'true' || v === '1' || v === 'on';
};

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
        SetupWizard: [600, 650],
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
    await this.connectToDatabase();
    this.showSetupWizardOrDesk(false);
  },
  methods: {
    async connectToDatabase() {
      if (
        process.env.NODE_ENV === 'development' &&
        toBool(process.env.VUE_APP_DELETE_CONFIG)
      ) {
        try {
          console.log('setting lastSelectedFilePath to null');
          config.set('lastSelectedFilePath', null);
          config.set('files', null);
        } catch (ex) {
          console.error(ex);
        }
      }

      let dbpath = ':memory:';

      if (config.get('createNewCompany', false)) {
        config.set('createNewCompany', false);
      } else {
        const lastSelectedFilePath = config.get('lastSelectedFilePath', null);
        console.log('lastSelectedFilePath', lastSelectedFilePath);

        if (lastSelectedFilePath) {
          //   const files = glob.sync(`${remote.getGlobal('userData')}/*.db`);
          //   if (files.length) {
          //     dbpath = files[0];
          //   }
          // } else {
          dbpath = lastSelectedFilePath;
        }

        if (
          process.env.NODE_ENV === 'development' &&
          toBool(process.env.VUE_APP_DELETE_DB)
        ) {
          try {
            if (dbpath != ':memory:') {
              console.log('deleting db', dbpath);
              fs.unlinkSync(dbpath);
            }
          } catch (ex) {
            console.error(ex);
          }
          dbpath = ':memory:';
        }
      }

      try {
        await connectToLocalDatabase(dbpath);
      } catch (ex) {
        console.error(ex);
      }
    },

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
        let user;
        try {
          user = await Users.getCurrentUser(null, true);
        } catch (ex) {
          console.error(ex);
        }

        console.log('current user', user);

        if (!config.get('lastSelectedFilePath', null)) {
          console.log(
            'company',
            user.remote.data(),
            dbPath(user.remote.get('name'))
          );
          config.set('lastSelectedFilePath', dbPath(user.remote.get('name')));
          frappe.events.trigger('reload-main-window');
          return;
        }

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

            if (doc && doc.exists) {
              doc = doc.data();

              console.log('enabled', doc.enabled);
              if (!doc.enabled) {
                return showMessageDialog({
                  description: `Your Account is Disabled, Please contact SpinBi at ${frappe.globalConfig.customerCare.phoneNumber}`
                });
              }

              if (!doc.free) {
                if (!doc.advancePaymentReference) {
                  const billingStart = DateTime.fromJSDate(
                    doc.billingPeriodStart.toDate()
                  );

                  const startDuration = parseInt(
                    -billingStart.diffNow('days').days
                  );

                  console.log('billingStart', startDuration);

                  if (startDuration > frappe.globalConfig.gracePeriodDays) {
                    //make payment
                    await new Promise((resolve, reject) => {
                      this.$modal.show(
                        AdvancePayment,
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
                  } else if (startDuration >= 0) {
                    //warn users for payment
                    // await showMessageDialog({
                    //   description: `Your trail expired, please activate in ${frappe
                    //     .globalConfig.gracePeriodDays -
                    //     startDuration} days, please activate before to avoid disruption to your service`,
                    //   buttons: [{ label: 'Ok' }]
                    // });
                    await new Promise((resolve, reject) => {
                      this.$modal.show(
                        AdvancePayment,
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
                  }
                }
                const billingEnd = DateTime.fromJSDate(
                  doc.billingPeriodEnd.toDate()
                );
                const duration = parseInt(-billingEnd.diffNow('days').days);
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
                    description: `Your billing is pending, your service will be disabled in ${frappe
                      .globalConfig.gracePeriodDays -
                      duration} days, please pay before to avoid disruption to your service`,
                    buttons: [{ label: 'Ok' }]
                  });
                }
              }
            }
          } catch (ex) {
            console.error(ex);
          }

          SetupSync();

          if (comingFromSetupWizard && !isLogin) {
            // showMessageDialog({
            //   description: `Your billing will start in ${frappe.globalConfig.trialPeriodDays}days. There will be monthly subcription fee of ${frappe.globalConfig.price}`,
            //   buttons: [{ label: 'Ok' }]
            // });
            this.$modal.show(
              TermsAndConditions,
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
          }

          //if (process.env.NODE_ENV !== 'development') {
          frappe.events.trigger('open-browser', {
            credentials: {
              username: frappe.AccountingSettings.i3msUsername,
              password: frappe.AccountingSettings.i3msPassword
            },
            showBrowser: true
          });
          //}
          this.activeScreen = 'Desk';
        } else {
          this.activeScreen = 'LoginRegister';
        }

        this.checkForUpdates();
      }
      // if (resetRoute) {
      //   this.$router.replace('/');
      // }
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
