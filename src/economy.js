import { gameData } from './gameData.js';

export const Economy = {
    getCost(key, type = 'building') {
        const category = type === 'building' ? 'buildings' : type;
        const item = gameData[category]?.[key];

        if (!item) return { metal: 0, crystal: 0, deuterium: 0 };

        const level = item.level || 0;
        const growth = item.growth || 1.5; // Ensure we don't multiply by 0
        
        // Buildings scale exponentially; ships stay flat (1)
        const factor = (type === 'ship') ? 1 : Math.pow(growth, level);

        return {
            metal: Math.max(0, Math.floor((item.cost?.metal || 0) * factor)),
            crystal: Math.max(0, Math.floor((item.cost?.crystal || 0) * factor)),
            deuterium: Math.max(0, Math.floor((item.cost?.deuterium || 0) * factor))
        };
    },

    getProduction() {
        if (!gameData.buildings || !gameData.resources) {
            return { metalHourly: 0, crystalHourly: 0, deutHourly: 0, energyProd: 0, energyCons: 0 };
        }

        // 1. Refresh Energy first to check for penalty
        this.updateEnergy();
        const energyPenalty = gameData.resources.energy < 0 ? 0.1 : 1.0;

        const b = gameData.buildings;
        const metalMult = this.getBonus('metalProd');
        const crystalMult = this.getBonus('crystalProd');
        const deutMult = this.getBonus('deutProd');

        // 2. Apply the penalty to the final hourly calculation
        let metalHourly = (((b.mine?.level || 0) * (b.mine?.baseProd || 0) * metalMult) + 30) * energyPenalty; 
        let crystalHourly = (((b.crystal?.level || 0) * (b.crystal?.baseProd || 0) * crystalMult) + 15) * energyPenalty;
        let deuteriumHourly = ((b.deuterium?.level || 0) * (b.deuterium?.baseProd || 0) * deutMult) * energyPenalty;

        return { 
            metalHourly, 
            crystalHourly, 
            deuteriumHourly, 
            energyProd: gameData.resources.maxEnergy, 
            energyCons: (gameData.resources.maxEnergy - gameData.resources.energy) 
        };
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

    deductResources(costs) {
        const m = costs.metal || 0;
        const c = costs.crystal || 0;
        const d = costs.deuterium || 0;

        gameData.resources.metal -= m;
        gameData.resources.crystal -= c;
        gameData.resources.deuterium -= d;

        // 1 point per 1,000 resources spent
        const totalSpent = m + c + d;
        gameData.score += (totalSpent / 1000); 
        
        //console.log(`Score increased by ${totalSpent / 1000}. New Score: ${gameData.score}`);
    },

    calculateStorageAtLevel(level) {
        const baseCap = 10000;
        if (level === 0) return baseCap;

        // Logarithmic Formula: Base + (ScalingFactor * log(level + 1))
        // Math.log is natural log (ln). level + 1 prevents log(0).
        const scalingFactor = 50000; 
        return Math.floor(baseCap + (scalingFactor * Math.log(level + 1)));
    },
    getStorageCapacity(resType) {
        const storageBuildingMap = { metal: 'metalStorage', crystal: 'crystalStorage', deuterium: 'deutStorage' };
        const bKey = storageBuildingMap[resType];
        if (!bKey) return Infinity;

        const level = gameData.buildings[bKey]?.level || 0;
        return this.calculateStorageAtLevel(level);
    },

    getProtectedAmount(resType) {
        // 10% of current resources are "Safe"
        return (gameData.resources[resType] || 0) * 0.10;
    },

    updateResources(delta) {
        const prod = this.getProduction();
        
        ['metal', 'crystal', 'deuterium'].forEach(res => {
            const cap = this.getStorageCapacity(res) || 10000; // Fallback to base cap
            const hourly = prod[`${res}Hourly`] || 0;         // Fallback to 0
            
            const amountToAdd = (hourly / 3600) * delta;
            
            // Ensure current value is a valid number before adding
            const current = gameData.resources[res] || 0;
            const newValue = current + amountToAdd;

            // Final safety check: if newValue is NaN for any reason, don't update
            if (!isNaN(newValue)) {
                gameData.resources[res] = Math.min(cap, newValue);
            }
        });

        this.updateEnergy();
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
        // If no item or no reqs, return met
        if (!item || !item.req) return { met: true, missing: [] };

        const currentLevel = item.level ?? item.count ?? 0;
        const targetLevel = currentLevel + 1; // We check requirements for the NEXT level

        let activeReqs = {};

        // HANDLE TIERED REQUIREMENTS (Array)
        if (Array.isArray(item.req)) {
            // 1. Sort tiers by level ascending
            // 2. Find the highest tier that is <= targetLevel
            const tiers = item.req.sort((a, b) => a.level - b.level);
            let applicableTier = null;

            for (let tier of tiers) {
                if (targetLevel >= tier.level) {
                    applicableTier = tier;
                }
            }

            // If we found a tier, use its requirements. 
            // If targetLevel is lower than the first tier (unlikely if starts at 1), we assume no reqs or keep previous.
            if (applicableTier) {
                activeReqs = applicableTier.requires;
            }
        } 
        // HANDLE FLAT REQUIREMENTS (Object)
        else {
            activeReqs = item.req;
        }

        let met = true;
        let missing = [];

        for (const [reqKey, requiredLvl] of Object.entries(activeReqs)) {
            const reqItem = gameData.buildings[reqKey] || gameData.research[reqKey];
            const currentLvl = reqItem ? reqItem.level : 0;
            
            if (currentLvl < requiredLvl) {
                met = false;
                const name = reqItem ? reqItem.name : reqKey;
                missing.push(`${name} Lvl ${requiredLvl}`);
            }
        }
        return { met, missing };
    },

    getQueueLimit(type) {
        const level = gameData.buildings[type === 'research' ? 'lab' : 'hangar'].level;
        
        // Custom Tiers: Research might be stricter than Hangar
        if (type === 'research') {
            if (level >= 12) return 3;
            if (level >= 5) return 2;
            return 1;
        } else {
            // Hangar Tiers
            if (level >= 10) return 3;
            if (level >= 3) return 2;
            return 1;
        }
    },

    canQueue(type) {
        const buildingKey = type === 'research' ? 'lab' : 'hangar';
        
        // FEATURE PRESERVATION: Block if the producer building is currently being upgraded
        if (gameData.construction?.buildingKey === buildingKey) {
            return { can: false, reason: `Cannot start ${type} while ${gameData.buildings[buildingKey].name} is upgrading.` };
        }

        const limit = this.getQueueLimit(type);
        const currentQueue = type === 'research' ? gameData.researchQueue : gameData.shipQueue;

        if (currentQueue.length >= limit) {
            // Dynamic error message based on current level
            const nextUnlock = type === 'research' ? (limit === 1 ? 5 : 12) : (limit === 1 ? 3 : 10);
            return { can: false, reason: `Queue full! Upgrade to Level ${nextUnlock} for more slots.` };
        }

        return { can: true };
    },

    updateEnergy() {
        let consumption = 0;
        let production = 50; // Base value for players starting out
        const energyMult = this.getBonus("energyProd");

        for (let key in gameData.buildings) {
            const b = gameData.buildings[key];
            const level = b.level || 0;
            if (level === 0) continue;

            const eWeight = b.energyWeight || 0;

            if (eWeight > 0) {
                // Consumption: base * level * (1.1 ^ level)
                // This starts small but scales significantly at high levels
                consumption += Math.ceil(eWeight * level * Math.pow(1.1, level)); 
            } 
            else if (eWeight < 0) {
                // Solar Production: base * level * (1.5 ^ level)
                const base = Math.abs(eWeight);
                production += Math.floor(base * level * Math.pow(1.5, level) * energyMult); 
            }
        }

        // Solar Satellites (Linear production)
        if (gameData.ships) {
            for (let key in gameData.ships) {
                const s = gameData.ships[key];
                if (s.stats?.energyProd && s.count > 0) {
                    production += Math.floor(s.stats.energyProd * s.count * energyMult);
                }
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