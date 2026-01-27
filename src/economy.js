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