import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithEmailAndPassword, // പുതിയത്
    signOut, // പുതിയത്
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    onSnapshot, 
    collection, 
    query, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    arrayRemove, 
    arrayUnion, 
    serverTimestamp, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCp-NKbL_kmB2nzlTv9fSisc2cVuE55p-Q",
  authDomain: "online-angadi-003.firebaseapp.com",
  projectId: "online-angadi-003",
  storageBucket: "online-angadi-003.firebasestorage.app",
  messagingSenderId: "873906876645",
  appId: "1:873906876645:web:a730abef1e07da515f640c",
  measurementId: "G-GH1DZXR5ZP"
};

const APP_ID = 'online-angadi-003';

let app, db, auth;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

export { 
    app, db, auth, APP_ID,
    doc, setDoc, onSnapshot, collection, query, 
    addDoc, updateDoc, deleteDoc, arrayRemove, arrayUnion, 
    serverTimestamp, getDocs, 
    signInAnonymously, 
    signInWithEmailAndPassword, // Exporting new functions
    signOut,
    onAuthStateChanged
};