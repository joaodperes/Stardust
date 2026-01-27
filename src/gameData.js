export const icons = {
    metal: "🔘",
    crystal: "💎",
    deuterium: "🧪",
    energy: "⚡"
};

// Helper to keep the object creation clean
function createBuilding(name, desc, mCost, cCost, dCost, bProd, bTime, req = null) {
    return {
        name,
        desc,
        level: 0,
        cost: { metal: mCost, crystal: cCost, deuterium: dCost },
        baseProd: bProd,
        baseTime: bTime,
        growth: 1.15, // Costs increase by 15% per level
        timeGrowth: 1.2, // Time increases by 20% per level
        req
    };
}

export let gameData = {
    resources: { 
        metal: 200, 
        crystal: 100, 
        deuterium: 0,
        energy: 0, 
        maxEnergy: 0 
    },
    buildings: {
        mine: createBuilding("Metal Mine", "Produces metal", 60, 15, 0, 60, 10),
        crystal: createBuilding("Crystal Drill", "Produces crystal", 48, 24, 0, 30, 15),
        deuterium: createBuilding("Deuterium Synthesizer", "Produces deuterium", 225, 75, 0, 10, 25, { mine: 5, crystal: 2 }),
        solar: createBuilding("Solar Plant", "Produces energy", 75, 30, 0, 20, 20),
        robotics: createBuilding("Robotics Factory", "Reduces construction time", 400, 120, 0, 0, 120, {mine: 10 })
    },
    construction: { 
        buildingKey: null, 
        timeLeft: 0, 
        totalTime: 0 
    },
    lastTick: Date.now()
};