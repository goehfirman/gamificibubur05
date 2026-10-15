// Firebase Web Client Initialization
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyDD-j71tLy2Qp6DZlMV_eEkHIzvPZgovQM",
  authDomain: "gamificlasscibubur05.firebaseapp.com",
  projectId: "gamificlasscibubur05",
  storageBucket: "gamificlasscibubur05.firebasestorage.app",
  messagingSenderId: "887613900574",
  appId: "1:887613900574:web:e9a78f05af6957dbea6b0f",
  measurementId: "G-8RSWW56WJ2"
};

// Inisialisasi Firebase App (Singleton)
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const storage = getStorage(app);

// Inisialisasi Analytics hanya jika di browser & didukung
export let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

export default app;
