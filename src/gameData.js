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
        mine: createBuilding("Metal Mine", "Produces metal", 60, 15, 0, 60, 10, 2, "/h"),
        crystal: createBuilding("Crystal Drill", "Produces crystal", 48, 24, 0, 30, 15, 1, "/h"),
        deuterium: createBuilding("Deuterium Synthesizer", "Produces deuterium", 225, 75, 0, 10, 25, 3, "/h", {
            mine: { 1: 5, 5 : 10 }, // Lvl 1: requires Mine Lvl 5; Lvl 5: requires Mine Lvl 10
            crystal: { 2 : 2} 
        }),
        solar: createBuilding("Solar Plant", "Produces energy", 75, 30, 0, 0, 20, -20,"⚡"), //negative energyWeight means production
        robotics: createBuilding("Robotics Factory", "Reduces construction time", 400, 200, 100, 0, 120, 0,"% Time", {
                mine: { 1 : 10 },
                solar: { 10 : 30},
                deuterium: { 10 : 15 }
        })
    },
    construction: { 
        buildingKey: null, 
        timeLeft: 0, 
        totalTime: 0 
    },
    lastTick: Date.now()
};