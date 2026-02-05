// src/systems/SpySystem.js

export const SpySystem = {
    getSpyReportLevel(spyTechLevel) {
        if (spyTechLevel >= 8) return 'FULL';
        if (spyTechLevel >= 6) return 'SHIPS';
        if (spyTechLevel >= 3) return 'BUILDINGS';
        return 'RESOURCES';
    },

    // Called when the mission "arrives" at the target
    async resolveSpying(mission, targetUid) {
        // 1. Fetch Target Data
        const snapshot = await get(ref(database, `users/${targetUid}/save`));
        const targetData = JSON.parse(snapshot.val());
        
        // 2. Calculate Detection Chance
        // Example: 1 Probe = 50% death chance, 10 Probes = 5% death chance
        // Countered by enemy Espionage Tech (optional depth)
        const detectionChance = Math.max(0, 50 - (mission.fleet.probes * 5));
        const isDetected = (Math.random() * 100) < detectionChance;

        if (isDetected) {
            // Battle logic would go here (Fleet destroyed)
            return { success: false, msg: "Contact lost. Probes destroyed." };
        }

        // 3. Generate Report based on Tech
        // We assume the attacker's tech is inside the mission object or fetched locally
        const mySpyTech = gameData.research?.espionage || 0;
        const detailLevel = this.getSpyReportLevel(mySpyTech);

        const report = {
            target: mission.target,
            resources: targetData.resources
        };

        if (detailLevel === 'BUILDINGS' || detailLevel === 'SHIPS' || detailLevel === 'FULL') {
            report.buildings = targetData.buildings;
        }
        if (detailLevel === 'SHIPS' || detailLevel === 'FULL') {
            report.fleet = targetData.fleet || {};
        }
        if (detailLevel === 'FULL') {
            report.research = targetData.research || {};
        }

        return { success: true, data: report };
    }
};