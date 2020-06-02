import {
  firebaseAuth,
  firebase,
  firestore,
  cloudfunctionsBaseUrl
} from '@/firebase';

import axios from 'axios';
import frappe from 'frappejs';
import { DateTime } from 'luxon';

function waitForUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(
      async user => {
        unsubscribe();
        try {
          user.token = await user.getIdToken(true);
          if (frappe.db) {
            user.local = await frappe.getDoc('SpinBiUser', user.email);
          }
        } catch (ex) {}
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

  async getCurrentUser(gstin) {
    if (!gstin) {
      const accountingSettings = frappe.AccountingSettings || {};
      gstin = accountingSettings.gstin;
    }

    if (frappe.currentUser) {
      return frappe.currentUser;
    }

    let user = (frappe.currentUser = firebaseAuth.currentUser);
    if (!user) {
      user = frappe.currentUser = await waitForUser();
    }

    console.log('user', user, gstin);
    if (gstin && !user.fbAccount) {
      user.fbAccount = await firestore
        .collection('customers')
        .doc(gstin)
        .get();
    }

    return frappe.currentUser;
  },

  async login(email, password) {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    return this.getCurrentUser();
  },

  async logout() {
    try {
      await firebaseAuth.signOut();
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
      if (fbuser.fbAccount && fbuser.fbAccount.exists) {
        throw new Error('This company already registered, please login');
      }
    }
    console.log('creating company', user);

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
        trialExpiresOn: DateTime.local()
          .plus({ days: 15 })
          .toJSDate(),
        billingPeriodStart: DateTime.local()
          .plus({ days: 15 })
          .toJSDate(),
        billingPeriodEnd: DateTime.local()
          .plus({ days: 45 })
          .toJSDate(),
        billingGracePeriod: 7
      });

    try {
      const doc = frappe.newDoc({
        doctype: 'SpinBiUser',
        name: user.email,
        password: user.password,
        userId: fbuser.uid,
        gstin: user.gstin,
        fullName: user.fullname,
        phoneNumber: user.phoneNumber,
        role: 'Administrator'
      });
      await doc.insert();
    } catch (ex) {
      console.error(ex);
    }

    console.log('Before reauth');
    const credential = firebase.auth.EmailAuthProvider.credential(
      email,
      password
    );
    await fbuser.reauthenticateWithCredential(credential);
    fbuser = await waitForUser();

    console.log(firebaseAuth.currentUser);
    return fbuser;
  },

  async updatePayment(reference) {
    let user = frappe.currentUser.fbAccount;

    console.log('user', frappe.currentUser);
    console.log('updating billing details', reference);

    try {
      //store in firestore
      await firestore
        .collection('customers')
        .doc(user.gstin)
        .set({
          enabled: true,
          billingPeriodStart: DateTime.fromJSDate(
            user.billingPeriodStart.toDate()
          )
            .plus({ months: 1 })
            .toJSDate(),
          billingPeriodEnd: DateTime.fromJSDate(user.billingPeriodEnd.toDate())
            .plus({ months: 1 })
            .toJSDate()
        });
    } catch (ex) {
      console.error(ex);
    }
  },

  async createUser(user) {
    const fbuser = await this.getCurrentUser();
    const { uid } = await axios.post(
      `${cloudfunctionsBaseUrl}/createUser`,
      {
        email: user.email,
        password: user.password,
        displayName: fbuser.displayName
      },
      {
        headers: {
          Authorization: 'Bearer ' + fbuser.token
        }
      }
    );

    user.set('userId', uid);
    await user.update();
  },

  async updateUser(user) {
    const fbuser = await this.getCurrentUser();
    await axios.post(
      `${cloudfunctionsBaseUrl}/updateUser/${user.userId}`,
      {
        email: user.email,
        password: user.password,
        displayName: fbuser.displayName,
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
