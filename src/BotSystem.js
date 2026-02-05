// src/BotSystem.js
import { database, ref, set, get, child, update } from './firebase';
import botNames from './data/botnames.json';

const BOT_NAMES = botNames;
const ARCHETYPES = {
    "MINER": { buildPrio: ['mine', 'solar', 'crystal', 'deuterium'], aggression: 0.1, resourceMult: 1.5 },
    "WARLORD": { buildPrio: ['hangar', 'robotics'], aggression: 0.9, resourceMult: 0.8 },
    "BALANCED": { buildPrio: ['mine', 'hangar', 'lab'], aggression: 0.5, resourceMult: 1.0 }
};

export const BotSystem = {
    // 1. The "Big Bang": Populates the galaxy
    async populateGalaxy(minBotsPerSystem = 2) {
        console.log("Initializing Bot Protocol...");
        
        // Fetch current galaxy to see occupied slots
        const snapshot = await get(child(ref(database), 'galaxy'));
        const galaxyData = snapshot.val() || {};
        
        const updates = {};
        let botCount = 0;

        // Loop through all 100 Systems
        for (let sys = 1; sys <= 100; sys++) {
            // Count planets in this system
            let occupiedCount = 0;
            const systemSlots = [];
            
            for (let pl = 1; pl <= 15; pl++) {
                const key = `${sys}_${pl}`;
                if (galaxyData[key]) {
                    occupiedCount++;
                } else {
                    systemSlots.push(pl);
                }
            }

            // Calculate how many bots to add
            const needed = minBotsPerSystem - occupiedCount;
            
            if (needed > 0) {
                // Shuffle empty slots to pick random ones
                const available = systemSlots.sort(() => 0.5 - Math.random());
                
                for (let i = 0; i < needed; i++) {
                    const pl = available[i];
                    const botData = this.createBotEntity(sys, pl);
                    
                    // 1. Save to Public Galaxy (Visible map)
                    updates[`galaxy/${sys}_${pl}`] = botData.public;
                    
                    // 2. Save to Users (Private data for logic)
                    // We use a prefix 'bot_' so we can ID them easily
                    updates[`users/${botData.uid}/save`] = JSON.stringify(botData.private);
                    
                    botCount++;
                }
            }
        }

        if (botCount > 0) {
            try {
                // Use update() instead of set()
                // Ensure you import 'update' from 'firebase/database' at the top of the file
                await update(ref(database), updates); 
                console.log(`Deployed ${botCount} bots across the galaxy.`);
            } catch (err) {
                console.error("Firebase Update Error:", err);
                // Check if any key specifically has a [ or ] which is forbidden
            }
        } else {
            console.log("No bots needed; galaxy is sufficiently populated.");
        }
        return botCount;
    },

    // 2. Factory: Creates the Bot Data
    createBotEntity(sys, pl) {
        const typeKeys = Object.keys(ARCHETYPES);
        const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
        const archetype = ARCHETYPES[type];
        const name = `${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]} ${type}`;
        const uid = `bot_${sys}_${pl}_${Date.now().toString(36)}`;

        return {
            uid: uid,
            public: {
                owner: name,
                uid: uid,
                score: Math.floor(Math.random() * 500) + 100, // Start with some fake score
                planetName: `${type} Outpost`,
                coords: `[${sys}:${pl}]`,
                isBot: true, // <--- THE FLAG
                archetype: type,
                lastActive: Date.now()
            },
            private: {
                // Mimic the exact structure of a real player's save
                resources: {
                    metal: 1000 * archetype.resourceMult,
                    energy: 500 * archetype.resourceMult,
                    crystal: 500 * archetype.resourceMult,
                    deuterium: 100 * archetype.resourceMult
                },
                buildings: {
                    mine: Math.floor(Math.random() * 5),
                    solar: Math.floor(Math.random() * 5),
                    crystal: Math.floor(Math.random() * 5),
                    deuterium: Math.floor(Math.random() * 5)
                },
                coordinates: `[${sys}:${pl}]`,
                planetName: `${type} Outpost`,
                lastTick: Date.now()
            }
        };
    }
};

// src/BotSystem.js

export const BotAI = {
    /**
     * Calculates resources generated since the last update.
     * Does NOT save to DB automatically (to save writes).
     * Returns the updated bot data object.
     */
    simulateEconomy(botPrivateData) {
        if (!botPrivateData || !botPrivateData.lastTick) return botPrivateData;

        const now = Date.now();
        const elapsedHours = (now - botPrivateData.lastTick) / (1000 * 60 * 60);
        
        // Safety cap: Don't simulate more than 7 days (prevents overflow bugs)
        const effectiveHours = Math.min(elapsedHours, 168); 

        if (effectiveHours <= 0) return botPrivateData;

        // Clone the data to avoid mutating the original reference
        const updatedBot = JSON.parse(JSON.stringify(botPrivateData));
        const buildings = updatedBot.buildings;
        const archetype = updatedBot.archetype || "BALANCED";

        // Define Base Rates (Must match your Economy.js player rates)
        // Multipliers based on archetype (defined in your generation script)
        const mult = archetype === 'MINER' ? 1.5 : 
                     archetype === 'WARLORD' ? 0.8 : 1.0;

        // Production Formulas (Example: 30 * Level * 1.1^Level)
        const metalProd = (30 * buildings.mine * Math.pow(1.1, buildings.mine)) * mult;
        const crystalProd = (20 * buildings.crystal * Math.pow(1.1, buildings.crystal)) * mult;
        const deutProd = (10 * buildings.deuterium * Math.pow(1.1, buildings.deuterium)) * mult;

        // Apply accumulation
        updatedBot.resources.metal += Math.floor(metalProd * effectiveHours);
        updatedBot.resources.crystal += Math.floor(crystalProd * effectiveHours);
        updatedBot.resources.deuterium += Math.floor(deutProd * effectiveHours);

        // Update the timestamp so we don't double-count next time
        updatedBot.lastTick = now;

        return updatedBot;
    }
};