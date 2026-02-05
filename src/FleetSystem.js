// src/systems/FleetSystem.js
import { database, ref, update, get, child } from '../firebase';
import { gameData } from '../gameData'; // Local state for checking resources/tech
import { SpySystem } from './SpySystem';

export const FleetSystem = {
    // 1. Calculate Distance between [1:1] and [2:5]
    // Standard formula: Distance + System Diff + Galaxy Diff
    calculateDistance(coordsA, coordsB) {
        // Parse "[1:1]" to {sys: 1, pl: 1}
        const parse = (c) => {
            const clean = c.replace(/[\[\]]/g, '').split(':');
            return { sys: parseInt(clean[0]), pl: parseInt(clean[1]) };
        };
        
        const a = parse(coordsA);
        const b = parse(coordsB);

        // Same System? Distance is small
        if (a.sys === b.sys) {
            return Math.abs(a.pl - b.pl) * 5 + 1000;
        }
        // Different System? Distance is large
        return Math.abs(a.sys - b.sys) * 2000 + 2700;
    },

    // 2. Flight Time (Seconds)
    // Speed = Base Speed * (1 + Combustion Tech * 0.1)
    calculateFlightTime(distance, shipSpeed, shipTags = []) {
        // 1. Get the dynamic multiplier for "speed"
        // This will check Research (Combustion) and any relevant Buildings
        const speedMultiplier = Economy.getBonus("speed", shipTags);
        
        // 2. Apply multiplier to base ship speed
        const actualSpeed = shipSpeed * speedMultiplier;
        
        // 3. Return time in seconds (10s minimum floor)
        return Math.floor(10 + (distance / actualSpeed) * 100); 
    },

    // 3. Fuel Cost
    calculateFuelConsumption(distance, fleet) {
        let totalFuel = 0;

        for (const [shipKey, count] of Object.entries(fleet)) {
            const shipDef = gameData.ships[shipKey];
            if (!shipDef || count <= 0) continue;

            // Higher distance and higher base consumption = more fuel
            const shipFuel = 1 + (shipDef.stats.consumption || 10) * (distance / 35000) * count;
            totalFuel += shipFuel;
        }

        return Math.ceil(totalFuel);
    },

    // 4. Start a Mission
    async startMission(type, targetCoords, fleetComposition) {
        // A. Validation
        if (!gameData.buildings.commandCenter) {
            console.error("Command Center required!");
            return false;
        }

        // B. Calculate Costs & Time
        const origin = gameData.coordinates;
        const distance = this.calculateDistance(origin, targetCoords);
        
        // Get fastest ship speed (or slowest? Usually slowest defines fleet speed)
        // For pure spies, we use Probe speed (e.g., 100000)
        const speed = 100000; 
        const combustionLvl = gameData.research?.combustion || 0;
        
        const durationSeconds = this.calculateFlightTime(distance, speed, combustionLvl);
        const arrivalTime = Date.now() + (durationSeconds * 1000);
        const returnTime = arrivalTime + (durationSeconds * 1000);

        const fuelCost = this.calculateFuelConsumption(distance, fleetComposition.probes);

        // C. Check Resources
        if (gameData.resources.deuterium < fuelCost) {
            alert(`Not enough Deuterium! Need ${fuelCost}`);
            return false;
        }

        // D. Create Mission Object
        const missionId = `mission_${Date.now()}`;
        const missionData = {
            id: missionId,
            type: type, // 'SPY'
            owner: auth.currentUser.uid,
            origin: origin,
            target: targetCoords,
            fleet: fleetComposition,
            startTime: Date.now(),
            arrivalTime: arrivalTime,
            returnTime: returnTime,
            status: 'outbound' // outbound -> processing -> return -> completed
        };

        // E. Commit to Database (Update Resources & Add Mission)
        const updates = {};
        
        // Deduct Fuel
        updates[`users/${auth.currentUser.uid}/save/resources/deuterium`] = gameData.resources.deuterium - fuelCost;
        
        // Deduct Ships (Lock them)
        updates[`users/${auth.currentUser.uid}/save/fleet/probes`] = gameData.fleet.probes - fleetComposition.probes;
        
        // Save Mission to a new "missions" node
        updates[`users/${auth.currentUser.uid}/missions/${missionId}`] = missionData;

        await update(ref(database), updates);
        return true;
    },
    
    // Cancel a Mission
    async cancelMission(missionId) {
        const updates = {};
        updates[`users/${auth.currentUser.uid}/missions/${missionId}`] = null;
        await update(ref(database), updates);
    },

    canSendMission() {
        const level = gameData.buildings.commandCenter.level || 0;
        const maxMissions = Math.min(10, level); // Each Command Center level allows 1 active mission, up to 10 max
        const currentMissions = Object.keys(gameData.activeMissions).length;
        
        return currentMissions < maxMissions;
    },

    async processActiveMissions() {
        const now = Date.now();
        const missions = gameData.activeMissions || {};

        for (const [id, m] of Object.entries(missions)) {
            // PHASE 1: Arrival at Target
            if (m.status === 'outbound' && now >= m.arrivalTime) {
                console.log(`Mission ${id} reached target ${m.target}`);
                await this.resolveMissionArrival(m);
            }
            
            // PHASE 2: Return to Home
            if (m.status === 'returning' && now >= m.returnTime) {
                console.log(`Mission ${id} returned to origin ${m.origin}`);
                await this.completeMission(m);
            }
        }
    },

    async resolveMissionArrival(mission) {
        let updates = {};
        const path = `users/${auth.currentUser.uid}/missions/${mission.id}`;

        // Mission Switch: Determine what happens based on type
        switch (mission.type) {
            case 'SPY':
                const report = await SpySystem.resolveSpying(mission);
                // We'll store reports in a separate 'messages' node later
                console.log("Spy Report Generated:", report);
                break;
            case 'ATTACK':
                // CombatSystem.resolve(mission);
                break;
        }

        // Set status to returning
        updates[`${path}/status`] = 'returning';
        await update(ref(database), updates);
    },

    async completeMission(mission) {
        const updates = {};
        const uid = auth.currentUser.uid;

        // 1. Give ships back to the player
        for (const [shipKey, count] of Object.entries(mission.fleet)) {
            updates[`users/${uid}/save/fleet/${shipKey}`] = (gameData.fleet[shipKey] || 0) + count;
        }

        // 2. Delete the mission from the active queue
        updates[`users/${uid}/missions/${mission.id}`] = null;

        await update(ref(database), updates);
        UI.showNotification(`Fleet returned from ${mission.target}`, "info");
    }
};