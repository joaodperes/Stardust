export const icons = {
    metal: "🔘",
    crystal: "💎",
    deuterium: "🧪",
    energy: "⚡"
};

const INITIAL_RESOURCES = { metal: 2000, crystal: 1000, deuterium: 200, energy: 50, maxEnergy: 50 };

// Helper to keep the object creation clean
function createBuilding(name, desc, mCost, cCost, dCost, bProd, bTime, eWeight = 0, unit = "/h", req = null, bonus = null) {
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
        req: req ? req : null,
        bonus: bonus ? bonus : null
    };
}

export let gameData = {
    currentTab: "overview",
    planetName: "Unknown Sector",
    coordinates: "0:0:0:0",
    score: 0,
    resources: { ...INITIAL_RESOURCES },
    buildings: {
        mine: createBuilding("Metal Mine", "Primary source of metal for construction.", 60, 15, 0, 60, 10, 10, "/h"),
        crystal: createBuilding("Crystal Drill", "Extracts crystals needed for electronics.", 48, 24, 0, 30, 12, 12, "/h"),
        deuterium: createBuilding("Deuterium Synthesizer", "Processes deuterium from water isotopes.", 225, 75, 0, 15, 15, 25, "/h"),
        solar: createBuilding("Solar Plant", "Generates clean energy for your base.", 75, 30, 0, 0, 8, -25, " Energy"),
        robotics: createBuilding("Robotics Factory", "Speeds up building and ship construction.", 400, 120, 200, 0, 40, 0, "% Time", [{ level: 1, requires: { mine: 2 } }], { type: "buildTimeReduction", value: 0.01 }),
        hangar: createBuilding("Ship Hangar", "Required to build and repair spacecraft.", 400, 200, 100, 0, 50, 0, "", [{ level: 1, requires: { robotics: 2 } }, { level: 3, requires: { robotics: 5 } }], { type: "shipTimeReduction", value: 0.01 }),
        lab: createBuilding("Research Lab", "Unlocked advanced technologies and upgrades.", 200, 400, 200, 0, 60, 0, "", [{ level: 1, requires: { solar: 1 } }, { level: 3, requires: { solar: 5 } }, { level: 5, requires: { solar: 10 } }], { type: "researchTimeReduction", value: 0.01 }),
        metalStorage: createBuilding("Metal Warehouse", "Increases metal storage capacity.", 1000, 0, 0, 0, 120, 0, "storage", [{ level: 1, requires: { mine: 5 } }, { level: 5, requires: { mine: 10 } }]),
        crystalStorage: createBuilding("Crystal Warehouse", "Increases crystal storage capacity.", 1000, 500, 0, 0, 120, 0, "storage", [{ level: 1, requires: { crystal: 5 } }, { level: 5, requires: { crystal: 10 } }]),
        deutStorage: createBuilding("Deuterium Tank", "Increases deuterium storage capacity.", 1000, 1000, 1000, 0, 120, 0, "storage", [{ level: 1, requires: { deuterium: 5 } }, { level: 5, requires: { deuterium: 10 } }]),
        commandCenter: createBuilding("Command Center", "Increases fleet mission capacity.", 10000, 5000, 2000, 0, 600, 0, "missions", [{ level: 1, requires: { hangar: 1, robotics: 2 } },{ level: 2, requires: { hangar: 5, robotics: 5 } }, { level: 3, requires: { hangar: 8, robotics: 10 } }]),
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
            req: [
                { level: 1, requires: { lab: 1 } },
                { level: 5, requires: { lab: 5, solar: 10 } }, 
                { level: 8, requires: { lab: 8, deuterium: 10 } } 
            ],
            bonus: { stat: "energy", value: 0.01 }
        },
        laserTech: {
            name: "Laser Tech",
            level: 0,
            cost: { metal: 200, crystal: 100, deuterium: 0 },
            growth: 1.5,
            baseTime: 50,
            desc: "Increases attack power of 'Laser' ships by 1% per level.",
            req: [
                { level: 1, requires: { lab: 2, energyTech: 1 } },
                { level: 5, requires: { lab: 4, energyTech: 5 } },
                { level: 10, requires: { lab: 8, energyTech: 10, crystal: 10 } } 
            ],
            bonus: {
                targetTag: "laser",
                stat: "attack",
                value: 0.01,
                type: "multiplicative"
            }
        },
        combustion: {
            name: "Combustion Drive",
            level: 0,
            cost: { metal: 400, crystal: 0, deuterium: 600 },
            growth: 2,
            baseTime: 80,
            desc: "Increases speed of 'Combustion' ships by 1% per level.",
            req: [
                { level: 1, requires: { lab: 2, energyTech: 1 } },
                { level: 6, requires: { lab: 5, energyTech: 4, deuterium: 5 } }
            ],
            bonus: {
                targetTag: "combustion",
                stat: "speed",
                value: 0.01,
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
            req: [
                { level: 1, requires: { lab: 2 } },
                { level: 4, requires: { lab: 4, mine: 10 } }, // Needs significant Metal production
                { level: 8, requires: { lab: 8, mine: 20, robotics: 10 } } // Needs advanced infrastructure
            ],
            bonus: {
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
            req: [
                { level: 1, requires: { lab: 3 } },
                { level: 3, requires: { lab: 5, robotics: 3 } },
                { level: 6, requires: { lab: 8, robotics: 6} }
            ],
        },
        /*
        metallurgy: {
            name: "Metallurgy",
            level: 0,
            cost: { metal: 0, crystal: 1600, deuterium: 800 },  
            growth: 2,
            baseTime: 360,
            desc: "Increases metal production by 1% per level.",
            req: [
                { level: 1, requires: { mine: 10, lab: 3, energyTech: 3 } }
            ],
            bonus: { stat: "metalProd", value: 0.01 }
        },
        impulsion: {
            name: "Impulsion Drive",
            level: 0,
            cost: { metal: 4000, crystal: 0, deuterium: 6000 },
            growth: 2,
            baseTime: 120,
            desc: "Increases speed of 'Impulsion' ships by 1% per level.",
            req: [
                { level: 1, requires: { lab: 4, energyTech: 3, combustionTech: 2 } },
                { level: 5, requires: { lab: 10, energyTech: 7, deuterium: 10 } }
            ],
            bonus: {
                targetTag: "impulsion",
                stat: "speed",
                value: 0.01,
                type: "multiplicative" 
            }
        },
        warp: {
            name: "Warp Drive",
            level: 0,
            cost: { metal: 15000, crystal: 20000, deuterium: 50000 },
            growth: 2,
            baseTime: 360,
            desc: "Increases speed of 'Warp' ships by 1% per level.",
            req: [
                { level: 1, requires: { lab: 8, hangar: 5, robotics: 5 energyTech: 5, laserTech: 5 } }
            ],
            bonus: {
                targetTag: "warp",
                stat: "speed",
                value: 0.01,
                type: "multiplicative" 
            }
        }
        */
    },
    construction: { 
        buildingKey: null, 
        timeLeft: 0, 
        totalTime: 0 
    },
    shipQueue: [], // Array of objects: { key: 'fighter', amount: 10, timeLeft: 30, totalTime: 30 }
    researchQueue: [],
    lastTick: Date.now()
};

// Function to reset gameData to initial state
export function resetGameData() {
    gameData.currentTab = "buildings";
    gameData.resources = { ...INITIAL_RESOURCES };
    gameData.construction = null;
    gameData.shipQueue = [];
    gameData.researchQueue = [];
    gameData.lastTick = Date.now();
    
    // Reset all buildings to level 0
    for (let key of Object.keys(gameData.buildings)) {
        gameData.buildings[key].level = 0;
    }
    
    // Reset all ships to count 0
    for (let key of Object.keys(gameData.ships)) {
        gameData.ships[key].count = 0;
    }
    
    // Reset all research to level 0
    for (let key of Object.keys(gameData.research)) {
        gameData.research[key].level = 0;
    }
}