// Firebase-ൽ നിന്ന് ആവശ്യമായ ഫംഗ്ഷനുകൾ ഇമ്പോർട്ട് ചെയ്യുന്നു
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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

// -----------------------------------------------------------------
// !!! വളരെ പ്രധാനം !!!
// -----------------------------------------------------------------
// --> [സൂചന] ഉപയോക്താവിന്റെ Firebase കോൺഫിഗറേഷൻ ഇവിടെ ചേർത്തു
// -----------------------------------------------------------------
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCp-NKbL_kmB2nzlTv9fSisc2cVuE55p-Q",
  authDomain: "online-angadi-003.firebaseapp.com",
  projectId: "online-angadi-003",
  storageBucket: "online-angadi-003.firebasestorage.app",
  messagingSenderId: "873906876645",
  appId: "1:873906876645:web:a730abef1e07da515f640c",
  measurementId: "G-GH1DZXR5ZP"
};
// -----------------------------------------------------------------
// --> [സൂചന] കോൺഫിഗറേഷൻ ചേർക്കൽ പൂർത്തിയായി
// -----------------------------------------------------------------


// -----------------------------------------------------------------
// !!! നിങ്ങളുടെ App ID ഇവിടെ നൽകുക !!!
// -----------------------------------------------------------------
// ഈ ആപ്ലിക്കേഷനായി നിങ്ങൾ ഉപയോഗിക്കാൻ ഉദ്ദേശിക്കുന്ന ഒരു പേര് (ഉദാ: "socialshop-prod")
// ഇത് Firestore ഡാറ്റാബേസ് പാത്ത് ഉണ്ടാക്കാൻ ഉപയോഗിക്കും.
const APP_ID = 'online-angadi-003'; // <-- [സൂചന] നിങ്ങളുടെ പ്രോജക്റ്റ് ഐഡി ഞാൻ ഇവിടെ APP_ID ആയി ചേർത്തു. നിങ്ങൾക്ക് വേണമെങ്കിൽ ഇത് മാറ്റാവുന്നതാണ്.
// -----------------------------------------------------------------


// ഫയർബേസ് ആപ്ലിക്കേഷൻ ആരംഭിക്കുന്നു
let app, db, auth;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (error) {
    console.error("Firebase initialization failed:", error);
    // പബ്ലിക് പേജിൽ ഒരു എറർ കാണിക്കാൻ ശ്രമിക്കാം
    document.body.innerHTML = `<div style="padding: 20px; text-align: center; font-family: sans-serif; background-color: #ffebee; color: #c62828; border: 1px solid #c62828; border-radius: 8px; margin: 20px;">
        <h2>Application Error</h2>
        <p>Firebase configuration is missing or invalid. Please check your 'firebase-config.js' file.</p>
        <p>Error details: ${error.message}</p>
    </div>`;
}

// ആവശ്യമായ ഫംഗ്ഷനുകൾ മറ്റ് സ്ക്രിപ്റ്റുകളിലേക്ക് എക്സ്പോർട്ട് ചെയ്യുന്നു
export { 
    app, 
    db, 
    auth, 
    APP_ID,
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
    getDocs,
    signInAnonymously
};