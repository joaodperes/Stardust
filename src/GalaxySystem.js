import { database, ref, get, set, runTransaction, child } from './firebase.js';

export const GalaxySystem = {
    // 1. Check if a name is taken using a dedicated index
    async isNameAvailable(name) {
        const cleanName = name.trim();
        const snapshot = await get(child(ref(database), `usernames/${cleanName}`));
        return !snapshot.exists(); // Returns true if name is free
    },

    // 2. Reserve a name (Call this during registration)
    async reserveName(name, uid) {
        const cleanName = name.trim();
        // Try to write to the usernames index. Fails if already exists.
        const result = await runTransaction(ref(database, `usernames/${cleanName}`), (currentData) => {
            if (currentData === null) {
                return uid; // Claim it!
            } else {
                return; // Abort, already taken
            }
        });
        return result.committed;
    },

    // 3. Find and Claim Unique Coordinates
    async assignHomePlanet(user, planetName) {
        // We will try to find a slot in System 1, then System 2, etc.
        // For simplicity: Max 100 systems, 15 planets each
        
        let allocated = false;
        let coords = "";

        // Try random slots until one works (Simple method)
        for (let attempt = 0; attempt < 10; attempt++) {
            const sys = Math.floor(Math.random() * 100) + 1; // Systems 1-100
            const pl = Math.floor(Math.random() * 15) + 1;  // Planets 1-15
            const coordKey = `${sys}_${pl}`;
            
            const result = await runTransaction(ref(database, `galaxy/${coordKey}`), (currentData) => {
                if (currentData === null) {
                    // Spot is free! Reserve it.
                    return {
                        owner: user.displayName,
                        uid: user.uid,
                        planetName: planetName,
                        score: 0, // Initial score
                        coords: `[${sys}:${pl}]`,
                        updatedAt: Date.now()
                    };
                } else {
                    return; // Spot taken, retry
                }
            });

            if (result.committed) {
                allocated = true;
                coords = `[${sys}:${pl}]`;
                
                // Save these coords to the USER'S private save
                // You need to update your gameData.coordinates locally too
                return coords;
            }
        }
        
        throw new Error("Could not find a free planet sector. Galaxy full?");
    }
};