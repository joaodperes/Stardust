import { gameData } from './gameData.js';
import { Economy } from './economy.js';
import { auth, saveMission, updateMission, removeMission, loadMissions, updateUserResources, updateUserShips, saveMissionReport } from './firebase.js';
import { GalaxySystem } from './GalaxySystem.js';
import { UI } from './UI.js';
import { SaveSystem } from './SaveSystem.js';
import { FleetUI } from './FleetUI.js';

// --- FLEET MANAGEMENT SYSTEM ---
export const Fleet = {

    async loadUserMissions() {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const missions = await loadMissions(uid);
        gameData.fleets = Object.values(missions);
    },
    
    // --- 1. CORE CALCULATIONS ---

    calculateDistance(coordsA, coordsB) {
        const parse = (c) => {
            const clean = c.replace(/[\[\]]/g, '').split(':');
            return { sys: parseInt(clean[0]), pl: parseInt(clean[1]) };
        };
        
        const a = parse(coordsA);
        const b = parse(coordsB);

        if (a.sys === b.sys) {
            return Math.abs(a.pl - b.pl) * 5 + 1000;
        }
        return Math.abs(a.sys - b.sys) * 2000 + 2700;
    },

    calculateFleetSpeed(fleetShips) {
        let slowestSpeed = Infinity;
        
        for (const shipKey in fleetShips) {
            const count = fleetShips[shipKey];
            
            if (count > 0) {
                const ship = gameData.ships[shipKey];
                
                if (!ship) {
                    continue;
                }
                
                const stats = Economy.getShipStats(shipKey);
                
                if (stats && typeof stats.speed === 'number' && stats.speed < slowestSpeed) {
                    slowestSpeed = stats.speed;
                }
            }
        }
        
        return slowestSpeed === Infinity ? Infinity : slowestSpeed;
    },

    calculateFlightTime(distance, fleetSpeed) {
        if (fleetSpeed <= 0) return Infinity;
        const timeInSeconds = distance / fleetSpeed;
        return Math.max(10, timeInSeconds);
    },

    calculateFuelConsumption(distance, fleetShips) {
        let totalFuel = 0;
        
        for (const [key, count] of Object.entries(fleetShips)) {
            if (count <= 0) continue;
            
            const shipDef = gameData.ships[key];
            const baseCons = shipDef.stats.consumption || 1;
            
            // Formula: Base * (Distance / 35000) * Count
            // Added +1 base cost to prevent 0 fuel trips
            const shipFuel = 1 + Math.ceil(baseCons * count * (distance / 35000));
            
            totalFuel += shipFuel;
        }
        return totalFuel;
    },

    // --- 2. MISSION DISPATCH ---

    async startMission(missionType, targetCoords, ships, resources = {}) {
        const uid = auth.currentUser?.uid;
        if (!uid) {
            UI.showNotification("You must be logged in to start a mission.", "error");
            return false;
        }

        // 1. SHIP VALIDATION: Prevent sending 0 ships
        const shipCount = Object.values(ships).reduce((sum, count) => sum + count, 0);
        if (shipCount <= 0) {
            UI.showNotification("You must select at least one ship!", "error");
            return false;
        }

        // 2. MISSION TYPE VALIDATION
        if (missionType === 'spy') {
            // Spy missions can only include spy probes
            for (const [shipKey, count] of Object.entries(ships)) {
                if (count > 0 && shipKey !== 'spycraft') {
                    UI.showNotification("Spy missions can only send Spy Probes!", "error");
                    return false;
                }
            }
        } else if (missionType === 'transport') {
            // Transport missions must have capacity
            let totalCapacity = 0;
            for (const [shipKey, count] of Object.entries(ships)) {
                if (count > 0) {
                    const stats = Economy.getShipStats(shipKey);
                    totalCapacity += (stats.capacity || 0) * count;
                }
            }
            if (totalCapacity <= 0) {
                UI.showNotification("Transport fleet must have cargo capacity!", "error");
                return false;
            }
        } else if (missionType === 'colonize') {
            // Colonize missions can only include colonizer ships
            for (const [shipKey, count] of Object.entries(ships)) {
                if (count > 0 && shipKey !== 'colonizer') {
                    UI.showNotification("Colonization missions can only send Colonizer ships!", "error");
                    return false;
                }
            }
            
            // Check if target planet is empty
            const targetOwner = await GalaxySystem.getOwnerUid(targetCoords);
            if (targetOwner) {
                UI.showNotification("Target planet is already occupied!", "error");
                return false;
            }
        }

        const ccLevel = gameData.buildings.commandCenter?.level || 0;
        const maxMissions = 1 + ccLevel;
        
        if (gameData.fleets.length >= maxMissions) {
            UI.showNotification(`Command Center limit reached (${maxMissions} fleets max).`, "error");
            return false;
        }

        // Check availability
        for (const shipKey in ships) {
            if ((gameData.ships[shipKey].available || 0) < ships[shipKey]) {
                UI.showNotification(`Not enough ${gameData.ships[shipKey].name} available.`, "error");
                return false;
            }
        }

        const distance = this.calculateDistance(gameData.coordinates, targetCoords);
        const fleetSpeed = this.calculateFleetSpeed(ships);
        const travelTime = this.calculateFlightTime(distance, fleetSpeed) * 1000;
        const fuelCost = this.calculateFuelConsumption(distance, ships);

        // Require 2x fuel for round trip (with 10% safety margin)
        const totalFuelNeeded = Math.ceil(fuelCost * 2.1);
        
        if (gameData.resources.deuterium < totalFuelNeeded) {
            UI.showNotification(`Not enough deuterium! Required: ${totalFuelNeeded} (round trip + 10%)`, "error");
            return false;
        }

        // Deduct resources and ships locally and in Firebase
        const resourceChanges = { deuterium: -fuelCost };
        gameData.resources.deuterium -= fuelCost; // Update local state immediately
        
        // Deduct transported resources for transport/donation missions
        if (missionType === 'transport' || missionType === 'donation') {
            if (resources.metal) {
                resourceChanges.metal = -(resources.metal || 0);
                gameData.resources.metal -= resources.metal || 0;
            }
            if (resources.crystal) {
                resourceChanges.crystal = -(resources.crystal || 0);
                gameData.resources.crystal -= resources.crystal || 0;
            }
            if (resources.deuterium) {
                // Add to deut changes (already has fuel deduction)
                resourceChanges.deuterium -= resources.deuterium || 0;
                gameData.resources.deuterium -= resources.deuterium || 0;
            }
        }

        const shipChanges = {};
        for (const shipKey in ships) {
            shipChanges[shipKey] = -ships[shipKey];
            gameData.ships[shipKey].available -= ships[shipKey]; // Update local state
        }

        await updateUserResources(uid, resourceChanges);
        await updateUserShips(uid, shipChanges);

        const newFleet = {
            mission: missionType,
            origin: gameData.coordinates,
            target: targetCoords,
            ships: ships,
            resources: resources,
            departureTime: Date.now(),
            arrivalTime: Date.now() + travelTime,
            isReturning: false,
            id: `fleet_${Date.now()}`
        };
        
        await saveMission(uid, newFleet);
        gameData.fleets.push(newFleet);
        
        UI.showNotification("Fleet dispatched successfully!");
        return true;
    },

    // --- 5. UPDATE METHOD FOR GAME LOOP ---

    update(delta) {
        // Update mission timers - this is called from the game loop
        // The actual arrival processing happens in processFleetArrivals()
        // This method exists to satisfy the game loop call
    },

    // --- 3. GAME LOOP INTEGRATION ---

    async processFleetArrivals() { // Added async
        const now = Date.now();
        // Use a standard for loop to handle async/await properly inside the loop
        for (let i = 0; i < gameData.fleets.length; i++) {
            const fleet = gameData.fleets[i];

            if (now >= fleet.arrivalTime) {
                if (!fleet.isReturning) {
                    // IMPORTANT: We must wait for the mission logic to finish
                    // and flip the isReturning flag before the next tick
                    await this.handleMission(fleet); 
                } else {
                    await this.returnFleetHome(i);
                    i--; // Adjust index because we removed an element
                }
            }
        }
    },

    // --- 4. MISSION RESOLUTION ---

    async handleMission(fleet) {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const missionType = fleet.mission;

        // Handle different mission types
        try {
            if (fleet.mission === 'spy') {
                await this.handleSpyMission(fleet);
            } else if (fleet.mission === 'transport') {
                await this.handleTransportMission(fleet);
            } else if (fleet.mission === 'donation') {
                await this.handleDonationMission(fleet);
            } else {
                // Default handler for other missions (TBD)
            }
        } catch (err) {
            console.error(`Error processing ${missionType} mission:`, err);
            UI.showNotification(`Mission error: ${err.message}`, "error");
            // Continue with return journey even if mission processing fails
        }

        // Start Return Flight
        const fleetSpeed = this.calculateFleetSpeed(fleet.ships);
        const distance = this.calculateDistance(fleet.origin, fleet.target);
        const travelTime = this.calculateFlightTime(distance, fleetSpeed) * 1000;

        // If fleet has no ships left after the mission (e.g. all probes died)
        const totalShipsLeft = Object.values(fleet.ships || {}).reduce((a, b) => a + (b || 0), 0);

        if (totalShipsLeft <= 0) {
            await removeMission(uid, fleet.id);
            const idx = gameData.fleets.findIndex(f => f.id === fleet.id);
            if (idx !== -1) gameData.fleets.splice(idx, 1);
            UI.showNotification("Your fleet was entirely destroyed at the target.", "error");
            return; // Stop here, don't trigger return journey
        }

        const now = Date.now();
        const arrivalTime = now + travelTime;
        
        const updates = {
            isReturning: true,
            departureTime: now,
            arrivalTime: arrivalTime,
            ships: fleet.ships // Update in case some were destroyed
        };

        await updateMission(uid, fleet.id, updates);
        Object.assign(fleet, updates);
    },

    async returnFleetHome(fleetIndex) {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const fleet = gameData.fleets[fleetIndex];

        const shipChanges = {};
        for (const shipKey in fleet.ships) {
            const count = fleet.ships[shipKey];
            shipChanges[shipKey] = (shipChanges[shipKey] || 0) + count;
            if (gameData.ships[shipKey]) { 
                gameData.ships[shipKey].available += count;
            }
        }

        const resourceChanges = {};
        for (const resourceKey in fleet.resources) {
            resourceChanges[resourceKey] = (resourceChanges[resourceKey] || 0) + fleet.resources[resourceKey];
        }

        await updateUserShips(uid, shipChanges);
        if(Object.keys(resourceChanges).length > 0) {
            await updateUserResources(uid, resourceChanges);
        }
        
        await removeMission(uid, fleet.id);
        gameData.fleets.splice(fleetIndex, 1);
        
        if (gameData.currentTab === 'fleet') {
            FleetUI.renderMissionList();
        }
    },
    
    async createMissionReport(uid, reportData) {
        // Ensure missionReports array exists
        if (!gameData.missionReports) {
            gameData.missionReports = [];
        }
        
        // Add unique ID and read status
        reportData.id = reportData.id || `report_${Date.now()}`;
        reportData.isRead = reportData.isRead ?? false;
        
        // Add to local gameData
        gameData.missionReports.push(reportData);
        
        // If the reports tab is currently visible, refresh it
        if (gameData.currentTab === 'fleet' && document.getElementById('fleet-reports')?.style.display === 'block') {
            FleetUI.renderReportInbox();
        }
        
        // Update the badge immediately
        if (typeof UI !== 'undefined' && UI.updateMessageBadge) {
            UI.updateMessageBadge();
        }
        
        // Save to Firebase
        try {
            await saveMissionReport(uid, reportData);
        } catch (err) {
            console.error("Failed to save report to Firebase:", err);
        }
    },
    
    async notifyTarget(targetUid, message) {
        // In a real app, this would send a notification to the target user.
        console.log(`Notifying target ${targetUid}: ${message}`);
    },

    simulateBotResources(botId) {
        // Generate realistic bot resources based on their ID/seed
        const seed = botId?.split('_')[1] || '0';
        const baseMetal = 500 + (parseInt(seed) % 1000) * 10;
        const baseCrystal = 300 + ((parseInt(seed) * 7) % 800) * 8;
        const baseDeuterium = 100 + ((parseInt(seed) * 13) % 500) * 5;
        
        // Simulate some growth over time
        const daysPassed = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % 30;
        const growthMultiplier = 1 + (daysPassed * 0.05);
        
        return {
            metal: Math.floor(baseMetal * growthMultiplier),
            crystal: Math.floor(baseCrystal * growthMultiplier),
            deuterium: Math.floor(baseDeuterium * growthMultiplier)
        };
    },
    
    async handleTransportMission(fleet) {
        const uid = auth.currentUser?.uid;
        const targetUid = await GalaxySystem.getOwnerUid(fleet.target);
        
        if (!targetUid) {
            console.error("Target planet not found for transport mission");
            return;
        }
        
        // Deliver resources to target player
        if (fleet.resources && Object.keys(fleet.resources).length > 0) {
            const resourceChanges = {};
            for (const [key, value] of Object.entries(fleet.resources)) {
                if (value > 0) {
                    resourceChanges[key] = value;
                }
            }
            
            if (Object.keys(resourceChanges).length > 0) {
                await updateUserResources(targetUid, resourceChanges);
                
                // Create mission report for sender
                const report = {
                    type: 'transport',
                    target: fleet.target,
                    time: Date.now(),
                    resources: fleet.resources,
                    message: "Transport successful! Resources delivered."
                };
                
                // Note: You'd use saveMissionReport if that function exists
                // await saveMissionReport(uid, report);
                
                UI.showNotification("Resources delivered successfully!");
            }
        }
        
        // Clear transported resources so they don't return
        fleet.resources = {};
    },
    
    async handleDonationMission(fleet) {
        const uid = auth.currentUser?.uid;
        const targetUid = await GalaxySystem.getOwnerUid(fleet.target);
        
        if (!targetUid) {
            console.error("Target planet not found for donation mission");
            return;
        }
        
        // Donate resources to target player
        if (fleet.resources && Object.keys(fleet.resources).length > 0) {
            const resourceChanges = {};
            for (const [key, value] of Object.entries(fleet.resources)) {
                if (value > 0) {
                    resourceChanges[key] = value;
                }
            }
            
            if (Object.keys(resourceChanges).length > 0) {
                await updateUserResources(targetUid, resourceChanges);
            }
        }
        
        // Donate ships to target player (they stay there, don't return)
        if (fleet.ships && Object.keys(fleet.ships).length > 0) {
            const shipChanges = {};
            for (const [key, count] of Object.entries(fleet.ships)) {
                if (count > 0) {
                    shipChanges[key] = count;
                }
            }
            
            if (Object.keys(shipChanges).length > 0) {
                await updateUserShips(targetUid, shipChanges);
            }
        }
        
        // Clear resources and ships so nothing returns
        fleet.resources = {};
        fleet.ships = {};
        
        UI.showNotification("Donation delivered successfully!");
    },
    
    async handleSpyMission(fleet) {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        try {
            console.log(`[SpyMission] Starting spy mission to ${fleet.target}`);
            const targetUid = await GalaxySystem.getOwnerUid(fleet.target);
            
            if (!targetUid) {
                console.warn("Target planet is empty, no spy data to gather");
                return;
            }

            const attackerTech = gameData.research.spyTech?.level || 0;
            const targetData = await SaveSystem.loadRemoteData(targetUid);
            
            // Proceed even if target data loading fails (Firebase permissions)
            // Generate report with whatever data we have access to
            if (!targetData) {
                console.warn("Could not load target data due to permissions, generating report with limited info");
            }
            
            const defenderTech = targetData?.research?.spyTech?.level || 0;

            // --- 1. DETECTION MATH (OGame Style) ---
            const defenderShipCount = targetData ? Object.values(targetData.fleet || {}).reduce((a, b) => a + (b.available || 0), 0) : 0;
            const techDiff = defenderTech - attackerTech;
            const probeCount = fleet.ships.spycraft || 0;
            
            let detectionChance = 0;
            if (probeCount > 0) {
                detectionChance = (defenderShipCount / 4) * Math.pow(2, techDiff) * Math.sqrt(probeCount);
            }
            detectionChance = Math.min(100, Math.max(0, detectionChance));
            
            const isDetected = (Math.random() * 100) < detectionChance;

            // --- 2. REPORT GENERATION (Tiered) ---
            // Ensure resources are always valid numbers
            const reportResources = targetData?.resources || this.simulateBotResources(targetUid);
            
            // Validate and ensure resources are numbers
            const validatedResources = {
                metal: typeof reportResources.metal === 'number' ? reportResources.metal : parseInt(reportResources.metal) || 0,
                crystal: typeof reportResources.crystal === 'number' ? reportResources.crystal : parseInt(reportResources.crystal) || 0,
                deuterium: typeof reportResources.deuterium === 'number' ? reportResources.deuterium : parseInt(reportResources.deuterium) || 0
            };
            
            let reportData = {
                type: 'spy',
                target: fleet.target,
                attackerName: gameData.playerName || 'Unknown Player',
                time: Date.now(),
                resources: validatedResources,
                detectionChance: Math.floor(detectionChance),
                wasDetected: isDetected && defenderShipCount > 0,
                isRead: false  // Track unread reports
            };

            if (targetData) {
                if (attackerTech >= 3) reportData.buildings = targetData.buildings;
                if (attackerTech >= 6) reportData.ships = targetData.fleet;
                if (attackerTech >= 8) reportData.research = targetData.research;
            } else {
                reportData.message = "[Limited data due to security restrictions - upgrade Spy Technology to gather more intel]";
            }

            // --- 3. HANDLE DESTRUCTION ---
            if (isDetected && defenderShipCount > 0) {
                fleet.ships = {}; 
                reportData.message = "Your probes were detected and destroyed by the defender's fleet!";
            }

            // --- 4. CROSS-PLAYER NOTIFICATION ---
            try {
                await this.createMissionReport(uid, reportData);
                
                if (isDetected && defenderShipCount > 0) {
                    UI.showNotification(`Spy mission to ${fleet.target} failed! Probes were destroyed.`, "error");
                } else {
                    UI.showNotification(`Spy mission to ${fleet.target} successful! Check your reports.`);
                }
            } catch (err) {
                console.error("Failed to save spy report:", err);
            }
            
            // Only notify real players, not bots
            const isBotTarget = targetUid?.startsWith('bot_');
            if (!isBotTarget) {
                try {
                    const alert = {
                        time: Date.now(),
                        type: 'alert',
                        message: `Counter-intelligence alert: A fleet from ${fleet.origin} was spotted at ${fleet.target}!`,
                        isRead: false
                    };
                    await saveMissionReport(targetUid, alert);
                } catch (err) {
                    console.error("Failed to save defender alert:", err);
                }
            }
        } catch (err) {
            console.error("Spy mission processing error:", err);
            UI.showNotification(`Spy mission error: ${err.message}`, "error");
        }
    },
};
