// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDQY-MTYX5QJU-eoRAT74bmdYic4OwjF98",
  authDomain: "despachocontable374-308c9.firebaseapp.com",
  projectId: "despachocontable374-308c9",
  storageBucket: "despachocontable374-308c9.firebasestorage.com",
  messagingSenderId: "882111328088",
  appId: "1:882111328088:web:9ec929ab0095deea523f2d",
  measurementId: "G-QWJ3K440BM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);  // 👈 Firestore listo
export const functions = getFunctions(app);
const analytics = getAnalytics(app);