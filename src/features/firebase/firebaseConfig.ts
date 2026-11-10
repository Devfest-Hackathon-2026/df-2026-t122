// src/features/firebase/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBajv7lW5oAQ-h2nqJztH9F8RWFWzsYj7M",
  authDomain: "resolve-teck-neck.firebaseapp.com",
  projectId: "resolve-teck-neck",
  storageBucket: "resolve-teck-neck.firebasestorage.app",
  messagingSenderId: "854141881210",
  appId: "1:854141881210:web:41cb8b92ae17cb22f364c3",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const isFirebaseConfigured = Boolean(firebaseConfig.projectId);
