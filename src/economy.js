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
        let produced = 0;
        let consumed = 0;

        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            if (b.level === 0) continue;

            // Formula: Base * Level * (1.1 ^ Level)
            // You can tweak 1.1 to change difficulty. OGame uses ~1.1
            let energyFactor = Math.floor(b.energyWeight * b.level * Math.pow(1.1, b.level));

            if (b.energyWeight < 0) {
                // It's a producer (Solar) - convert negative to positive
                produced += Math.abs(energyFactor);
            } else {
                // It's a consumer
                consumed += energyFactor;
            }
        }

        gameData.resources.maxEnergy = produced;
        gameData.resources.energy = produced - consumed;
    },
    formatNum(num) {
        const suffixes = [
            "",      // 10^0
            "k",     // 10^3
            "M",     // 10^6
            "kM",    // 10^9 (milliard)
            "B",     // 10^12 (billion)
            "kB",    // 10^15 (billiard)
            "T",     // 10^18 (trillion)
            "kT",    // 10^21 (trilliard)
            "Qa",    // 10^24 (quadrillion)
            "kQa",   // 10^27 (quadrilliard)
            "Qi",    // 10^30 (quintillion)
            "kQi"    // 10^33 (quintilliard)
        ];

        const tier = Math.floor(Math.log10(num) / 3);

        if (tier <= 0) return num.toString();
        if (tier >= suffixes.length) return num.toExponential(2);

        const suffix = suffixes[tier];
        const scale = Math.pow(10, tier * 3);

        return (num / scale).toFixed(1).replace(/\.0$/, "") + suffix;
    },
    
    formatTime(seconds) {
        if (seconds <= 0) return "0s";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        const hDisplay = h > 0 ? h + "h " : "";
        const mDisplay = m > 0 ? m + "m " : "";
        const sDisplay = s > 0 ? s + "s" : (h === 0 && m === 0 ? "0s" : "");
        return hDisplay + mDisplay + sDisplay;
    }
};