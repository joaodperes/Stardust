import { gameData } from './gameData.js';

export const Economy = {
    // Standard Exponential Cost: Base * (Growth ^ Level)
    getCost(key, type = 'building') {
    let item;
    if (type === 'building') item = gameData.buildings[key];
    else if (type === 'research') item = gameData.research[key];
    else if (type === 'ship') item = gameData.ships[key];

    if (!item) return { metal: 0, crystal: 0, deuterium: 0 };

    // Ships are flat cost, buildings/research grow exponentially
    const level = item.level ?? 0;
    const factor = (type === 'ship') ? 1 : Math.pow(item.growth, level);

    return {
        metal: Math.floor(item.cost.metal * factor),
        crystal: Math.floor(item.cost.crystal * factor),
        deuterium: Math.floor(item.cost.deuterium * factor)
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
        const item = gameData.buildings[key] || gameData.ships[key] || gameData.research[key];
        if (!item || !item.req) return { met: true, missing: [] };

        let met = true;
        let missing = [];

        for (const [reqKey, requiredLvl] of Object.entries(item.req)) {
            // Look for the requirement in both buildings and research
            const currentLvl = (gameData.buildings[reqKey]?.level) ?? (gameData.research[reqKey]?.level) ?? 0;
            
            if (currentLvl < requiredLvl) {
                met = false;
                const name = gameData.buildings[reqKey]?.name || gameData.research[reqKey]?.name || reqKey;
                missing.push(`${name} Lvl ${requiredLvl}`);
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