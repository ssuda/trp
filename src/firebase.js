// Firebase App (the core Firebase SDK) is always required and must be listed first
import * as firebase from 'firebase/app';
import frappe from 'frappejs';

// Add the Firebase products that you want to use
import 'firebase/auth';
import 'firebase/firestore';

// Firebase Config
const firebaseConfig = {
  apiKey: 'AIzaSyAO5ubwijYz2OHReRtGRNQrgsVnDeIW6m8',
  authDomain: 'spinbi-trp.firebaseapp.com',
  databaseURL: 'https://spinbi-trp.firebaseio.com',
  projectId: 'spinbi-trp',
  storageBucket: 'spinbi-trp.appspot.com',
  messagingSenderId: '698837250119',
  appId: '1:698837250119:web:f849a6c5c13b75cdb0c162'
};

// Initialize Firebase
const firebaseApp = firebase.initializeApp(firebaseConfig);
const firebaseAuth = firebaseApp.auth();
const firestore = firebaseApp.firestore();

firestore.enablePersistence({
  synchronizeTabs: true
});

firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

const FieldValue = firebase.firestore.FieldValue;
const Timestamp = firebase.firestore.Timestamp;

function getFirebaseProjectId() {
  return firebase.app().options.authDomain.split('.')[0];
}

const cloudfunctionsBaseUrl =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://us-central1-' +
      getFirebaseProjectId() +
      '.cloudfunctions.net/app';

frappe.firebase = {
  firebaseAuth,
  firestore,
  FieldValue,
  Timestamp,
  firebase,
  getFirebaseProjectId,
  cloudfunctionsBaseUrl
};

export {
  firebaseAuth,
  firestore,
  FieldValue,
  Timestamp,
  firebase,
  getFirebaseProjectId,
  cloudfunctionsBaseUrl
};
