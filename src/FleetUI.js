import { gameData } from './gameData.js';
import { Fleet } from './fleet.js';
import { Economy } from './economy.js';
import { auth, database, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, update, ref, set, get, child } from './firebase.js';
import { UI } from './UI.js';

export const FleetUI = {
    currentTarget: null,
    selectedShips: {},
    reportPage: 0,
    REPORTS_PER_PAGE: 10,

    // Called when clicking a planet in Galaxy View
    openDispatch(targetCoords) {
        this.currentTarget = targetCoords;
        this.selectedShips = {};
        
        document.getElementById('dispatch-target-coords').innerText = targetCoords;
        document.getElementById('dispatch-overlay').style.display = 'flex';
        
        this.renderShipList();
        this.updateFlightStats();
    },

    closeDispatch() {
        document.getElementById('dispatch-overlay').style.display = 'none';
    },

    renderShipList() {
        const container = document.getElementById('dispatch-ship-list');
        container.innerHTML = '';

        //console.log(gameData.ships)
        Object.entries(gameData.ships).forEach(([key, ship]) => {
            if (ship.count > 0) {
                const div = document.createElement('div');
                div.className = 'ship-selector-row';
                div.innerHTML = `
                    <span>${ship.name} (${ship.available || 0})</span>
                    <input type="number" min="0" max="${ship.available || 0}" 
                           data-key="${key}" class="ship-input" value="0" 
                           onchange="FleetUI.handleShipChange('${key}', this.value)">
                `;
                container.appendChild(div);
            }
        });
        if (container.innerHTML === '') {
            container.innerHTML = '<p style="color: #888; font-size: 0.9em;">No ships available for transport.</p>';
        }
    },

    handleShipChange(key, value) {
        const count = parseInt(value) || 0;
        const available = gameData.ships[key].available || 0;
        
        // Validation Limit
        if (count > available) {
            this.selectedShips[key] = available;
            // Update input visually if needed
        } else {
            this.selectedShips[key] = count;
        }
        
        this.updateFlightStats();
    },

    updateFlightStats() {
        const distEl = document.getElementById('dispatch-dist');
        const timeEl = document.getElementById('dispatch-time');
        const fuelEl = document.getElementById('dispatch-fuel');
        const cargoEl = document.getElementById('dispatch-cargo');

        const distance = Fleet.calculateDistance(gameData.coordinates, this.currentTarget);
        const speed = Fleet.calculateFleetSpeed(this.selectedShips);
        const time = Fleet.calculateFlightTime(distance, speed);
        const fuel = Fleet.calculateFuelConsumption(distance, this.selectedShips);
        
        // Calculate Cargo
        let capacity = 0;
        for (const [key, count] of Object.entries(this.selectedShips)) {
            if (count > 0) capacity += (gameData.ships[key].stats.capacity || 0) * count;
        }

        distEl.innerText = distance.toLocaleString();
        timeEl.innerText = speed === Infinity ? "-" : Math.ceil(time) + "s";
        fuelEl.innerText = fuel.toLocaleString();
        cargoEl.innerText = capacity.toLocaleString();

        // Visual Validation for Fuel
        fuelEl.style.color = gameData.resources.deuterium < fuel ? '#e74c3c' : '#f1c40f';
        
        // Update resource transport max values
        document.getElementById('max-metal-transport').innerText = gameData.resources.metal.toFixed(0);
        document.getElementById('max-crystal-transport').innerText = gameData.resources.crystal.toFixed(0);
        document.getElementById('max-deut-transport').innerText = gameData.resources.deuterium.toFixed(0);
        document.getElementById('cargo-total').innerText = capacity.toLocaleString();
    },
    
    onMissionTypeChange() {
        const missionType = document.getElementById('mission-type-select')?.value;
        const resourcePanel = document.getElementById('resource-selection-panel');
        
        if (missionType === 'transport' || missionType === 'donation') {
            resourcePanel.style.display = 'block';
            this.validateResourceInput();
        } else {
            resourcePanel.style.display = 'none';
        }
    },
    
    validateResourceInput() {
        const metalInput = document.getElementById('metal-transport');
        const crystalInput = document.getElementById('crystal-transport');
        const deutInput = document.getElementById('deut-transport');
        const cargoUsedEl = document.getElementById('cargo-used');
        const cargoTotalEl = document.getElementById('cargo-total');
        
        if (!metalInput || !crystalInput || !deutInput) return;
        
        const metal = parseInt(metalInput.value) || 0;
        const crystal = parseInt(crystalInput.value) || 0;
        const deut = parseInt(deutInput.value) || 0;
        
        // Cap at available resources
        if (metal > gameData.resources.metal) metalInput.value = Math.floor(gameData.resources.metal);
        if (crystal > gameData.resources.crystal) crystalInput.value = Math.floor(gameData.resources.crystal);
        if (deut > gameData.resources.deuterium) deutInput.value = Math.floor(gameData.resources.deuterium);
        
        // Calculate cargo usage
        const totalCargo = parseInt(metalInput.value || 0) + parseInt(crystalInput.value || 0) + parseInt(deutInput.value || 0);
        const maxCargo = parseInt(cargoTotalEl.innerText.replace(/,/g, '')) || 0;
        
        cargoUsedEl.innerText = totalCargo.toLocaleString();
        cargoUsedEl.style.color = totalCargo > maxCargo ? '#e74c3c' : '#00ff00';
    },

    async submitDispatch() {
        const type = document.getElementById('mission-type-select').value;
        const fuel = parseInt(document.getElementById('dispatch-fuel').innerText.replace(/,/g, ''));
        
        // 1. Validate Ship Count
        const totalShips = Object.values(this.selectedShips).reduce((a, b) => a + b, 0);
        if (totalShips === 0) {
            UI.showNotification("No ships selected!", "error");
            return;
        }

        // 2. Validate Fuel
        if (gameData.resources.deuterium < fuel) {
            UI.showNotification("Not enough Deuterium!", "error");
            return;
        }
        
        // 3. Collect resources for transport/donation missions
        let resources = {};
        if (type === 'transport' || type === 'donation') {
            const metal = parseInt(document.getElementById('metal-transport')?.value) || 0;
            const crystal = parseInt(document.getElementById('crystal-transport')?.value) || 0;
            const deut = parseInt(document.getElementById('deut-transport')?.value) || 0;
            
            const totalCargo = metal + crystal + deut;
            const maxCargo = parseInt(document.getElementById('cargo-total').innerText.replace(/,/g, '')) || 0;
            
            if (totalCargo > maxCargo) {
                UI.showNotification("Cargo exceeds ship capacity!", "error");
                return;
            }
            
            if (totalCargo > 0) {
                resources = { metal, crystal, deuterium: deut };
            }
        }

        // 4. Send to Fleet System
        const success = await Fleet.startMission(type, this.currentTarget, this.selectedShips, resources);
        
        if (success) {
            this.closeDispatch();
            UI.showNotification("Fleet dispatched successfully!", "success");
        }
    },

    renderMissionList() {
        const container = document.getElementById('active-missions-list');
        if (gameData.fleets.length === 0) {
            container.innerHTML = '<p class="empty-msg">No active fleet movements.</p>';
            return;
        }

        container.innerHTML = gameData.fleets.map(m => {
            const isReturning = m.isReturning;
            const barColor = isReturning ? "#ff9f43" : "#00d2ff";
            const destination = isReturning ? "Home" : m.target;
            const label = `${m.mission.toUpperCase()} to ${destination}`;

            // Build ship details string
            let shipDetails = '';
            for (const [shipKey, count] of Object.entries(m.ships || {})) {
                if (count > 0) {
                    const shipName = gameData.ships[shipKey]?.name || shipKey;
                    shipDetails += `${count}x ${shipName} `;
                }
            }
            shipDetails = shipDetails.trim() || 'No ships';

            // Build cargo details string
            let cargoDetails = '';
            for (const [resType, amount] of Object.entries(m.resources || {})) {
                if (amount > 0) {
                    const capitalizedType = resType.charAt(0).toUpperCase() + resType.slice(1);
                    cargoDetails += `${capitalizedType}: ${Economy.formatNum(amount)} `;
                }
            }
            cargoDetails = cargoDetails.trim() || 'No cargo';

            return `
                <div class="mission-card sci-fi-border" id="card-${m.id}">
                    <div class="mission-info">
                        <span class="mission-label">${label}</span>
                        <span class="mission-time" id="time-${m.id}">--s</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-fill" id="bar-${m.id}" style="background-color: ${barColor}"></div>
                    </div>
                    <div class="mission-details">
                        <small id="ships-${m.id}">${shipDetails}</small>
                        <small id="cargo-${m.id}">${cargoDetails}</small>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    updateMissionUI() {
        const container = document.getElementById('active-missions-list');
        const slotsInfo = document.getElementById('mission-slots-info');
        if (!container) return;

        // 1. Update Slots (Static text)
        const maxMissions = 1 + (gameData.buildings.commandCenter?.level || 0);
        if (slotsInfo) {
            slotsInfo.innerText = `Missions: ${gameData.fleets.length} / ${maxMissions}`;
        }

        // 2. Initial Render (Only if count changed or container is empty)
        // This prevents the flickering issue
        if (container.children.length !== gameData.fleets.length || container.querySelector('.empty-msg')) {
            this.renderMissionList(); // Use a separate function for the "big" HTML build
            return; 
        }

        // 3. High-Speed Update (Bars, Timers, and Labels)
        const now = Date.now();
        gameData.fleets.forEach(m => {
            const bar = document.getElementById(`bar-${m.id}`);
            const timeLabel = document.getElementById(`time-${m.id}`);
            const missionLabel = document.querySelector(`#card-${m.id} .mission-label`);
            if (!bar || !timeLabel) return;

            const total = m.arrivalTime - m.departureTime;
            const elapsed = now - m.departureTime;
            const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
            const remaining = Math.max(0, Math.ceil((m.arrivalTime - now) / 1000));

            bar.style.width = `${progress}%`;
            const formattedTime = Economy.formatTime(remaining);
            timeLabel.innerText = formattedTime;
            
            // Update mission label to show "Home" when returning
            if (missionLabel) {
                const destination = m.isReturning ? "Home" : m.target;
                missionLabel.innerText = `${m.mission.toUpperCase()} to ${destination}`;
            }
        });
    },
    renderReportInbox() {
        const container = document.getElementById('report-list');
        if (!container) return;
        
        if (!gameData.missionReports || gameData.missionReports.length === 0) {
            container.innerHTML = '<p class="empty-msg">No mission reports yet.</p>';
            return;
        }
        
        // Sort by most recent first
        const sortedReports = [...gameData.missionReports].sort((a, b) => b.time - a.time);
        
        // Pagination
        const totalPages = Math.ceil(sortedReports.length / this.REPORTS_PER_PAGE);
        const start = this.reportPage * this.REPORTS_PER_PAGE;
        const end = start + this.REPORTS_PER_PAGE;
        const pageReports = sortedReports.slice(start, end);
        
        let html = pageReports.map((report) => `
            <div class="report-card ${report.type === 'alert' ? 'alert' : ''} ${report.isRead ? 'read' : 'unread'}" onclick="FleetUI.openReport('${report.id}')">
                <div class="report-meta">
                    <strong>${report.type === 'alert' ? '⚠️ ALERT' : '🛰️ SPY REPORT'}${!report.isRead ? ' 🔴' : ''}</strong>
                    <span>${new Date(report.time).toLocaleString()}</span>
                </div>
                <div class="report-summary">Target: ${report.target} ${report.attackerName ? `(${report.attackerName})` : ''}</div>
            </div>
        `).join('');
        
        // Add pagination controls if needed
        if (totalPages > 1) {
            html += `<div class="pagination" style="text-align: center; padding: 10px; gap: 5px; display: flex; justify-content: center;">`;
            if (this.reportPage > 0) {
                html += `<button class="btn-small" onclick="FleetUI.prevReportPage()">← Previous</button>`;
            }
            html += `<span style="padding: 5px;">Page ${this.reportPage + 1} of ${totalPages}</span>`;
            if (this.reportPage < totalPages - 1) {
                html += `<button class="btn-small" onclick="FleetUI.nextReportPage()">Next →</button>`;
            }
            html += `</div>`;
        }
        
        container.innerHTML = html;
    },

    nextReportPage() {
        const sortedReports = [...gameData.missionReports].sort((a, b) => b.time - a.time);
        const totalPages = Math.ceil(sortedReports.length / this.REPORTS_PER_PAGE);
        if (this.reportPage < totalPages - 1) {
            this.reportPage++;
            this.renderReportInbox();
        }
    },

    prevReportPage() {
        if (this.reportPage > 0) {
            this.reportPage--;
            this.renderReportInbox();
        }
    },

    openReport(reportId) {
        const report = gameData.missionReports.find(r => r.id === reportId);
        if (!report) return;
        
        const content = document.getElementById('report-content');
        
        if (report.type === 'alert') {
            content.innerHTML = `
                <div class="report-detail alert-style">
                    <h3 class="text-danger">⚠️ COUNTER-INTELLIGENCE ALERT</h3>
                    <p>Hostile probes were detected over <strong>${report.target}</strong>.</p>
                    <div class="report-section">
                        <h4>Attacker Intel</h4>
                        <ul>
                            <li><strong>Identifier:</strong> ${report.attacker.name}</li>
                            <li><strong>Coordinates:</strong> ${report.attacker.coords}</li>
                            <li><strong>Rank Score:</strong> ${report.attacker.score.toLocaleString()}</li>
                        </ul>
                    </div>
                    <button class="btn-primary" onclick="FleetUI.closeReport('${reportId}')">Close</button>
                </div>
            `;
        } else {
            let html = '';
            
            if (report.attackerName) {
                html = `<h3>Spy Report from ${report.attackerName}</h3><p><strong>Target:</strong> ${report.target}</p>`;
            } else {
                html = `<h3>Spy Report: ${report.target}</h3>`;
            }
            
            if (report.wasDetected) {
                html += `<p class="detected-warning">⚠️ PROBES WERE DETECTED AND DESTROYED!</p>`;
            }

            // Tier 1: Resources
            html += `<div class="report-section">
                <h4>Resources</h4>
                <div class="grid-3">
                    <span>Metal: ${typeof report.resources.metal === 'number' ? report.resources.metal.toLocaleString() : report.resources.metal}</span>
                    <span>Crystal: ${typeof report.resources.crystal === 'number' ? report.resources.crystal.toLocaleString() : report.resources.crystal}</span>
                    <span>Deut: ${typeof report.resources.deuterium === 'number' ? report.resources.deuterium.toLocaleString() : report.resources.deuterium}</span>
                </div>
            </div>`;

            // Tier 2: Buildings
            if (report.buildings) {
                html += `<div class="report-section">
                    <h4>Infrastructure</h4>
                    <div class="grid-3">
                        ${Object.entries(report.buildings).map(([k, v]) => `<span>${k}: Lvl ${v.level}</span>`).join('')}
                    </div>
                </div>`;
            }

            // Tier 3: Fleet
            if (report.ships) {
                html += `<div class="report-section">
                    <h4>Stationed Fleet</h4>
                    <div class="grid-3">
                        ${Object.entries(report.ships).map(([k, v]) => `<span>${k}: ${v.available}</span>`).join('')}
                    </div>
                </div>`;
            }

            // Tier 4: Research
            if (report.research) {
                html += `<div class="report-section">
                    <h4>Technological Progress</h4>
                    <div class="grid-3">
                        ${Object.entries(report.research).map(([k, v]) => `<span>${k}: Lvl ${v.level}</span>`).join('')}
                    </div>
                </div>`;
            }

            if (report.message) {
                html += `<div class="report-section"><p class="flavor-text">${report.message}</p></div>`;
            }

            html += `<button class="btn-primary" onclick="FleetUI.closeReport('${reportId}')">Close</button>`;
            content.innerHTML = html;
        }
        document.getElementById('report-detail-overlay').style.display = 'flex';
    },

    closeReport(reportId) {
        // Mark report as read
        if (reportId) {
            const report = gameData.missionReports.find(r => r.id === reportId);
            if (report) {
                report.isRead = true;
            }
        }
        
        // Close overlay
        document.getElementById('report-detail-overlay').style.display = 'none';
        
        // Update the report list to remove the unread badge
        this.renderReportInbox();
        
        // Update the message badge count
        if (typeof UI !== 'undefined' && UI.updateMessageBadge) {
            UI.updateMessageBadge();
        }
    },

    async clearAllReports() {
        if (!confirm("Delete all mission reports?")) return;
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        // Clear from Firebase (assuming you have a reference to the reports node)
        const reportsRef = ref(database, `users/${uid}/reports`);
        await set(reportsRef, null);

        // Clear locally
        gameData.missionReports = [];
        this.renderReportInbox();
        UI.showNotification("All reports cleared");
    },
        
    async deleteReport(index) {
        const uid = auth.currentUser?.uid;
        const report = gameData.missionReports[index];
        await deleteReport(uid, report.id);
        gameData.missionReports.splice(index, 1);
        this.renderReportInbox();
        this.closeReport();
    }
};

// Expose to window for HTML onClick events
window.FleetUI = FleetUI;