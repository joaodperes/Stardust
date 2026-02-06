// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { getDatabase, ref, set, get, child, update, remove, runTransaction } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// --- Database Helper Functions ---

async function updateUserResources(uid, resourceChanges) {
    const resourceRef = ref(database, `users/${uid}/save/resources`);
    return runTransaction(resourceRef, (currentResources) => {
        if (currentResources) {
            for (const resource in resourceChanges) {
                currentResources[resource] = (currentResources[resource] || 0) + resourceChanges[resource];
            }
        }
        return currentResources;
    });
}

async function updateUserShips(uid, shipChanges) {
    const shipRef = ref(database, `users/${uid}/save/fleet`);
    return runTransaction(shipRef, (currentShips) => {
        if (currentShips) {
            for (const ship in shipChanges) {
                if(currentShips[ship]) {
                    currentShips[ship].available = (currentShips[ship].available || 0) + shipChanges[ship];
                }
            }
        }
        return currentShips;
    });
}

async function saveMission(uid, fleetData) {
    const missionRef = ref(database, `users/${uid}/missions/${fleetData.id}`);
    return set(missionRef, fleetData);
}

async function updateMission(uid, fleetId, updates) {
    const missionRef = ref(database, `users/${uid}/missions/${fleetId}`);
    return update(missionRef, updates);
}

async function removeMission(uid, fleetId) {
    const missionRef = ref(database, `users/${uid}/missions/${fleetId}`);
    return remove(missionRef);
}

async function loadMissions(uid) {
    const missionsRef = ref(database, `users/${uid}/missions`);
    const snapshot = await get(missionsRef);
    return snapshot.exists() ? snapshot.val() : {};
}

export async function loadUserData(uid) {
    const userRef = ref(database, `users/${uid}`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return {
            missions: data.missions || {},
            reports: data.reports || {}
        };
    }
    return { missions: {}, reports: {} };
}

// Save a report to a specific user
export async function saveMissionReport(uid, reportData) {
    const reportId = `report_${Date.now()}`;
    const reportRef = ref(database, `users/${uid}/reports/${reportId}`);
    return set(reportRef, { ...reportData, id: reportId });
}

async function deleteReport(uid, reportId) {
    const reportRef = ref(database, `users/${uid}/reports/${reportId}`);
    return remove(reportRef);
}


export { 
    auth, 
    database, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    updateProfile, 
    ref, 
    set, 
    get, 
    child, 
    update,
    remove,
    runTransaction,
    updateUserResources,
    updateUserShips,
    saveMission,
    updateMission,
    removeMission,
    loadMissions,
    sendPasswordResetEmail
};
