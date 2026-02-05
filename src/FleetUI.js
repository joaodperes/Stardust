import { gameData } from './gameData'; 

export const FleetUI = {
    updateMissionUI() {
        const listEl = document.getElementById('active-missions-list');
        if (!listEl) return;

        // Convert Firebase Object to Array
        const missionsObj = gameData.activeMissions || {};
        const missions = Object.values(missionsObj); 
        
        const missionInfoEl = document.getElementById('mission-slots-info');
        if (missionInfoEl) {
            const max = 1 + (gameData.buildings.commandCenter?.level || 0);
            missionInfoEl.innerText = `Missions: ${missions.length} / ${max}`;
        }

        if (missions.length === 0) {
            listEl.innerHTML = '<p class="empty-msg">No active fleet movements.</p>';
            return;
        }

        listEl.innerHTML = missions.map(m => {
            const now = Date.now();
            const totalTime = m.arrivalTime - m.startTime;
            const remaining = Math.max(0, m.arrivalTime - now);
            
            // Calculate progress 0-100%
            const progress = totalTime > 0 
                ? Math.min(100, ((totalTime - remaining) / totalTime) * 100) 
                : 100;

            return `
                <div class="mission-card ${m.status}">
                    <div class="mission-header">
                        <span><strong>${m.type}</strong> to ${m.target}</span>
                        <span>${remaining > 0 ? Math.ceil(remaining / 1000) + 's' : 'Arrived'}</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }
};