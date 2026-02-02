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
        growth: 1.5, 
        timeGrowth: 1.2,
        req: req ? req : null
    };
}

export let gameData = {
    currentTab: "buildings",
    resources: { 
        metal: 500, 
        crystal: 300, 
        deuterium: 0,
        energy: 50, 
        maxEnergy: 0 
    },
    buildings: {
        mine: createBuilding("Metal Mine", "Primary source of metal for construction.", 60, 15, 0, 60, 10, 10, "/h"),
        crystal: createBuilding("Crystal Drill", "Extracts crystals needed for electronics.", 48, 24, 0, 30, 12, 12, "/h"),
        deuterium: createBuilding("Deuterium Synthesizer", "Processes deuterium from water isotopes.", 225, 75, 0, 15, 15, 25, "/h"),
        solar: createBuilding("Solar Plant", "Generates clean energy for your base.", 75, 30, 0, 0, 8, -25, " Energy"),
        robotics: createBuilding("Robotics Factory", "Speeds up building and ship construction.", 400, 120, 200, 0, 40, 0, "% Time"),
        hangar: createBuilding("Ship Hangar", "Required to build and repair spacecraft.", 400, 200, 100, 0, 50, 0, " Space", { robotics: 2 }),
        lab: createBuilding("Research Lab", "Unlocked advanced technologies and upgrades.", 200, 400, 200, 0, 60, 0, " Tech")
    },
    ships: {
        fighter: {
            name: "Light Fighter",
            desc: "Agile, low-cost interceptor utilizing laser technology.",
            cost: { metal: 3000, crystal: 1000, deuterium: 0 },
            stats: { attack: 50, shield: 10, armor: 40, speed: 125 },
            tags: ["laser", "combustion"], // Benefits from Laser Tech & Combustion
            baseTime: 20,
            count: 0,
            req: { hangar: 1, laserTech: 1 }
        },
        heavy_fighter: {
            name: "Heavy Fighter",
            desc: "Better armored, high-damage vessel with laser arrays.",
            cost: { metal: 6000, crystal: 4000, deuterium: 0 },
            stats: { attack: 150, shield: 25, armor: 100, speed: 100 },
            tags: ["laser", "combustion"],
            baseTime: 120,
            count: 0,
            req: { hangar: 3, laserTech: 3, armorTech: 3 }
        },
        transporter: {
            name: "Small Cargo",
            desc: "Lightweight transport designed for speed and hauling.",
            cost: { metal: 2000, crystal: 2000, deuterium: 0 },
            stats: { attack: 5, shield: 10, armor: 40, capacity: 5000, speed: 125 },
            tags: ["combustion"], 
            baseTime: 40,
            count: 0,
            req: { hangar: 2, armorTech: 1 }
        },
        satellite: {
            name: "Solar Satellite",
            desc: "Generates additional energy for your base.",
            cost: { metal: 0, crystal: 2000, deuterium: 500 },
            stats: { attack: 0, shield: 10, armor: 10, energyProd: 10, speed: 0 },
            tags: [], 
            baseTime: 15,
            count: 0,
            req: { hangar: 1, energyTech: 5 }
        },
        spycraft: {
            name: "Spy Probe",
            desc: "Small, fast probe used for reconnaissance missions.",
            cost: { metal: 0, crystal: 1000, deuterium: 0 },
            stats: { attack: 0, shield: 5, armor: 5, speed: 250 },
            tags: ["combustion"],
            baseTime: 20,
            count: 0,
            req: { hangar: 1, energyTech: 1, spyTech: 2 }
        }
    },
    research: {
        energyTech: {
            name: "Energy Tech",
            level: 0,
            cost: { metal: 0, crystal: 800, deuterium: 400 },
            growth: 2,
            baseTime: 100,
            desc: "Improves energy production by 1% per level.",
            req: { lab: 1 },
            bonus: { stat: "energy", value: 0.01 }
        },
        laserTech: {
            name: "Laser Tech",
            level: 0,
            cost: { metal: 200, crystal: 100, deuterium: 0 },
            growth: 1.5,
            baseTime: 50,
            desc: "Increases attack power of 'Laser' ships by 1% per level.",
            req: { lab: 2, energyTech: 1 },
            bonus: {
                targetTag: "laser", // Only affects things with this tag
                stat: "attack",     // Affects this stat
                value: 0.01,        // 5% per level (example)
                type: "multiplicative" // or "additive"
            }
        },
        combustion: {
            name: "Combustion Drive",
            level: 0,
            cost: { metal: 400, crystal: 0, deuterium: 600 },
            growth: 2,
            baseTime: 80,
            desc: "Increases speed of 'Combustion' ships by 1% per level.",
            req: { lab: 2 },
            bonus: {
                targetTag: "combustion",
                stat: "speed",
                value: 0.01, // 1% per level
                type: "multiplicative" 
            }
        },
        armorTech: {
            name: "Armor Tech",
            level: 0,
            cost: { metal: 1000, crystal: 0, deuterium: 0 },
            growth: 1.6,
            baseTime: 60,
            desc: "Strengthens ship hulls.",
            req: { lab: 2 },
            bonus: {
                // If targetTag is null/missing, it affects ALL ships
                targetTag: null, 
                stat: "armor",
                value: 0.05,
                type: "multiplicative"
            }
        },
        spyTech: {
            name: "Spy Technology",
            level: 0,
            cost: { metal: 0, crystal: 2000, deuterium: 1000 },
            growth: 2,
            baseTime: 120,
            desc: "Enhances spy probe capabilities.",
            req: { lab: 3, robotics: 3 },
        },
        /*
        metallurgy: {
            name: "Metallurgy",
            level: 0,
            cost: { metal: 0, crystal: 1600, deuterium: 800 },  
            growth: 2,
            baseTime: 360,
            desc: "Increases metal production by 1% per level.",
            req: { lab: 3, energyTech: 5 },
            bonus: { stat: "metalProd", value: 0.01 }
        },
        */
    },
    construction: { 
        buildingKey: null, 
        timeLeft: 0, 
        totalTime: 0 
    },
    shipQueue: [], // Array of objects: { key: 'fighter', amount: 10, timeLeft: 30, totalTime: 30 }
    researchQueue: { 
        buildingKey: null, 
        timeLeft: 0, 
        totalTime: 0 
    },
    lastTick: Date.now()
};