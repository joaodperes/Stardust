export const icons = {
    metal: "🔘",
    crystal: "💎",
    deuterium: "🧪",
    energy: "⚡"
};

export let gameData = {
    resources: { metal: 0, energy: 0, maxEnergy: 0, crystal: 0, deuterium: 0 },
    buildings: {
        mine: { name: "Metal Mine", level: 0, cost: { metal: 10, crystal: 0, deuterium: 0 }, baseProd: 5, baseTime: 15 },
        solar: { name: "Solar Plant", level: 0, cost: { metal: 30, crystal: 15, deuterium: 0 }, baseProd: 5, baseTime: 20 },
        crystal: { name: "Crystal Drill", level: 0, cost: { metal: 50, crystal: 20, deuterium: 0 }, baseProd: 10, baseTime: 30 },
        deuterium: { name: "Deuterium Synthesizer", level: 0, cost: { metal: 150, crystal: 50, deuterium: 0 }, baseProd: 1, baseTime: 60, req: { mine: 5, solar: 2 } }
    },
    construction: { buildingKey: null, timeLeft: 0, totalTime: 0 },
    lastTick: Date.now()
};