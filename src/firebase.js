import firebase from 'firebase/app';
import frappe from 'frappejs';

import 'firebase/auth';
import 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAO5ubwijYz2OHReRtGRNQrgsVnDeIW6m8',
  authDomain: 'spinbi-trp.firebaseapp.com',
  databaseURL: 'https://spinbi-trp.firebaseio.com',
  projectId: 'spinbi-trp',
  storageBucket: 'spinbi-trp.appspot.com',
  messagingSenderId: '698837250119',
  appId: '1:698837250119:web:f849a6c5c13b75cdb0c162'
};

const firebaseApp = firebase.initializeApp(firebaseConfig);
const firestore = firebaseApp.firestore();

firestore.enablePersistence({
  synchronizeTabs: true
});

function projectId() {
  return firebase.app().options.authDomain.split('.')[0];
}

const cloudfunctionsBaseUrl =
  'https://us-central1-' + projectId() + '.cloudfunctions.net/app';

const firebaseAuth = firebaseApp.auth();
const FieldValue = firebase.firestore.FieldValue;
const Timestamp = firebase.firestore.Timestamp;

frappe.firebase = {
  firebaseAuth,
  firestore,
  FieldValue,
  Timestamp,
  firebase,
  projectId,
  cloudfunctionsBaseUrl
};

export {
  firebaseAuth,
  firestore,
  FieldValue,
  Timestamp,
  firebase,
  projectId,
  cloudfunctionsBaseUrl
};
