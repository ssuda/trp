import {
  firebaseAuth,
  firebase,
  firestore,
  cloudfunctionsBaseUrl
} from '@/firebase';

import { onlyConnectToRemoteDatabase } from '@/utils';
import axios from 'axios';
import frappe from 'frappejs';
import { DateTime } from 'luxon';

function waitForUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(
      async user => {
        unsubscribe();
        try {
          user.token = await user.getIdToken();
          user.local = await frappe.getDoc('SpinBiUser', user.email);
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

  async getCurrentUser() {
    if (frappe.currentUser) {
      return frappe.currentUser;
    }

    let user = (frappe.currentUser = firebaseAuth.currentUser);

    if (user && !user.token) {
      user.token = await user.getIdToken(true);
      try {
        user.local = await frappe.getDoc('SpinBiUser', user.email);
      } catch (ex) {}

      //frappe.session.user = user;
      return frappe.currentUser;
    }

    frappe.currentUser = await waitForUser();
    return frappe.currentUser;
  },

  async login(email, password) {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    return this.getCurrentUser();
  },

  async signup(user) {
    const { email, password } = user;
    let doc;

    try {
      doc = await firestore
        .collection('customers')
        .doc(user.gstin)
        .get();
    } catch (ex) {
      console.log('Error getting document:', ex);
    }

    if (doc && doc.exists) {
      throw new Error('This company already registered, please login');
    }

    try {
      await firebaseAuth.createUserWithEmailAndPassword(email, password);
    } catch (ex) {
      console.error(ex);
      await firebaseAuth.signInWithEmailAndPassword(email, password);
    }

    let fbuser = await this.getCurrentUser();

    if (fbuser.displayName) {
      try {
        await onlyConnectToRemoteDatabase();
        return fbuser;
      } catch (ex) {
        if (!/(password)/i.test(ex.message)) {
          return fbuser;
        }
      }
    }

    await axios.post(
      `${cloudfunctionsBaseUrl}/setupCompany`,
      {
        email: user.email,
        companyName: user.companyName
      },
      {
        headers: {
          Authorization: 'Bearer ' + fbuser.token
        }
      }
    );

    console.error('creating company', user);
    //store in firestore
    await firestore
      .collection('customers')
      .doc(user.gstin)
      .set({
        name: user.companyName,
        email: user.email,
        gstin: user.gstin,
        phoneNumber: user.phoneNumber,
        trialExpiresOn: DateTime.local()
          .plus(15, 'days')
          .toJSDate(),
        billingPeriodStart: DateTime.local()
          .plus(15, 'days')
          .toJSDate(),
        billingPeriodEnd: DateTime.local()
          .plus(45, 'days')
          .toJSDate(),
        billingGracePeriod: DateTime.local()
          .plus(7, 'days')
          .toJSDate()
      });

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
