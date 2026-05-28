import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAGfpduRticKCZN4WzEVgWQKkIXVrsPbQs",
  authDomain: "cadastro-alug---dev.firebaseapp.com",
  projectId: "cadastro-alug---dev",
  storageBucket: "cadastro-alug---dev.firebasestorage.app",
  messagingSenderId: "591311088063",
  appId: "1:591311088063:web:5901dedb8e17f556f8590a"
};

// Prevent duplicate initialization in hot-reloading dev environments
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };

