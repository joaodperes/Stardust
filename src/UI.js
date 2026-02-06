import { gameData, icons } from './gameData.js';
import { auth, sendPasswordResetEmail } from './firebase.js';
import { Economy } from './economy.js';
import { AuthSystem, GalaxyUI } from './main.js';
import { FleetUI } from './FleetUI.js';

let uiUser = null;

export const UI = {
    updateUser(user) { uiUser = user; }, 

    init() {
        this.renderBuildings();
        this.renderResearch();
        this.renderHangar();
        this.renderTechTree();
        GalaxyUI.render();
        this.update(); 
        this.showTab(gameData.currentTab || 'overview');
    },

    toggleAuthMode() {
        const form = document.getElementById('auth-form');
        const title = document.getElementById('auth-title');
        const submit = document.getElementById('auth-submit');
        const toggle = document.getElementById('auth-toggle');
        const nameField = document.getElementById('auth-name'); // Added this
        const forgotBtn = document.getElementById("forgotPasswordBtn"); 
        
        if (title.innerText === 'Login') {
            title.innerText = 'Create Account';
            submit.innerText = 'Sign Up';
            toggle.innerText = 'Back to Login';
            nameField.style.display = 'block'; // Show name on signup
            forgotBtn.style.display = 'none';
        } else {
            title.innerText = 'Login';
            submit.innerText = 'Login';
            toggle.innerText = 'Create Account';
            nameField.style.display = 'none'; // Hide name on login
            forgotBtn.style.display = 'block';
        }
    },
    handleAuthSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name').value; // Get name
        
        // Check if we are in "Signup" mode 
        const isSignup = document.getElementById('auth-submit').innerText === "Create Account";

        if (isSignup) {
            if(!name) return alert("Please enter a Commander Name");
            AuthSystem.signup(email, password, name).then(() => {
                // Success logic
            }).catch(err => alert(err.message));
        } else {
            AuthSystem.login(email, password).catch(err => alert(err.message));
        }
    },

    playAsGuest() {
        resetGameData();
        localStorage.removeItem("spaceColonySave");
        document.getElementById('auth-modal').style.display = 'none';
        this.init();
    },

    renderOverview() {
        // 1. Identify User & Planet - optional chaining (?.) and Nullish coalescing (??) to prevent crashes
        const name = uiUser?.displayName ?? "Commander";
        const pName = gameData.planetName ?? "Unknown Sector";
        const coords = gameData.coordinates ?? "[0:0]";

        // 2. Update Welcome Header
        const welcomeEl = document.getElementById('overview-welcome');
        if (welcomeEl) {
            welcomeEl.innerHTML = `
                Welcome, ${name}<br>
                <small style="color: #888; font-size: 0.5em;">Planet ${pName} ${coords}</small>
            `;
        }

        // 3. Infrastructure & Fleet Calculations
        let infraLevels = 0;
        for (const key in gameData.buildings) {
            infraLevels += (gameData.buildings[key].level || 0);
        }

        let fleetCount = 0;
        for (const key in gameData.ships) {
            fleetCount += (gameData.ships[key].count || 0);
        }

        // 4. Score & Rank
        const score = gameData.score || 0;
        let title = "Space Trainee";
        if (score > 10) title = "Space Cadet";
        if (score > 100) title = "System Explorer";
        if (score > 300) title = "Sector Specialist";
        if (score > 600) title = "Interstellar Architect";
        if (score > 900) title = "Cosmic Overlord";
        if (score > 1000) title = "Galactic Hegemon";
        if (score > 1500) title = "Universal Sovereign";

        // 5. DOM Updates with Error Checking
        const safeSet = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        safeSet('overview-rank', title);
        safeSet('overview-score', Math.floor(score));
        safeSet('overview-fleet', fleetCount);
        safeSet('overview-buildings', infraLevels);
    },

    renderBuildings() {
        const container = document.getElementById("buildings-list");
        if (!container) return;

        let listHtml = "";
        for (let key of Object.keys(gameData.buildings)) {
            const b = gameData.buildings[key];
            const reqStatus = Economy.checkRequirements(key);
            const cost = Economy.getCost(key);
            const canAffordMetal = gameData.resources.metal >= (cost.metal || 0);
            const canAffordCrystal = gameData.resources.crystal >= (cost.crystal || 0);
            const canAffordDeut = gameData.resources.deuterium >= (cost.deuterium || 0);
            
            // Calculate Time and Energy
            const time = Economy.getBuildTime(key, 'building');
            const energyUsage = Math.abs(b.energyWeight || 0) * (b.level + 1); // Estimated next level usage

            let reqHtml = "";
            if (!reqStatus.met) {
                reqHtml = reqStatus.missing.map(msg => 
                    `<div class="node-reqs">Requires ${msg}</div>`
                ).join("");
            }

            listHtml += `
                <div class="card ${!reqStatus.met ? 'locked' : ''}">
                    <div class="card-header">
                        <h3 onclick="UI.showDetails('${key}')" style="cursor:pointer; text-decoration:underline;">${b.name}</h3>
                        <span class="lvl-badge">Lvl ${b.level}</span>
                    </div>
                    
                    <div class="card-body">
                        <p class="building-desc">${b.desc}</p>
                        ${!reqStatus.met ? reqHtml : `
                            <div class="building-footer">
                                <div id="cost-${key}" class="cost-grid">
                                    ${cost.metal > 0 ? `
                                        <span style="color: ${canAffordMetal ? '#aaa' : '#ff4d4d'}">
                                            ${icons.metal} ${Economy.formatNum(cost.metal)}
                                        </span>` : ''}
                                    ${cost.crystal > 0 ? `
                                        <span style="color: ${canAffordCrystal ? '#aaa' : '#ff4d4d'}">
                                            ${icons.crystal} ${Economy.formatNum(cost.crystal)}
                                        </span>` : ''}
                                    ${cost.deuterium > 0 ? `
                                        <span style="color: ${canAffordDeut ? '#aaa' : '#ff4d4d'}">
                                            ${icons.deuterium} ${Economy.formatNum(cost.deuterium)}
                                        </span>` : ''}
                                </div>
                                <div class="action-row">
                                    <span id="time-${key}" class="build-time">
                                        ⏳ ${Economy.formatTime(time)} 
                                        ${b.energyWeight > 0 ? ` | ${icons.energy} +${Math.floor(energyUsage)}` : ''}
                                    </span>
                                    <button id="btn-${key}" class="btn-build" onclick="Game.build('${key}')">Upgrade</button>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }
        container.innerHTML = listHtml;
    },

    renderResearch() {
        const container = document.getElementById("research-list");
        if (!container) return;

        let html = "";
        for (let key of Object.keys(gameData.research)) {
            let r = gameData.research[key];
            
            const reqStatus = Economy.checkRequirements(key);
            
            // 1. Get Cost & Time
            const cost = Economy.getCost(key, 'research');
            const time = Economy.getBuildTime(key, 'research');

            // 2. Check Affordability (for coloring)
            const canAffordMetal = gameData.resources.metal >= (cost.metal || 0);
            const canAffordCrystal = gameData.resources.crystal >= (cost.crystal || 0);
            const canAffordDeut = gameData.resources.deuterium >= (cost.deuterium || 0);

            let reqHtml = "";
            if (!reqStatus.met) {
                    reqHtml = reqStatus.missing.map(msg => 
                    `<div class="req-tag" style="font-size:0.8em; color:#ff6666;">Requires ${msg}</div>`
                ).join("");
            }

            html += `
                <div class="card ${!reqStatus.met ? 'locked' : ''}" style="border-left: 3px solid #9900ff;">
                    <div class="card-header">
                        <h3>${r.name}</h3>
                        <span class="lvl-badge">Lvl <span id="res-lvl-${key}">${r.level}</span></span>
                    </div>
                    <p class="desc">${r.desc}</p>
                    ${!reqStatus.met ? reqHtml : `
                        <div class="building-footer">
                            
                            <div id="res-cost-${key}" class="cost-grid">
                                ${cost.metal > 0 ? `
                                    <span style="color: ${canAffordMetal ? '#aaa' : '#ff4d4d'}">
                                        ${icons.metal} ${Economy.formatNum(cost.metal)}
                                    </span>` : ''}
                                ${cost.crystal > 0 ? `
                                    <span style="color: ${canAffordCrystal ? '#aaa' : '#ff4d4d'}">
                                        ${icons.crystal} ${Economy.formatNum(cost.crystal)}
                                    </span>` : ''}
                                ${cost.deuterium > 0 ? `
                                    <span style="color: ${canAffordDeut ? '#aaa' : '#ff4d4d'}">
                                        ${icons.deuterium} ${Economy.formatNum(cost.deuterium)}
                                    </span>` : ''}
                            </div>

                            <div class="action-row">
                                <span id="res-time-${key}" class="build-time">
                                    ⏳ ${Economy.formatTime(time)}
                                </span>
                                <button id="btn-res-${key}" class="btn-build" onclick="Game.startResearch('${key}')">Research</button>
                            </div>
                        </div>
                    `}
                </div>
            `;
        }
        container.innerHTML = html;
    },

    renderHangar() {
        const container = document.getElementById("hangar-list");
        if (!container) return;

        let html = "";
        for (let key of Object.keys(gameData.ships)) {
            const s = gameData.ships[key];
            const reqStatus = Economy.checkRequirements(key);
            
            // 1. Get Stats, Cost (Unit), & Time (Unit)
            const stats = Economy.getShipStats(key);
            const cost = Economy.getCost(key, 'ship');
            const time = Economy.getBuildTime(key, 'ship');

            // 2. Check Affordability for 1 Unit (for initial display coloring)
            const canAffordMetal = gameData.resources.metal >= (cost.metal || 0);
            const canAffordCrystal = gameData.resources.crystal >= (cost.crystal || 0);
            const canAffordDeut = gameData.resources.deuterium >= (cost.deuterium || 0);

            let reqHtml = "";
            if (!reqStatus.met) {
                for (const req of reqStatus.missing) {
                    reqHtml += `<div class="req-tag" style="font-size:0.8em; color:#ff6666;">${req}</div>`;
                }
            }
            
            html += `
                <div class="card ${!reqStatus.met ? 'locked' : ''}" style="border-left: 3px solid #ff8800;">
                    <div class="card-header">
                        <h3>${s.name}</h3>
                        <span class="lvl-badge">Owned: <span id="ship-count-${key}">${s.count}</span></span>
                    </div>
                    <p class="desc">${s.desc}</p>
                    <div class="desc" style="font-size:0.8em; color:#888;">
                        ⚔️ ${stats.attack} | 🛡️ ${stats.shield} | 🧱 ${stats.armor} | 📦 ${Economy.formatNum(stats.capacity)} | 🚀 ${Economy.formatNum(stats.speed)}
                        ${stats.energyProd ? ` | ⚡ ${stats.energyProd}` : ''}
                    </div>
                    ${!reqStatus.met ? `<div style="margin-top:10px;">${reqHtml}</div>` : `
                        <div class="building-footer">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                                
                                <div id="ship-cost-${key}" class="cost-grid" style="flex: 1;">
                                    ${cost.metal > 0 ? `
                                        <span style="color: ${canAffordMetal ? '#aaa' : '#ff4d4d'}">
                                            ${icons.metal} ${Economy.formatNum(cost.metal)}
                                        </span>` : ''}
                                    ${cost.crystal > 0 ? `
                                        <span style="color: ${canAffordCrystal ? '#aaa' : '#ff4d4d'}">
                                            ${icons.crystal} ${Economy.formatNum(cost.crystal)}
                                        </span>` : ''}
                                    ${cost.deuterium > 0 ? `
                                        <span style="color: ${canAffordDeut ? '#aaa' : '#ff4d4d'}">
                                            ${icons.deuterium} ${Economy.formatNum(cost.deuterium)}
                                        </span>` : ''}
                                    <span style="font-size:0.85em; color:#888;"> (per unit)</span>
                                </div>

                                <div id="ship-total-${key}" style="text-align: right; white-space: nowrap; font-size: 0.9em; opacity: 0.8;">Total: -</div>
                            </div>

                            <div id="ship-time-${key}" class="build-time" style="text-align: left; margin-top: 5px; margin-bottom: 10px;">
                                ⏳ ${Economy.formatTime(time)} <span style="font-size:0.8em">(per unit)</span>
                            </div>

                            <div class="ship-controls" style="display: flex; gap: 10px; align-items: center;">
                                <input type="number" id="amt-${key}" value="1" min="1" class="ship-input" 
                                    style="flex: 1; padding: 8px; font-size: 1em;" 
                                    oninput="UI.updateShipTotal('${key}')">
                                <button id="btn-ship-${key}" class="btn-build" onclick="Game.buildShip('${key}')">Build</button>
                            </div>
                        </div>
                    `}
                </div>
            `;
        }
        container.innerHTML = html;
        Object.keys(gameData.ships).forEach(key => {
            if (document.getElementById(`amt-${key}`)) {
                this.updateShipTotal(key);
            }
        });
    },

    renderTechTree() {
        const container = document.getElementById("tech-tree-list");
        if (!container) return;

        const categories = {
            buildings: Object.entries(gameData.buildings),
            research: Object.entries(gameData.research),
            ships: Object.entries(gameData.ships)
        };

        const createNode = (name, type, key, item) => {
            let statusClass = "status-locked";
            let reqHtml = "";
            let level = item.level || item.count || 0;
            let reqStatus = Economy.checkRequirements(key);

            if (level > 0) statusClass = "status-owned";
            else if (reqStatus.met) statusClass = "status-available";

            if (!reqStatus.met) reqHtml = `<div class="node-reqs">Need: ${reqStatus.missing.join(", ")}</div>`;

            return `<div class="tech-node ${statusClass}" onclick="UI.showDetails('${key}')">
                <strong>${name}</strong>
                <div style="font-size:0.8em">${level > 0 ? 'Lvl ' + level : ''}</div>
                ${reqHtml}
            </div>`;
        };

        let html = `
            <div class="tree-col"><h3>Resources</h3>${categories.buildings.filter(([k,v]) => v.baseProd > 0 || v.energyWeight < 0).map(([k,v]) => createNode(v.name, 'building', k, v)).join('')}</div>
            <div class="tree-col"><h3>Facilities</h3>${categories.buildings.filter(([k,v]) => v.baseProd === 0 && v.energyWeight >= 0).map(([k,v]) => createNode(v.name, 'building', k, v)).join('')}</div>
            <div class="tree-col"><h3>Research</h3>${categories.research.map(([k,v]) => createNode(v.name, 'research', k, v)).join('')}</div>
            <div class="tree-col"><h3>Ships</h3>${categories.ships.map(([k,v]) => createNode(v.name, 'ship', k, v)).join('')}</div>
        `;
        container.innerHTML = html;
    },

     update() {
        const prod = Economy.getProduction(); // This returns metalHourly, etc.

        const setResource = (resKey, displayId, maxId, hoverId) => {
            const displayEl = document.getElementById(displayId);
            const maxEl = document.getElementById(maxId);
            const hoverEl = document.getElementById(hoverId);
            
            const current = gameData.resources[resKey];
            const cap = Economy.getStorageCapacity(resKey);
            // Use the key from getProduction (e.g., 'metal' becomes 'metalHourly')
            const hourlyRate = prod[`${resKey}Hourly` || resKey]; 

            if (displayEl) {
                // a) No decimal points: Use Math.floor
                displayEl.innerText = Economy.formatNum(Math.floor(current));
                displayEl.style.color = current >= cap ? "#ff4d4d" : (current >= cap * 0.9 ? "#ffa500" : "#ffffff");
            }

            if (maxEl) {
                // b) Showing storage cap directly in the bar
                maxEl.innerText = Economy.formatNum(cap);
            }

            if (hoverEl) {
                // d) Production per hour shown ONLY on mouse over
                hoverEl.title = `Production: +${Economy.formatNum(Math.floor(hourlyRate))}/h`;
            }
        };

        setResource('metal', 'metal-display', 'metal-max', 'metal-hover');
        setResource('crystal', 'crystal-display', 'crystal-max', 'crystal-hover');
        setResource('deuterium', 'deuterium-display', 'deuterium-max', 'deuterium-hover');

        // 2. Fix Energy (Splitting between energy-display and max-energy-display)
        const energyEl = document.getElementById('energy-display');
        const maxEnergyEl = document.getElementById('max-energy-display');
        if (energyEl && maxEnergyEl) {
            energyEl.innerText = Math.floor(gameData.resources.energy);
            maxEnergyEl.innerText = gameData.resources.maxEnergy;
            energyEl.style.color = gameData.resources.energy < 0 ? "#ff4d4d" : "#00ff00";
        }

        // 3. Status Panels
        this.renderQueueList("construction-status", (gameData.construction && gameData.construction.buildingKey) ? [gameData.construction] : [], "Construction");
        this.renderQueueList("research-status", gameData.researchQueue || [], "Research");
        this.renderQueueList("ship-production-status", gameData.shipQueue || [], "Hangar");
    },

    renderQueueList(containerId, queue, label) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (queue.length === 0) {
            container.style.display = "none";
            return;
        }

        container.style.display = "block";
        const item = queue[0];
        const progress = ((item.totalTime - item.timeLeft) / item.totalTime) * 100;

        // 1. Update Labels and Icons based on the container type
        if (containerId === "construction-status") {
            const b = gameData.buildings[item.buildingKey];
            document.getElementById("build-name").innerText = b ? b.name : "Unknown";
            document.getElementById("build-name").style.color = "#ffffff"; // White text
            document.getElementById("build-time").innerText = Economy.formatTime(item.timeLeft);
            document.getElementById("build-progress-bar").style.width = `${progress}%`;
        } 
        else if (containerId === "research-status") {
            const r = gameData.research[item.key];
            let displayText = r ? r.name : "Unknown";
            
            // Add info about queued research
            if (queue.length > 1) {
                const nextResearch = queue[1];
                const nextName = gameData.research[nextResearch.key]?.name || "Unknown";
                const nextTime = Economy.formatTime(nextResearch.totalTime);
                displayText += ` (${nextName} queued, ${nextTime})`;
            }
            
            document.getElementById("res-name").innerText = displayText;
            document.getElementById("res-name").style.color = "#ffffff"; // White text
            document.getElementById("res-time").innerText = Economy.formatTime(item.timeLeft);
            document.getElementById("res-progress-bar").style.width = `${progress}%`;
        } 
        else if (containerId === "ship-production-status") {
            const shipData = gameData.ships[item.key];
            const shipName = shipData ? shipData.name : "Ship";
            
            // Build display for current ship and queued ships
            let displayText = `${shipName} (${item.amount} units left`;
            
            // Add info about queued ship types
            if (queue.length > 1) {
                const queuedShips = queue.slice(1).map(batch => {
                    const name = gameData.ships[batch.key]?.name || "Ship";
                    return `${name} (${batch.amount})`;
                }).join(", ");
                displayText += `, ${queuedShips} queued`;
            }
            displayText += ")";
            
            const countEl = document.getElementById("ship-queue-count");
            countEl.innerText = displayText;
            countEl.style.color = "#ffffff"; 

            document.getElementById("ship-queue-time").innerText = Economy.formatTime(item.timeLeft);
            document.getElementById("ship-progress-bar").style.width = `${progress}%`;
        }
    },

    updateShipTotal(key) {
        const amtInput = document.getElementById(`amt-${key}`);
        const totalDisplay = document.getElementById(`ship-total-${key}`);
        const timeDisplay = document.getElementById(`ship-time-${key}`);
        
        // Safety check: if the element doesn't exist, stop
        if (!amtInput || !totalDisplay) return;

        const qty = parseInt(amtInput.value) || 1;
        const baseCost = Economy.getCost(key, 'ship');
        const unitTime = Economy.getBuildTime(key, 'ship');

        const total = {
            m: baseCost.metal * qty,
            c: baseCost.crystal * qty,
            d: baseCost.deuterium * qty
        };

        // 1. Check Affordability for colors
        const res = gameData.resources;
        const cM = res.metal >= total.m ? '' : 'insufficient'; // Define CSS class for red text
        const cC = res.crystal >= total.c ? '' : 'insufficient';
        const cD = res.deuterium >= total.d ? '' : 'insufficient';

        // 2. Render with icons
        totalDisplay.innerHTML = `
            <span class="${cM}">${icons.metal} ${Economy.formatNum(total.m)}</span>
            <span class="${cC}">${icons.crystal} ${Economy.formatNum(total.c)}</span>
            <span class="${cD}">${icons.deuterium} ${Economy.formatNum(total.d)}</span>
        `;

        if (timeDisplay) {
            timeDisplay.innerText = `⌛ Total Time: ${Economy.formatTime(unitTime * qty)}`;
        }
    },

    showTab(tabID) {
        const target = document.getElementById(tabID);
        if (!target) return;
        
        gameData.currentTab = tabID;
        document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        
        target.style.display = 'block';
        const btn = document.getElementById(`btn-tab-${tabID}`);
        if (btn) btn.classList.add('active');

        // Tab-specific rendering
        if (tabID === 'overview') this.renderOverview();
        if (tabID === 'buildings') this.renderBuildings();
        if (tabID === 'research') this.renderResearch();
        if (tabID === 'hangar') this.renderHangar();
        if (tabID === 'fleet') {
            FleetUI.updateMissionUI();
            // Show active missions by default
            this.showFleetSubTab('active');
        }
        if (tabID === 'tech-tree') this.renderTechTree();
        if (tabID === 'galaxy') {
            GalaxyUI.resetToHome();
            GalaxyUI.render();
        }
    },
    
    showFleetSubTab(subTab) {
        // Hide all sub-tabs
        document.querySelectorAll('.fleet-subtab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.subtab-btn').forEach(btn => btn.classList.remove('active'));
        
        // Show selected sub-tab
        const content = document.getElementById(`fleet-${subTab}`);
        const btn = document.getElementById(`fleet-${subTab}-tab`);
        if (content) content.style.display = 'block';
        if (btn) btn.classList.add('active');
        
        // Render content based on sub-tab
        if (subTab === 'active') {
            FleetUI.updateMissionUI();
        } else if (subTab === 'reports') {
            FleetUI.renderReportInbox();
        }
    },

    showDetails(key) {
        let b = gameData.buildings[key] || gameData.research[key] || gameData.ships[key];
        if(!b) return;

        document.getElementById("details-name").innerText = b.name;
        document.getElementById("details-desc").innerText = b.desc;

        let projectionHtml = `
            <table class="projection-table">
                <thead>
                    <tr><th>Lvl</th><th>Costs</th><th>Energy</th><th>Benefit</th></tr>
                </thead>
                <tbody>`;

        for (let i = 1; i <= 5; i++) {
            let nextLvl = (b.level || 0) + i;
            let prevLvl = nextLvl - 1; 

            // Costs
            let m = Math.floor(b.cost.metal * Math.pow(b.growth || 1.5, nextLvl));
            let c = Math.floor(b.cost.crystal * Math.pow(b.growth || 1.5, nextLvl));
            let d = Math.floor(b.cost.deuterium * Math.pow(b.growth || 1.5, nextLvl));

            // Energy Delta
            let eWeight = b.energyWeight || 0;
            let prevUsage = prevLvl * Math.floor(Math.abs(eWeight) * prevLvl * Math.pow(1.1, prevLvl));
            let nextUsage = nextLvl * Math.floor(Math.abs(eWeight) * nextLvl * Math.pow(1.1, nextLvl));
            let delta = nextUsage - prevUsage;

            let energyFlow = "";
            if (eWeight < 0) energyFlow = `<span style="color:#00ff00">+${delta}</span>`;
            else if (eWeight > 0) energyFlow = `<span style="color:#ff6666">-${delta}</span>`;
            else energyFlow = `<span style="color:#555">-</span>`;

            // Benefit
            let benefit = "";
            const prodIcons = { metal: "🔘", crystal: "💎", deuterium: "🧪" }; 
            if (b.bonus?.type === "researchTimeReduction") {
                let reduction = ((1 - Math.pow(1 - b.bonus.value, nextLvl)) * 100).toFixed(1);
                benefit = `-${reduction}% ⏳ Research`;
            } else if (b.bonus?.type === "shipTimeReduction") {
                let reduction = ((1 - Math.pow(1 - b.bonus.value, nextLvl)) * 100).toFixed(1);
                benefit = `-${reduction}% ⏳ Ships`;
            } else if (b.unit === "% Time") {
                let reduction = ((1 - Math.pow(0.99, nextLvl)) * 100).toFixed(1);
                benefit = `-${reduction}% ⏳`;
            } else if (b.unit === "storage") {
                // 1. Get the next level's capacity from our central formula
                const nextCapacity = Economy.calculateStorageAtLevel(nextLvl);
                
                // 2. Determine which icon to use based on the key
                const icons = { metalStorage: "🔘", crystalStorage: "💎", deutStorage: "🧪" };
                const icon = icons[key] || "📦";

                // 3. Set the benefit string
                benefit = `Max ${Economy.formatNum(nextCapacity)} ${icon}`;
            } else if (b.energyWeight < 0) {
                benefit = `+${delta} ⚡`;
            } else if (b.baseProd) { 
                let resType = "";
                if(key.includes("mine")) resType = "metal";
                if(key.includes("crystal")) resType = "crystal";
                if(key.includes("deuterium")) resType = "deuterium";
                
                if (resType) {
                    let amount = b.baseProd * nextLvl;
                    benefit = `+${Economy.formatNum(amount)} ${prodIcons[resType]}`;
                }
            } else {
                benefit = "---";
            }

            projectionHtml += `
                <tr>
                    <td>${nextLvl}</td>
                    <td>🔘${Economy.formatNum(m)} 💎${Economy.formatNum(c)}🧪${Economy.formatNum(d)}</td>
                    <td>${energyFlow}</td>
                    <td style="color:#fff;">${benefit}</td>
                </tr>`;
        }
        projectionHtml += `</tbody></table>`;
        document.getElementById("details-projection").innerHTML = projectionHtml;
        this.showTab('details');
    },

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerText = message;
        
        // Basic styling
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 20px',
            backgroundColor: type === 'success' ? '#2ecc71' : '#e74c3c',
            color: 'white',
            borderRadius: '5px',
            zIndex: '1000',
            transition: 'opacity 0.5s'
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        }, 1000);
    },

    showModal(title, body) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-body').innerText = body;
        document.getElementById('game-modal').style.display = 'flex';
    },
    closeModal() {
        document.getElementById('game-modal').style.display = 'none';
    },

    async handlePasswordReset(email) {
        try { 
            await sendPasswordResetEmail(auth, email); 
            alert("Password reset email sent! Check your inbox."); 
        } catch (error) { 
            console.error("Password reset error:", error); 
            alert("Could not send reset email: " + error.message); 
        } 
    },
    updateMessageBadge() {
        const badge = document.getElementById('message-badge');
        const reportsBadge = document.getElementById('reports-badge');
        // Count only unread reports
        const unreadCount = (gameData.missionReports || []).filter(r => !r.isRead).length;
        
        // Update main Fleet button badge
        if (badge) {
            if (unreadCount > 0) {
                badge.innerText = unreadCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
        
        // Update Mission Reports sub-tab badge
        if (reportsBadge) {
            if (unreadCount > 0) {
                reportsBadge.innerText = unreadCount;
                reportsBadge.style.display = 'inline-block';
            } else {
                reportsBadge.style.display = 'none';
            }
        }
    }
};

window.UI = UI;