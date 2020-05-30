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

  async logout() {
    try {
      await firebaseAuth.signOut();
    } catch (ex) {
      console.error(ex);
    }
  },

  async signup(user) {
    const { email, password } = user;
    let doc;

    await this.logout();

    try {
      await firebaseAuth.createUserWithEmailAndPassword(email, password);
    } catch (ex) {
      console.error(ex);
      await firebaseAuth.signInWithEmailAndPassword(email, password);
    }

    let fbuser = await this.getCurrentUser();

    if (process.env.NODE_ENV !== 'development') {
      console.log('fetching firebase user');
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
    }
    console.log('creating company', user);

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
