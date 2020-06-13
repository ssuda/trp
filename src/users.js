import {
  firebaseAuth,
  firebase,
  firestore,
  FieldValue,
  cloudfunctionsBaseUrl
} from '@/firebase';

import axios from 'axios';
import frappe from 'frappejs';
import { DateTime } from 'luxon';
import voucherCodes from 'voucher-code-generator';

import { dbPath } from '@/utils';
import config from '@/config';

function waitForUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(
      async user => {
        unsubscribe();
        resolve(user);
      },
      ex => {
        console.error(ex);
        unsubscribe();
        resolve(null);
      }
    );
  });
}

export default {
  async forgotPassword(emailAddress) {
    return firebaseAuth.sendPasswordResetEmail(emailAddress);
  },

  async getRemoteConfig() {
    if (!frappe.globalConfig) {
      const snapshot = await firestore.collection('config').get();
      if (snapshot.size) {
        frappe.globalConfig = snapshot.docs[0].data();
      }
    }
  },

  async getCurrentUser(gstin, refresh = false) {
    console.log('fetching remote config');
    await this.getRemoteConfig();

    if (!gstin) {
      const accountingSettings = frappe.AccountingSettings || {};
      gstin = accountingSettings.gstin;
    }

    let user = (frappe.currentUser = firebaseAuth.currentUser);
    if (!user) {
      console.log('Waiting for user');
      user = frappe.currentUser = await waitForUser();
    }

    console.log('User after Waiting', user);

    if (user) {
      try {
        if (!user.token) {
          user.token = await user.getIdToken(true);
          console.log('user token', user.token);
        }

        if (frappe.db && !user.local) {
          console.log('Fetching spinbi user');
          try {
            user.local = await frappe.getDoc('SpinBiUser', user.email);
          } catch (ex) {}

          if (!user.local) {
            const snapshot = await firestore
              .collection('SpinBiUser')
              .doc(user.email)
              .get();

            if (snapshot && snapshot.exists) {
              user.local = snapshot.data();
              const companies = user.local.companies.filter(Boolean);
              console.log('companies', companies);
              if (companies) {
                config.set(
                  'files',
                  companies.map(c => ({
                    companyName: c,
                    filePath: dbPath(c)
                  }))
                );
              }
            }
          }

          console.log('spinbiuser', user.local);

          if (!gstin) {
            gstin = user.local.gstin;
          }
        }

        if (gstin && !user.remote) {
          console.log('Fetching company info');

          user.remote = await firestore
            .collection('customers')
            .doc(gstin)
            .get();

          let now = DateTime.local();

          let end = DateTime.fromJSDate(
            user.remote.get('billingPeriodEnd').toDate()
          );

          let start = DateTime.fromJSDate(
            user.remote.get('billingPeriodStart').toDate()
          );

          if (
            now.startOf('day') > end.startOf('day') &&
            !user.remote.get('billingTagged')
          ) {
            user.remote.ref.update({
              billingTagged: user.remote.get('tagged'),
              tagged: 0
            });
          } else if (
            now.startOf('day') >= start.startOf('day') &&
            !user.remote.get('trailEnded')
          ) {
            user.remote.ref.update({
              tagged: 0,
              trailEnded: true
            });
          }
        }
      } catch (ex) {
        console.error(ex);
      }
    }

    console.log('user', user, gstin);
    if (user) {
      user.gstin = gstin;
    }
    return user;
  },

  async login(email, password) {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    return this.getCurrentUser();
  },

  async logout() {
    try {
      await firebaseAuth.signOut();
      frappe.currentUser = null;
    } catch (ex) {
      console.error(ex);
    }
  },

  async signup(user) {
    const { email, password } = user;

    await this.logout();

    try {
      await firebaseAuth.createUserWithEmailAndPassword(email, password);
    } catch (ex) {
      console.error(ex);
      await firebaseAuth.signInWithEmailAndPassword(email, password);
    }

    let fbuser = await this.getCurrentUser(user.gstin);

    if (process.env.NODE_ENV !== 'development') {
      if (fbuser.remote && fbuser.remote.exists) {
        throw new Error('This company already registered, please login');
      }
    }

    await this.createNewCustomer(user);

    //update referal bonus
    if (user.referalCode) {
      this.updateReferalBonus(user.referalCode);
    }

    console.log('Before reauth');
    const credential = firebase.auth.EmailAuthProvider.credential(
      email,
      password
    );

    await fbuser.reauthenticateWithCredential(credential);
    frappe.currentUser && (frappe.currentUser.remote = null);
    fbuser = await this.getCurrentUser(user.gstin);

    await this.updateUsersWithNewCompanyNameAndGstin(user);
    console.log(frappe.currentUser);
    return fbuser;
  },

  async createNewCustomer(user) {
    console.log('creating company', user);
    let referalCode = voucherCodes.generate({
      length: 8
    })[0];

    //store in firestore
    firestore
      .collection('customers')
      .doc(user.gstin)
      .set({
        enabled: true,
        name: user.companyName,
        email: user.email,
        gstin: user.gstin,
        phoneNumber: user.phoneNumber,
        referalBonus: 0,
        referalCode,
        tagged: 0,
        signupDate: new Date(),
        billingTagged: 0,
        trailExpiryDate: DateTime.local()
          .plus({ days: frappe.globalConfig.trialPeriodDays })
          .toJSDate(),
        billingPeriodStart: DateTime.local()
          .plus({ days: frappe.globalConfig.trialPeriodDays })
          .toJSDate(),
        billingPeriodEnd: DateTime.local()
          .plus({ days: frappe.globalConfig.trialPeriodDays - 1, months: 1 })
          .toJSDate(),
        billingGracePeriod: frappe.globalConfig.gracePeriodDays
      });
  },

  async updateReferalBonus(referalCode) {
    let users = await firestore
      .collection('customers')
      .where('referalCode', '==', referalCode)
      .get();

    let user = users.docs[0];

    try {
      //store in firestore
      await user.ref.update({
        referalBonus: firebase.firestore.FieldValue.increment(1000)
      });
    } catch (ex) {
      console.error(ex);
    }
  },

  async updateUsersWithNewCompanyNameAndGstin(user) {
    const remoteUser = await firestore
      .collection('SpinBiUser')
      .doc(user.email)
      .get();

    console.log('remoteUser', remoteUser.data());

    if (remoteUser && remoteUser.exists && remoteUser.get('gstin')) {
      let setOptions = { merge: true };
      let newDocumentBody = {
        gstins: FieldValue.arrayUnion(frappe.AccountingSettings.gstin),
        companies: FieldValue.arrayUnion(frappe.AccountingSettings.companyName)
      };

      firestore
        .collection('SpinBiUser')
        .where('gstins', 'array-contains', remoteUser.get('gstin'))
        .get()
        .then(response => {
          let batch = firestore.batch();
          response.docs.forEach(doc => {
            const docRef = firestore.collection('SpinBiUser').doc(doc.id);
            batch.set(docRef, newDocumentBody, setOptions);
          });
          batch.commit().then(() => {
            console.log(`updated all documents inside SpinBiUser`);
          });
        });
    }
  },

  async updatePayment(paymentReference, billingDetails) {
    let user = frappe.currentUser.remote.data();

    console.log('user', user);
    console.log('updating billing details', paymentReference);

    const billingStart = DateTime.fromJSDate(
      user.billingPeriodStart.toDate()
    ).plus({ months: 1 });
    const billingEnd = DateTime.fromJSDate(
      user.billingPeriodEnd.toDate()
    ).plus({ months: 1 });

    try {
      //store in firestore
      await firestore
        .collection('customers')
        .doc(user.gstin)
        .update({
          billingTagged: 0,
          referalBonus: 0,
          paymentReference,
          enabled: true,
          billingPeriodStart: billingStart.toJSDate(),
          billingPeriodEnd: billingEnd.toJSDate()
        });

      firestore.collection('payments').add({
        gstin: user.gstin,
        paymentDate: DateTime.local().toJSDate(),
        ...billingDetails
      });
    } catch (ex) {
      console.error(ex);
    }
  },

  async updateAdvancePayment(advancePaymentReference) {
    let user = frappe.currentUser.remote.data();

    console.log('user', user);
    console.log('updating billing details', advancePaymentReference);

    try {
      //store in firestore
      await firestore
        .collection('customers')
        .doc(user.gstin)
        .update({
          advancePaymentReference,
          enabled: true
        });

      firestore.collection('payments').add({
        paymentReference: advancePaymentReference,
        gstin: user.gstin,
        paymentDate: DateTime.local().toJSDate(),
        type: 'advance'
      });
    } catch (ex) {
      console.error(ex);
    }
  },

  async createUser(user) {
    const fbuser = await this.getCurrentUser();
    const response = await axios.post(
      `${cloudfunctionsBaseUrl}/createUser`,
      {
        email: user.name,
        password: user.password,
        displayName: user.fullName,
        disabled: false
      },
      {
        headers: {
          Authorization: 'Bearer ' + fbuser.token
        }
      }
    );

    console.log('response for createUser', response);
    return response.data.uid;
  },

  async updateUser(user) {
    const fbuser = await this.getCurrentUser();
    await axios.post(
      `${cloudfunctionsBaseUrl}/updateUser/${user.userId}`,
      {
        email: user.name,
        password: user.password,
        displayName: user.fullName,
        disabled: user.status !== 'Active'
      },
      {
        headers: {
          Authorization: 'Bearer ' + fbuser.token
        }
      }
    );
  },

  async deleteUser(user) {
    const fbuser = await this.getCurrentUser();
    await axios.delete(`${cloudfunctionsBaseUrl}/deleteUser/${user.userId}`, {
      headers: {
        Authorization: 'Bearer ' + fbuser.token
      }
    });
  }
};
