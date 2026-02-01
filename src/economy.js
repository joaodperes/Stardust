import { gameData } from './gameData.js';

export const Economy = {
    getCost(key, type = 'building') {
        let item;
        if (type === 'building') item = gameData.buildings[key];
        else if (type === 'research') item = gameData.research[key];
        else if (type === 'ship') item = gameData.ships[key];

        if (!item) return { metal: 0, crystal: 0, deuterium: 0 };

        const level = item.level ?? 0;
        const factor = (type === 'ship') ? 1 : Math.pow(item.growth || 1.5, level);

        return {
            metal: Math.floor(item.cost.metal * factor),
            crystal: Math.floor(item.cost.crystal * factor),
            deuterium: Math.floor(item.cost.deuterium * factor)
        };
    },

    getProduction() {
        let b = gameData.buildings;
        const metalMult = this.getBonus('metalProd');
        const crystalMult = this.getBonus('crystalProd');
        const deutMult = this.getBonus('deutProd');

        let metalHourly = ((b.mine.level * b.mine.baseProd) * metalMult) + 30; 
        let crystalHourly = ((b.crystal.level * b.crystal.baseProd) * crystalMult) + 15;
        let deutHourly = ((b.deuterium.level * b.deuterium.baseProd) * deutMult);

        let prod = {
            metal: metalHourly / 3600,
            crystal: crystalHourly / 3600,
            deuterium: deutHourly / 3600
        };

        if (gameData.resources.energy < 0) {
            prod.metal *= 0.1;
            prod.crystal *= 0.1;
            prod.deuterium *= 0.1;
        }

        return prod;
    },

    getBonus(stat, tags = []) {
        let multiplier = 1.0;
        
        // Loop through ALL research to find relevant bonuses
        for (let key in gameData.research) {
            const tech = gameData.research[key];
            if (tech.level === 0 || !tech.bonus) continue;

            const b = tech.bonus;

            // Check 1: Does this tech affect the requested stat? (e.g. "attack")
            if (b.stat !== stat) continue;

            // Check 2: Does the target have the required tag? (e.g. "laser")
            // If targetTag is null, it applies to everything (Global Bonus)
            if (b.targetTag && !tags.includes(b.targetTag)) continue;

            // Apply Bonus
            // Example: Level 5 * 0.05 = +25%
            // Multiplier becomes 1.0 + 0.25 = 1.25
            multiplier += (tech.level * b.value);
        }

        return multiplier;
    },

    getShipStats(key) {
        const s = gameData.ships[key];
        const tags = s.tags || [];
        const statsToCalculate = ['attack', 'armor', 'shield', 'speed', 'capacity', 'energyProd'];
        const finalStats = {};
        statsToCalculate.forEach(stat => {
            const baseValue = s.stats[stat] || 0;
            finalStats[stat] = Math.floor(baseValue * this.getBonus(stat, tags));
        });
        return finalStats;
    },

    checkRequirements(key) {
        const item = gameData.buildings[key] || gameData.research[key] || gameData.ships[key];
        if (!item || !item.req) return { met: true, missing: [] };

        let met = true;
        let missing = [];

        for (const [reqKey, requiredLvl] of Object.entries(item.req)) {
            const currentLvl = (gameData.buildings[reqKey]?.level) ?? (gameData.research[reqKey]?.level) ?? 0;
            
            if (currentLvl < requiredLvl) {
                met = false;
                const name = gameData.buildings[reqKey]?.name || gameData.research[reqKey]?.name || reqKey;
                missing.push(`${name} Lvl ${requiredLvl}`);
            }
        }
        return { met, missing };
    },

    updateEnergy() {
        let consumption = 0;
        let production = 0;
        const energyMult = Economy.getBonus("energy");

        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            if (b.level === 0) continue;

            let p = b.level * Math.floor(Math.abs(b.energyWeight) * b.level * Math.pow(1.1, b.level));
            
            if (b.energyWeight > 0) consumption += p; 
            if (b.energyWeight < 0) production += Math.floor(p * energyMult); // Apply Bonus
        };

        for (let key in gameData.ships) {
            const s = gameData.ships[key];
            if (s.stats.energyProd) {
                production += Math.floor(s.stats.energyProd * s.count * energyMult);
            }
        }

        gameData.resources.maxEnergy = production;
        gameData.resources.energy = production - consumption;
    },

    formatNum(num) {
        if (!num || num === 0) return "0";
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
        if (!seconds || seconds <= 0) return "0s";
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