import { gameData } from './gameData.js';

export const Economy = {
    // Standard Exponential Cost: Base * (Growth ^ Level)
    getCost(key) {
        const b = gameData.buildings[key];
        return {
            metal: Math.floor(b.cost.metal * Math.pow(b.growth, b.level)),
            crystal: Math.floor(b.cost.crystal * Math.pow(b.growth, b.level)),
            deuterium: Math.floor(b.cost.deuterium * Math.pow(b.growth, b.level))
        };
    },

    getProduction() {
        let b = gameData.buildings;
        
        // We calculate the hourly rate first, then divide by 3600 to get per-second
        let metalHourly = (b.mine.level * b.mine.baseProd) + 5; // base passive income
        let crystalHourly = (b.crystal.level * b.crystal.baseProd) + 1;
        let deutHourly = (b.deuterium.level * b.deuterium.baseProd);

        let prod = {
            metal: metalHourly / 3600,
            crystal: crystalHourly / 3600,
            deuterium: deutHourly / 3600
        };

        // Apply energy penalty
        if (gameData.resources.energy < 0) {
            prod.metal *= 0.1;
            prod.crystal *= 0.05;
            prod.deuterium *= 0.01;
        }

        return prod;
    },

    checkRequirements(key) {
        const b = gameData.buildings[key];
        const nextLevel = b.level + 1;
        let met = true;
        let missing = [];

        if (b.req) {
            for (let depKey in b.req) {
                const dependencyMap = b.req[depKey];
                let requiredLevel = 0;

                // Determine the required level for the next upgrade
                for (let targetStep in dependencyMap) {
                    if (nextLevel >= parseInt(targetStep)) {
                        requiredLevel = Math.max(requiredLevel, dependencyMap[targetStep]);
                    }
                }

                const actualLevel = gameData.buildings[depKey].level;
                if (actualLevel < requiredLevel) {
                    met = false;
                    missing.push(`${gameData.buildings[depKey].name} ${requiredLevel}`);
                }
            }
        }

        return { met, missing };
    },

    // Calculate max energy from Solar Plants
    updateEnergy() {
        let totalEnergy = 0;
        
        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            // If weight is negative, this ADDS to total. 
            // If weight is positive, this SUBTRACTS from total.
            totalEnergy -= (b.level * b.energyWeight);
        }

        // Since we want to display "Max" (Total possible) vs "Current" (Available)
        let solar = gameData.buildings.solar;
        gameData.resources.maxEnergy = solar.level * Math.abs(solar.energyWeight);
        gameData.resources.energy = totalEnergy;
    },

    formatNum(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
        if (num >= 1000) return (num / 1000).toFixed(1) + "k";
        return Math.floor(num);
    }
};