import { firebaseAuth, firebase, cloudfunctionsBaseUrl } from '@/firebase';

import axios from 'axios';
import frappe from 'frappejs';

function waitForUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(
      async user => {
        unsubscribe();
        user.token = await user.getIdToken(true);
        try {
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
    return await this.getCurrentUser();
  },

  async signup(user) {
    const { email, password } = user;
    try {
      await firebaseAuth.createUserWithEmailAndPassword(email, password);
    } catch (ex) {
      console.error(ex);
      await firebaseAuth.signInWithEmailAndPassword(email, password);
    }

    let fbuser = await this.getCurrentUser();

    if (fbuser.displayName) {
      return fbuser;
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
