// src/firebase.js - initialized from user's firebase config (modular SDK)
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyDwAM59HJcg-A5PYcJoZs0JGifW7C9bQPk",
  authDomain: "floras-store-pos.firebaseapp.com",
  projectId: "floras-store-pos",
  storageBucket: "floras-store-pos.firebasestorage.app",
  messagingSenderId: "500687832795",
  appId: "1:500687832795:web:be883db57f8aaac076eefe",
  measurementId: "G-GM6D993ZBW"
};

const app = initializeApp(firebaseConfig);
let analytics = null;
try { analytics = getAnalytics(app); } catch(e){ /* analytics may fail in some envs */ }

const db = getFirestore(app);

export { app, db, analytics };
