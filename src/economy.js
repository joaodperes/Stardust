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
        let consumption = 0;
        let production = 0;

        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            // Calculate power: level * weight * scaling factor
            let p = b.level * Math.floor(Math.abs(b.energyWeight) * b.level * Math.pow(1.1, b.level));
            
            if (b.energyWeight > 0) consumption += p; // Mines
            if (b.energyWeight < 0) production += p;  // Solar
        }

        gameData.resources.maxEnergy = production;
        gameData.resources.energy = production - consumption;
    },
    formatNum(num) {
        if (num === 0) return "0";
        
        // Handle negatives by storing the sign and working with the absolute value
        const isNegative = num < 0;
        const absoluteNum = Math.abs(num);

        const suffixes = ["", "k", "M", "kM", "B", "kB", "T", "kT"];
        const tier = Math.floor(Math.log10(absoluteNum) / 3);

        if (tier <= 0) return (isNegative ? "-" : "") + Math.floor(absoluteNum).toString();
        
        const suffix = suffixes[tier] || "e";
        const scale = Math.pow(10, tier * 3);
        const formatted = (absoluteNum / scale).toFixed(1).replace(/\.0$/, "") + suffix;

        return isNegative ? "-" + formatted : formatted;
    },
    
    formatTime(seconds) {
        if (seconds <= 0) return "0s";
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        let parts = [];
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0 || parts.length === 0) parts.push(`${s}s`);

        return parts.join(" ");
    }
};