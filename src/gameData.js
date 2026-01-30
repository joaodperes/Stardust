export const icons = {
    metal: "🔘",
    crystal: "💎",
    deuterium: "🧪",
    energy: "⚡"
};

// Helper to keep the object creation clean
function createBuilding(name, desc, mCost, cCost, dCost, bProd, bTime, eWeight = 0, unit = "/h", req = null) {
    return {
        name,
        desc,
        unit,
        level: 0,
        cost: { metal: mCost, crystal: cCost, deuterium: dCost },
        baseProd: bProd,
        baseTime: bTime,
        energyWeight: eWeight,
        growth: 1.15, // Costs increase by 15% per level
        timeGrowth: 1.2, // Time increases by 20% per level
        req: req ? req : null
    };
}

export let gameData = {
    currentTab: "buildings", // Default tab
    resources: { 
        metal: 200, 
        crystal: 100, 
        deuterium: 0,
        energy: 0, 
        maxEnergy: 0 
    },
    buildings: {
        mine: createBuilding("Metal Mine", "Produces metal", 60, 15, 0, 60, 10, 10, "/h"),
        crystal: createBuilding("Crystal Drill", "Produces crystal", 48, 24, 0, 30, 15, 10, "/h"),
        deuterium: createBuilding("Deuterium Synthesizer", "Produces deuterium", 225, 75, 0, 10, 25, 30, "/h", {
            mine: { 1: 5, 5 : 10 }, // Lvl 1: requires Mine Lvl 5; Lvl 5: requires Mine Lvl 10
            crystal: { 2 : 2} 
        }),
        solar: createBuilding("Solar Plant", "Produces energy", 75, 30, 0, 0, 20, -20,"⚡"), //negative energyWeight means production
        robotics: createBuilding("Robotics Factory", "Reduces construction time", 400, 200, 100, 0, 120, 0,"% Time", {
                mine: { 1 : 10 },
                solar: { 10 : 30},
                deuterium: { 10 : 15 }
        }),
        hangar: createBuilding("Hangar", "Required to build spacecraft", 1000, 800, 600, 0, 120, 0, "N/A", {
            robotics: { 1: 3 },
            robotics: { 3: 5 }
        }),
    },
    ships: {
        fighter: {
            name: "Light Fighter",
            desc: "Fast, agile, but fragile.",
            cost: { metal: 3000, crystal: 1000, deuterium: 0 },
            stats: { attack: 50, shield: 10, armor: 400 },
            baseTime: 30,
            count: 0,
            req: { hangar: 1 }
        },
        cargo: {
            name: "Small Cargo",
            desc: "Transports resources.",
            cost: { metal: 2000, crystal: 2000, deuterium: 0 },
            stats: { attack: 5, shield: 10, armor: 400, capacity: 5000 },
            baseTime: 40,
            count: 0,
            req: { hangar: 2 }
        }
    },
    construction: { 
        buildingKey: null, 
        timeLeft: 0, 
        totalTime: 0 
    },
    shipQueue: [], // Array of objects: { key: 'fighter', amount: 10, timeLeft: 30, totalTime: 30 }
    lastTick: Date.now()
};