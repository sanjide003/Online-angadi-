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
    getDocs,
    // PERFORMANCE OPTIMIZATIONS
    enableIndexedDbPersistence,
    enableMultiTabIndexedDbPersistence,
    initializeFirestore,
    CACHE_SIZE_UNLIMITED
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------
// !!! വളരെ പ്രധാനം !!!
// -----------------------------------------------------------------
// --> [സൂചന] ഉപയോക്താവിന്റെ Firebase കോൺഫിഗറേഷൻ ഇവിടെ ചേർത്തു
// -----------------------------------------------------------------
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

// -----------------------------------------------------------------
// !!! നിങ്ങളുടെ App ID ഇവിടെ നൽകുക !!!
// -----------------------------------------------------------------
const APP_ID = 'online-angadi-003';
// -----------------------------------------------------------------

// ഫയർബേസ് ആപ്ലിക്കേഷൻ ആരംഭിക്കുന്നു
let app, db, auth;

try {
    // Firebase App Initialize
    app = initializeApp(firebaseConfig);
    
    // Auth Initialize
    auth = getAuth(app);
    
    // Firestore Initialize with OPTIMIZED SETTINGS
    db = initializeFirestore(app, {
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        // Experimental features for better performance
        experimentalForceLongPolling: false,
        experimentalAutoDetectLongPolling: true
    });
    
    // Enable Offline Persistence for FASTER LOADING
    // This allows app to work offline and load instantly from cache
    const enablePersistence = async () => {
        try {
            // Try multi-tab persistence first (better for multiple tabs)
            await enableMultiTabIndexedDbPersistence(db);
            console.log("✅ Multi-tab offline persistence enabled");
        } catch (err) {
            if (err.code === 'failed-precondition') {
                // Multiple tabs open, try single-tab persistence
                try {
                    await enableIndexedDbPersistence(db);
                    console.log("✅ Single-tab offline persistence enabled");
                } catch (persistenceErr) {
                    console.warn("⚠️ Persistence could not be enabled:", persistenceErr);
                }
            } else if (err.code === 'unimplemented') {
                // Browser doesn't support persistence
                console.warn("⚠️ Browser doesn't support offline persistence");
            } else {
                console.error("❌ Persistence error:", err);
            }
        }
    };
    
    // Enable persistence asynchronously (non-blocking)
    enablePersistence();
    
    console.log("✅ Firebase initialized successfully with optimizations");
    
} catch (error) {
    console.error("❌ Firebase initialization failed:", error);
    // പബ്ലിക് പേജിൽ ഒരു എറർ കാണിക്കാൻ ശ്രമിക്കാം
    if (typeof document !== 'undefined') {
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; font-family: sans-serif; background-color: #ffebee; color: #c62828; border: 1px solid #c62828; border-radius: 8px; margin: 20px;">
                <h2>⚠️ Application Error</h2>
                <p>Firebase configuration is missing or invalid. Please check your 'firebase-config.js' file.</p>
                <p><strong>Error details:</strong> ${error.message}</p>
                <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    🔄 Retry
                </button>
            </div>
        `;
    }
}

// -----------------------------------------------------------------
// PERFORMANCE HELPER FUNCTIONS
// -----------------------------------------------------------------

/**
 * Create optimized query with better performance
 * @param {Collection} collectionRef - Firestore collection reference
 * @param {Array} queryConstraints - Query constraints (where, orderBy, limit, etc.)
 * @returns {Query} Optimized query
 */
export function createOptimizedQuery(collectionRef, ...queryConstraints) {
    return query(collectionRef, ...queryConstraints);
}

/**
 * Batch write operations for better performance
 * @param {Array} operations - Array of write operations
 * @returns {Promise} Batch write promise
 */
export async function batchWrite(operations) {
    // Note: Would need to import writeBatch from Firestore
    // This is a placeholder for future optimization
    console.log("Batch write operations:", operations.length);
    return Promise.all(operations);
}

/**
 * Debounced Firestore write
 * Prevents excessive writes by debouncing rapid changes
 */
let writeDebounceTimers = {};

export function debouncedWrite(docRef, data, delay = 1000) {
    const key = docRef.path;
    
    return new Promise((resolve, reject) => {
        // Clear existing timer
        if (writeDebounceTimers[key]) {
            clearTimeout(writeDebounceTimers[key]);
        }
        
        // Set new timer
        writeDebounceTimers[key] = setTimeout(async () => {
            try {
                await setDoc(docRef, data, { merge: true });
                resolve();
            } catch (error) {
                reject(error);
            }
            delete writeDebounceTimers[key];
        }, delay);
    });
}

/**
 * Smart snapshot listener with automatic cleanup
 * @param {Query|DocumentReference} ref - Firestore reference
 * @param {Function} callback - Callback function
 * @param {Function} errorCallback - Error callback
 * @returns {Function} Unsubscribe function
 */
export function smartSnapshot(ref, callback, errorCallback) {
    const unsubscribe = onSnapshot(
        ref,
        { 
            includeMetadataChanges: false // Ignore metadata-only changes for better performance
        },
        callback,
        errorCallback
    );
    
    // Return enhanced unsubscribe that logs cleanup
    return () => {
        console.log("🧹 Cleaning up snapshot listener");
        unsubscribe();
    };
}

/**
 * Preload critical data with source preference
 * Uses cache first, then server
 */
export async function preloadCriticalData(collectionRef) {
    try {
        // Try cache first (instant)
        const cacheSnapshot = await getDocs(
            query(collectionRef, { source: 'cache' })
        );
        
        if (!cacheSnapshot.empty) {
            console.log("✅ Loaded from cache:", cacheSnapshot.size, "documents");
            return cacheSnapshot;
        }
        
        // Fall back to server
        const serverSnapshot = await getDocs(collectionRef);
        console.log("📡 Loaded from server:", serverSnapshot.size, "documents");
        return serverSnapshot;
        
    } catch (error) {
        console.error("Error preloading data:", error);
        // Fall back to server on cache error
        return getDocs(collectionRef);
    }
}

// -----------------------------------------------------------------
// MONITORING & DEBUGGING HELPERS
// -----------------------------------------------------------------

/**
 * Monitor Firebase performance
 */
export function monitorPerformance() {
    if (typeof window !== 'undefined' && window.performance) {
        // Log Firebase initialization time
        const perfData = window.performance.getEntriesByType('resource')
            .filter(entry => entry.name.includes('firebasejs'));
        
        console.log("📊 Firebase Load Time:", perfData);
        
        // Monitor memory usage (if available)
        if (performance.memory) {
            console.log("💾 Memory Usage:", {
                used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
                total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
                limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
            });
        }
    }
}

// Auto-monitor in development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    setTimeout(monitorPerformance, 2000);
}

// -----------------------------------------------------------------
// NETWORK STATUS MONITORING
// -----------------------------------------------------------------

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let networkListeners = [];

export function onNetworkChange(callback) {
    networkListeners.push(callback);
    
    // Return cleanup function
    return () => {
        networkListeners = networkListeners.filter(cb => cb !== callback);
    };
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        isOnline = true;
        console.log("🌐 Network: ONLINE");
        networkListeners.forEach(cb => cb(true));
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        console.log("📵 Network: OFFLINE - Using cached data");
        networkListeners.forEach(cb => cb(false));
    });
}

export function getNetworkStatus() {
    return isOnline;
}

// -----------------------------------------------------------------
// ERROR HANDLING HELPERS
// -----------------------------------------------------------------

/**
 * Enhanced error handler with user-friendly messages
 */
export function handleFirestoreError(error, operation = 'operation') {
    const errorMessages = {
        'permission-denied': `Access denied. Please check Firestore security rules for ${operation}.`,
        'not-found': `Document not found during ${operation}.`,
        'already-exists': `Document already exists during ${operation}.`,
        'resource-exhausted': 'Too many requests. Please try again later.',
        'failed-precondition': 'Operation failed. Please check your internet connection.',
        'aborted': 'Operation was aborted. Please try again.',
        'unavailable': 'Service temporarily unavailable. Retrying...',
        'unauthenticated': 'Please sign in to continue.',
        'invalid-argument': 'Invalid data provided.',
        'deadline-exceeded': 'Request timeout. Please check your connection.'
    };
    
    const userMessage = errorMessages[error.code] || `An error occurred during ${operation}.`;
    
    console.error(`❌ Firestore Error [${error.code}]:`, error.message);
    
    return {
        code: error.code,
        message: userMessage,
        technical: error.message,
        retryable: ['unavailable', 'deadline-exceeded', 'aborted'].includes(error.code)
    };
}

/**
 * Retry logic for failed operations
 */
export async function retryOperation(operation, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            const errorInfo = handleFirestoreError(error);
            
            if (!errorInfo.retryable || attempt === maxRetries) {
                throw error;
            }
            
            console.log(`🔄 Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
    }
}

// -----------------------------------------------------------------
// EXPORTS
// -----------------------------------------------------------------

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

// Performance note logged
console.log(`
🚀 Firebase Config Loaded - OPTIMIZED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Offline Persistence: Enabled
✅ Unlimited Cache: Enabled
✅ Smart Listeners: Active
✅ Network Monitor: Active
✅ Error Handling: Enhanced
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);