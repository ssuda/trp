// Firebase App (the core Firebase SDK) is always required and must be listed first
import * as firebase from 'firebase/app'

// Add the Firebase products that you want to use
import 'firebase/auth'
import 'firebase/firestore'
import axios from 'axios'

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyAO5ubwijYz2OHReRtGRNQrgsVnDeIW6m8",
    authDomain: "spinbi-trp.firebaseapp.com",
    databaseURL: "https://spinbi-trp.firebaseio.com",
    projectId: "spinbi-trp",
    storageBucket: "spinbi-trp.appspot.com",
    messagingSenderId: "698837250119",
    appId: "1:698837250119:web:f849a6c5c13b75cdb0c162"
  };

// Initialize Firebase
const firebaseApp = firebase.initializeApp(firebaseConfig)
const firebaseAuth = firebaseApp.auth()
const firebaseDb = firebaseApp.firestore()
firebaseDb.enablePersistence({
  synchronizeTabs: true
})
const FieldValue = firebase.firestore.FieldValue
const Timestamp = firebase.firestore.Timestamp

function getFirebaseProjectId () {
  return firebase.app().options.authDomain.split('.')[0]
}

// firebase.auth().onAuthStateChanged(function(user) {
//     if (user) {
//       firebaseUser = user
//     } else {
//       firebaseUser = null
//     }
// });

async function registerUserAndCompany(user) {
  const { email, password } = user;
  try {
    await firebase.auth().createUserWithEmailAndPassword(email, password);
  } catch (ex) {
    console.error(ex);
  }

  await firebase.auth().signInWithEmailAndPassword(email, password);

  // const fbuser = firebase.auth().currentUser;
  // const token = await user.getIdToken(true);

  // return  axios.post(`${cloudfunctionsBaseUrl}/setupCompany`, {
  //   uid: fbuser.uid,
  //   email: user.email,
  //   companyName: user.companyName
  // }, {
  //   headers: {
  //     Authorization: 'Bearer ' + token
  //   }
  // })
}

const cloudfunctionsBaseUrl = 'https://us-central1-' + getFirebaseProjectId() + '.cloudfunctions.net/app'

export { firebaseAuth, firebaseDb, FieldValue, Timestamp, getFirebaseProjectId, cloudfunctionsBaseUrl, registerUserAndCompany }
