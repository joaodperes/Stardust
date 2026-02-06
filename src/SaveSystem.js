import { gameData } from './gameData.js';
import { auth, ref, get, child, database } from './firebase.js';

export const SaveSystem = {
    async load() {
        // Try loading from localStorage first (offline mode)
        const saved = localStorage.getItem("spaceColonySave");
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.recursiveMerge(gameData, data);
                return true;
            } catch (err) {
                console.error("Failed to parse local save:", err);
            }
        }
        return false;
    },

    save() {
        try {
            const saveState = this.getLeanSaveState();
            localStorage.setItem("spaceColonySave", JSON.stringify(saveState));
            return true;
        } catch (err) {
            console.error("Save failed:", err);
            return false;
        }
    },

    getLeanSaveState() {
        // Return only the data that needs to be saved (exclude derived/computed values)
        return {
            planetName: gameData.planetName,
            coordinates: gameData.coordinates,
            score: gameData.score,
            resources: gameData.resources,
            buildings: Object.fromEntries(
                Object.entries(gameData.buildings).map(([key, val]) => [key, { level: val.level }])
            ),
            ships: Object.fromEntries(
                Object.entries(gameData.ships).map(([key, val]) => [key, { 
                    count: val.count, 
                    available: val.available 
                }])
            ),
            research: Object.fromEntries(
                Object.entries(gameData.research).map(([key, val]) => [key, { level: val.level }])
            ),
            construction: gameData.construction,
            shipQueue: gameData.shipQueue,
            researchQueue: gameData.researchQueue,
            fleets: gameData.fleets,
            missionReports: gameData.missionReports,
            lastTick: gameData.lastTick
        };
    },

    async loadRemoteData(uid) {
        // Load another user's data (for spying, etc.)
        try {
            const snapshot = await get(child(ref(database), `users/${uid}/save`));
            if (snapshot.exists()) {
                const data = typeof snapshot.val() === 'string' 
                    ? JSON.parse(snapshot.val()) 
                    : snapshot.val();
                return data;
            }
            return null;
        } catch (err) {
            console.error("Failed to load remote data:", err);
            return null;
        }
    },

    downloadSave() {
        const saveState = this.getLeanSaveState();
        const dataStr = JSON.stringify(saveState, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `stardust_save_${Date.now()}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    },

    recursiveMerge(target, source) {
        // Smart merge that preserves structure but updates values
        if (!target || !source) return;
        
        for (let key in source) {
            if (Object.prototype.hasOwnProperty.call(target, key)) {
                const val = source[key];
                if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                    if (!target[key]) target[key] = {};
                    this.recursiveMerge(target[key], val);
                } else {
                    target[key] = val;
                }
            }
        }
    }
};
