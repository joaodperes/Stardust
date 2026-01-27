import { gameData } from './gameData.js';

export const Economy = {
    getProduction() {
        gameData.resources.maxEnergy = gameData.buildings.solar.level * 10;
        let energyNeeded = (gameData.buildings.mine.level * 2) + 
                           (gameData.buildings.crystal.level * 1) + 
                           (gameData.buildings.deuterium.level * 3);
        
        gameData.resources.energy = gameData.resources.maxEnergy - energyNeeded;
        let efficiency = gameData.resources.energy < 0 ? 0.1 : 1.0;

        return {
            metal: (1 + (gameData.buildings.mine.level * gameData.buildings.mine.baseProd)) * efficiency,
            crystal: (gameData.buildings.crystal.level * gameData.buildings.crystal.baseProd) * efficiency,
            deuterium: (gameData.buildings.deuterium.level * gameData.buildings.deuterium.baseProd) * efficiency
        };
    },

    getCost(key) {
        let b = gameData.buildings[key];
        let scale = Math.pow(1.5, b.level);
        return {
            metal: Math.floor(b.cost.metal * scale),
            crystal: Math.floor(b.cost.crystal * scale),
            deuterium: Math.floor(b.cost.deuterium * scale)
        };
    },

    formatNum(num) {
        return new Intl.NumberFormat('pt-PT').format(Math.floor(num));
    }
};