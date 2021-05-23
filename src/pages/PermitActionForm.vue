<template>
  <div class="flex flex-col" v-if="doc">
    <PageHeader>
      <BackLink slot="title" />
    </PageHeader>
    <div class="flex justify-center flex-1 mb-8 mt-2" v-if="meta">
      <div
        class="border rounded-lg shadow h-full flex flex-col justify-between"
        style="width: 600px"
      >
        <div>
          <div class="px-6 pt-6" v-if="doc.permit">
            <div class="flex text-sm text-gray-900 border-b pb-4">
              <div class="w-1/3">
                <div class="text-xl text-gray-700 font-semibold">
                  {{ doc.permit.name }}
                </div>
              </div>
            </div>
          </div>
          <div class="mt-8 px-6">
            <h1 class="text-2xl font-semibold">
              {{ doc.label }}
            </h1>
            <div class="flex justify-between mt-2">
              <div class="w-1/3">
                <!-- <FormControl
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('showBrowser')"
                  :value="doc.showBrowser"
                  :showLabel="true"
                  @change="value => doc.set('showBrowser', value)"
                /> -->

                <FormControl
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('numBrowsers')"
                  :value="doc.numBrowsers"
                  :showLabel="true"
                  v-if="doc.action == 'tagging'"
                  @change="value => doc.set('numBrowsers', value)"
                />

                <FormControl
                  v-if="doc.action == 'tagging' && !doc.permit"
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('taggingUrl')"
                  :value="doc.taggingUrl"
                  @change="value => doc.set('taggingUrl', value)"
                />
                <FormControl
                  v-if="doc.action == 'tagging'"
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('truckList')"
                  :value="doc.truckList"
                  @change="value => doc.set('truckList', value)"
                />
                <FormControl
                  v-if="doc.action == 'release' || doc.action == 'tagging'"
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('trucks')"
                  :value="doc.trucks"
                  placeholder="Paste the trucks"
                  @change="value => doc.set('trucks', value)"
                />
              </div>

              <div class="w-1/3">
                <FormControl
                  v-if="doc.action == 'tagging'"
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('scheduledAt')"
                  :value="doc.scheduledAt"
                  :showLabel="true"
                  @change="value => doc.set('scheduledAt', value)"
                />

                <FormControl
                  v-if="doc.action == 'tagging'"
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('isCloudTagging')"
                  :value="doc.isCloudTagging"
                  :showLabel="true"
                  @change="value => doc.set('isCloudTagging', value)"
                />

                <!-- <FormControl
                  v-if="
                    doc.action == 'tagging' &&
                      frappe.currentUser.email == 'samba@spinbi.com'
                  "
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('gstin')"
                  :value="doc.gstin"
                  :show-label="true"
                  @change="value => doc.set('gstin', value)"
                /> -->

                <FormControl
                  v-if="
                    doc.action == 'tagging' &&
                      frappe.currentUser.email == 'samba@spinbi.com'
                  "
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('username')"
                  :value="doc.username"
                  :show-label="true"
                  @change="value => doc.set('username', value)"
                />
                <FormControl
                  v-if="
                    doc.action == 'tagging' &&
                      frappe.currentUser.email == 'samba@spinbi.com'
                  "
                  class="mt-4 text-base"
                  input-class="bg-gray-100 px-3 py-2 text-base"
                  :df="meta.getField('password')"
                  :value="doc.password"
                  :show-label="true"
                  @change="value => doc.set('password', value)"
                />
              </div>
            </div>
          </div>
          <div class="flex px-6 mt-10 window-no-drag">
            <Button
              @click="onClick"
              type="primary"
              class="text-sm text-white"
              :disabled="loading"
            >
              {{ buttonText }}
            </Button>
          </div>

          <div
            class="flex text-sm px-6 mt-5 window-no-drag"
            v-if="doc.action === 'tagging'"
          >
            <p>Total: {{ total }}</p>
            <p class="ml-8">Success: {{ success }}</p>
            <p class="ml-8">Failed: {{ failed }}</p>
            <p class="ml-8">Duration: {{ duration }}</p>
          </div>
          <div
            class="px-8 mt-5 font-medium text-green-600"
            v-if="doc.action === 'tagging'"
          >
            <p>{{ message }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
import frappe from 'frappejs';
const { DateTime, Interval } = require('luxon');
import PageHeader from '@/components/PageHeader';
import Button from '@/components/Button';
import FormControl from '@/components/Controls/FormControl';
import BackLink from '@/components/BackLink';
import _ from 'lodash';
import isOnline from 'is-online';

import sqsSend from '@/sqsSend';
import { firestore } from '@/firebase';

import {
  handleErrorWithDialog,
  showMessageDialog,
  extractTrucks,
  splitToChunks,
  delay
} from '@/utils';

import { refreshPermit, twoMonthsOldPermits, pickPermitFields } from '@/permit';

function makeid(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export default {
  name: 'PermitActionForm',
  props: ['name'],
  components: {
    PageHeader,
    Button,
    FormControl,
    BackLink
  },

  data() {
    return {
      doc: null,
      loading: false,
      failed: 0,
      total: 0,
      duration: '',
      message: ''
    };
  },
  computed: {
    meta() {
      return frappe.getMeta('PermitAction');
    },
    buttonText() {
      return this.loading
        ? this._(`${this.doc.buttonText}...`)
        : this._('Next');
    },
    success() {
      if (this.total && this.failed) {
        return parseInt(this.total) - parseInt(this.failed);
      }

      if (this.total) {
        return parseInt(this.total);
      }

      if (this.failed) {
        return 0;
      }

      return '';
    }
  },
  async created() {
    try {
      this.doc = await frappe.getDoc('PermitAction', this.name);
    } catch (error) {
      console.log(error);
      if (error instanceof frappe.errors.NotFoundError) {
        this.routeToList();
        return;
      }
      this.handleError(error);
    }
  },

  methods: {
    async onClick() {
      let tempTaggingDoc;

      this.loading = true;

      const username =
        this.doc.username || frappe.AccountingSettings.i3msUsername;
      const password =
        this.doc.password || frappe.AccountingSettings.i3msPassword;

      if (!username || !password) {
        await showMessageDialog({
          description: this._('Please enter i3ms username/password.'),
          buttons: [
            {
              label: _('Ok')
            }
          ]
        });

        this.$router.replace('/i3msAccount');
        return;
      }

      let online = await isOnline();
      if (!online) {
        this.loading = false;
        return showMessageDialog({
          description: this._('No Internet Connectivity, please check.'),
          buttons: [
            {
              label: _('Ok')
            }
          ]
        });
      }

      const credentials = {
        username,
        password
      };

      const permit = pickPermitFields(this.doc.permit || {});

      if (this.doc.action === 'fetchNew') {
        let permits = await twoMonthsOldPermits();

        frappe.events.trigger('permits-details', {
          credentials,
          permits,
          showBrowser: this.doc.showBrowser
        });

        frappe.events.once('permits-details-results', async () => {
          this.loading = false;
          await showMessageDialog({
            description: 'Permits fetched successfully',
            buttons: [{ label: 'Ok' }]
          });
          this.$router.back();
        });
      } else if (this.doc.action === 'tagging') {
        const startTimer = DateTime.local();

        if (!this.doc.truckList && !this.doc.trucks) {
          showMessageDialog({ message: this._('Please provide trucks') });
          this.loading = false;
          return;
        }

        if (this.doc.numBrowsers > 20) {
          showMessageDialog({
            message: this._('Number of browsers not more than 20')
          });
          this.loading = false;
          return;
        }

        let trucks;

        if (this.doc.truckList) {
          const truckList = await frappe.getDoc(
            'TruckList',
            this.doc.truckList
          );
          console.log(truckList);
          trucks = truckList.trucks.split('\n').filter(Boolean);
        } else {
          trucks = extractTrucks(this.doc.trucks);
        }

        let taggedObj = permit.tagged ? JSON.parse(permit.tagged) : {};
        let tagged = Object.keys(taggedObj);
        trucks = _.difference(trucks, tagged);

        this.total = tagged.length;
        this.failed = tagged.filter(t => taggedObj[t]).length;

        console.log(
          'Trucks remaining',
          taggedObj,
          this.total,
          this.failed,
          trucks.length
        );

        let obj = {
          credentials,
          trucks,
          showBrowser: this.doc.showBrowser,
          numBrowsers: this.doc.numBrowsers
        };

        if (this.doc.permit) {
          obj = {
            ...obj,
            ...permit
          };
        } else {
          obj.taggingUrl = this.doc.taggingUrl;

          // if (!this.doc.isCloudTagging) {
          //   let ret = await new Promise((resolve, reject) => {
          //     refreshPermit(
          //       {
          //         ...obj,
          //         noTrips: true,
          //         validate: true
          //       },
          //       p => {
          //         resolve(p);
          //       }
          //     );
          //   });

          //   if (!ret) {
          //     showMessageDialog({
          //       description: this._(
          //         'No Permit to tag vehicles, please check in i3ms'
          //       ),
          //       buttons: [
          //         {
          //           label: _('Ok')
          //         }
          //       ]
          //     });
          //     this.loading = false;
          //     return;
          //   }
          // }
        }

        if (trucks.length) {
          let timerInterval = setInterval(() => {
            const endTimer = DateTime.local();
            this.duration = Interval.fromDateTimes(startTimer, endTimer)
              .toDuration()
              .toFormat("hh'h':mm'm':ss's'");
          }, 1000);

          this.loading = true;

          if (this.doc.isCloudTagging) {
            let input = _.pick(obj, [
              'credentials',
              'trucks',
              'name',
              'numBrowsers',
              'taggingUrl'
            ]);

            if (frappe.currentUser.email == 'samba@spinbi.com') {
              input.gstin = makeid('24AAACC1206D1ZM'.length);
            } else {
              input.gstin = frappe.AccountingSettings.gstin;
            }
            input.deviceId = frappe.deviceId;
            input.retry = !!this.doc.permit;

            const self = this;
            let firstTime = true;

            let total = this.total;
            let failed = this.failed;

            if (input.taggingUrl) {
              input.taggingUrl = input.taggingUrl.trim();

              if (!/^http/i.test(input.taggingUrl)) {
                input.taggingUrl =
                  'https://i3ms.odishaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx?' +
                  input.taggingUrl;
              } else if (input.taggingUrl.includes('VehicleDetails.aspx')) {
                const query = input.taggingUrl.substr(
                  input.taggingUrl.lastIndexOf('?')
                );
                input.taggingUrl =
                  'https://i3ms.odishaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx' +
                  query;
              }

              firestore
                .collection('i3msCloudTaggingResult')
                .where('gstin', '==', input.gstin)
                .where('deviceId', '==', input.deviceId)
                .onSnapshot(async function(querySnapshot) {
                  for (let doc of querySnapshot.docs) {
                    if (firstTime) {
                      doc.ref.delete();
                      continue;
                    }
                    const data = doc.data();
                    if (
                      data.name == input.name ||
                      data.taggingUrl == input.taggingUrl ||
                      !(input.name || input.taggingUrl)
                    ) {
                      self.total =
                        (data.success || 0) + (data.failed || 0) + total;
                      self.failed = (data.failed || 0) + failed;

                      if (data.completed) {
                        clearInterval(timerInterval);
                        self.loading = false;
                        await showMessageDialog({
                          description: `${self.success} Vehicles Tagged successfully`,
                          buttons: [{ label: 'Ok' }]
                        });

                        // delete tempTagging
                        if (tempTaggingDoc) {
                          await tempTaggingDoc.delete();
                        }

                        refreshPermit(obj);
                        // if (frappe.currentUser.email != 'samba@spinbi.com') {
                        //   self.$router.back();
                        // }
                      }
                    }
                  }
                  firstTime = false;
                });
            }

            console.log('Adding cloud tagging input', input);
            //input.trucks = trucks;
            // if (input.taggingUrl) {
            //   await firestore.collection('i3msCloudTagging').add(input);
            // } else {
            //   tempTaggingDoc = await firestore
            //     .collection('tempTagging')
            //     .add(input);
            //   this.loading = false;
            // }
            this.loading = false;

            let chunks = _.chunk(
              trucks,
              Math.ceil(trucks.length / input.numBrowsers)
            );

            if (this.doc.scheduledAt) {
              const scheduledAt = DateTime.fromFormat(
                this.doc.scheduledAt,
                'h:m a'
              );
              const diff = scheduledAt.diffNow('milliseconds');

              console.log('scheduling in', diff.milliseconds);

              if (diff.milliseconds > 0) {
                await delay(diff.milliseconds);
              }
            }

            for (let chunk of chunks) {
              console.log('Submitting chunk');
              input.trucks = chunk;
              input.totalVehicles = trucks.length;
              await sqsSend('i3ms-tag-request', input);
            }
            showMessageDialog({
              description: `Submitted Tag request for ${trucks.length} for ${input.taggingUrl} Successfully`,
              buttons: [{ label: 'Ok' }]
            });
          } else {
            frappe.events.trigger('tag-vehicles', obj);
            const totalCb = total => {
              console.log('received total', this.total, total);
              this.total += parseInt(total);
            };

            const failedCb = failed => {
              console.log('received failed', failed);
              this.failed += parseInt(failed);
            };

            frappe.events.off('total', totalCb);
            frappe.events.off('failed', failedCb);

            frappe.events.on('total', totalCb);
            frappe.events.on('failed', failedCb);

            frappe.events.once('tag-results', async () => {
              clearInterval(timerInterval);
              this.loading = false;
              frappe.events.off('total', totalCb);
              frappe.events.off('failed', failedCb);
              await showMessageDialog({
                description: `${this.success} Vehicles Tagged successfully`,
                buttons: [{ label: 'Ok' }]
              });

              this.$router.back();
            });
          }
        } else {
          showMessageDialog({
            description: this._('All Trucks Already Tagged'),
            buttons: [
              {
                label: _('Ok')
              }
            ]
          });
          this.loading = false;
          return;
        }
      } else if (this.doc.action === 'release') {
        let trucks = extractTrucks(this.doc.trucks);

        if (trucks.length) {
          this.loading = true;
          frappe.events.trigger('release-vehicles', {
            credentials,
            ...permit,
            trucks,
            showBrowser: this.doc.showBrowser
          });

          frappe.events.once('release-vehicles-results', async () => {
            this.loading = false;
            await showMessageDialog({
              description: `${trucks.length} Vehicles Released successfully`,
              buttons: [{ label: 'Ok' }]
            });
            this.$router.back();
          });
        } else {
          showMessageDialog({
            description: this._('No Trucks to release'),
            buttons: [
              {
                label: _('Ok')
              }
            ]
          });
          this.loading = false;
          return;
        }
      } else if (this.doc.action === 'refresh') {
        //call permit refresh
        refreshPermit(
          {
            ...permit,
            showBrowser: this.doc.showBrowser
          },
          async () => {
            this.loading = false;
            await showMessageDialog({
              description: `Permit ${this.doc.permit.name} Refreshed from i3ms successfully`,
              buttons: [{ label: 'Ok' }]
            });
            this.$router.back();
          }
        );
      }
    },

    handleError(e) {
      handleErrorWithDialog(e, this.doc);
    },

    routeToList() {
      this.$router.push(`/list/Permit`);
    }
  }
};
</script>

<style scoped>
hr {
  border: none;
  border-top: 2px dotted #f00;
  color: #fff;
  background-color: #fff;
  height: 1px;
  width: 100%;
}
</style>
