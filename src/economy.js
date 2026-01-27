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
        let prod = { metal: 2, crystal: 1, deuterium: 0 }; // Base passive rates

        // Metal Mine
        prod.metal += gameData.buildings.mine.baseProd * gameData.buildings.mine.level;
        
        // Crystal Drill
        prod.crystal += gameData.buildings.crystal.baseProd * gameData.buildings.crystal.level;
        
        // Deuterium Synthesizer
        prod.deuterium += gameData.buildings.deuterium.baseProd * gameData.buildings.deuterium.level;

        // Apply energy penalty if energy is negative (10% efficiency)
        if (gameData.resources.energy < 0) {
            prod.metal *= 0.5;
            prod.crystal *= 0.1;
            prod.deuterium *= 0.01;
        }

        return prod;
    },

    // Calculate max energy from Solar Plants
    updateEnergy() {
        const solar = gameData.buildings.solar;
        gameData.resources.maxEnergy = solar.level * solar.baseProd;
        
        let consumption = gameData.buildings.mine.level * 2 + 
                           gameData.buildings.crystal.level * 1 + 
                           gameData.buildings.deuterium.level * 3;
        
        gameData.resources.energy = gameData.resources.maxEnergy - consumption;
    },

    formatNum(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
        if (num >= 1000) return (num / 1000).toFixed(1) + "k";
        return Math.floor(num);
    }
};