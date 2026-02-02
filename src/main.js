import '../style.css';
import { gameData, icons, resetGameData } from './gameData.js';
import { Economy } from './economy.js';
import { auth, database, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, ref, set, get, child } from './firebase.js';

// --- AUTHENTICATION SYSTEM ---
let currentUser = null;
let isCloudEnabled = false;

const AuthSystem = {
    init() {
        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            if (user) {
                isCloudEnabled = true;
                document.getElementById('logout-btn').style.display = 'inline-block';
                document.getElementById('cloud-sync-btn').style.display = 'inline-block';
                document.getElementById('auth-modal').style.display = 'none';
                this.loadFromCloud();
            } else {
                isCloudEnabled = false;
                document.getElementById('logout-btn').style.display = 'none';
                document.getElementById('cloud-sync-btn').style.display = 'none';
                document.getElementById('auth-modal').style.display = 'flex';
            }
        });
    },
    
    login(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    },
    
    signup(email, password) {
        return createUserWithEmailAndPassword(auth, email, password);
    },
    
    logout() {
        resetGameData();
        localStorage.removeItem("spaceColonySave");
        return signOut(auth);
    },
    
    async saveToCloud() {
        if (!currentUser) return false;
        try {
            await set(ref(database, `users/${currentUser.uid}/save`), gameData);
            console.log('Game saved to cloud');
            return true;
        } catch (err) {
            console.error('Cloud save failed:', err);
            return false;
        }
    },
    
    async loadFromCloud() {
        if (!currentUser) return false;
        try {
            const snapshot = await get(child(ref(database), `users/${currentUser.uid}/save`));
            if (snapshot.exists()) {
                Object.assign(gameData, snapshot.val());
                Economy.updateEnergy();
                UI.renderBuildings();
                UI.renderResearch();
                UI.renderHangar();
                UI.renderTechTree();
                UI.update();
                console.log('Game loaded from cloud');
                return true;
            }
        } catch (err) {
            console.error('Cloud load failed:', err);
        }
        return false;
    }
};

// --- SAVE/LOAD SYSTEM ---
const SaveSystem = {
    save() { localStorage.setItem("spaceColonySave", JSON.stringify(gameData)); },
    load() {
        let saved = JSON.parse(localStorage.getItem("spaceColonySave"));
        if (!saved) return;
        Object.assign(gameData.resources, saved.resources);
        
        const syncLevels = (target, source) => {
            if (!source) return;
            for (let k in source) {
                if (target[k]) target[k].level = source[k].level || 0;
            }
        };
        syncLevels(gameData.buildings, saved.buildings);
        syncLevels(gameData.research, saved.research);
        
        if(saved.ships) {
            for(let k in saved.ships) if(gameData.ships[k]) gameData.ships[k].count = saved.ships[k].count || 0;
        }
        
        gameData.construction = saved.construction;
        gameData.researchQueue = saved.researchQueue;
        gameData.shipQueue = saved.shipQueue || [];
        gameData.lastTick = saved.lastTick || Date.now();
        gameData.currentTab = saved.currentTab || 'buildings';
        
        // --- IDLE PRODUCTION CATCH-UP ---
        const now = Date.now();
        const elapsedSeconds = (now - gameData.lastTick) / 1000;
        
        if (elapsedSeconds > 0) {
            // Production catch-up
            const prod = Economy.getProduction();
            gameData.resources.metal += prod.metal * elapsedSeconds;
            gameData.resources.crystal += prod.crystal * elapsedSeconds;
            gameData.resources.deuterium += prod.deuterium * elapsedSeconds;
            
            // Building construction catch-up
            if (gameData.construction) {
                gameData.construction.timeLeft -= elapsedSeconds;
                if (gameData.construction.timeLeft <= 0) {
                    const b = gameData.buildings[gameData.construction.buildingKey];
                    if (b) {
                        b.level++;
                        gameData.construction = null;
                    }
                }
            }
            
            // Research catch-up
            if (gameData.researchQueue) {
                gameData.researchQueue.timeLeft -= elapsedSeconds;
                if (gameData.researchQueue.timeLeft <= 0) {
                    const r = gameData.research[gameData.researchQueue.researchKey];
                    if (r) {
                        r.level++;
                        gameData.researchQueue = null;
                    }
                }
            }
            
            // Ship production catch-up
            if (gameData.shipQueue && gameData.shipQueue.length > 0) {
                let remainingTime = elapsedSeconds;
                while (remainingTime > 0 && gameData.shipQueue.length > 0) {
                    let q = gameData.shipQueue[0];
                    if (remainingTime >= q.timeLeft) {
                        remainingTime -= q.timeLeft;
                        gameData.ships[q.key].count++;
                        q.amount--;
                        if (q.amount > 0) {
                            q.timeLeft = q.unitTime;
                        } else {
                            gameData.shipQueue.shift();
                        }
                    } else {
                        q.timeLeft -= remainingTime;
                        remainingTime = 0;
                    }
                }
            }
            
            Economy.updateEnergy();
        }
        
        gameData.lastTick = now;
    },
    downloadSave() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameData));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "stardust_save.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },
    
    cloudSync() {
        AuthSystem.saveToCloud().then(success => {
            if (success) alert('Cloud sync successful!');
            else alert('Cloud sync failed');
        });
    }
};

// --- UI CONTROLLER ---
const UI = {
    init() {
        this.renderBuildings();
        this.renderResearch();
        this.renderHangar();
        this.renderTechTree();
        this.update(); 
        this.showTab(gameData.currentTab || 'buildings');
    },

    toggleAuthMode() {
        const form = document.getElementById('auth-form');
        const title = document.getElementById('auth-title');
        const submit = document.getElementById('auth-submit');
        const toggle = document.getElementById('auth-toggle');
        
        if (title.innerText === 'Login') {
            title.innerText = 'Create Account';
            submit.innerText = 'Sign Up';
            toggle.innerText = 'Back to Login';
        } else {
            title.innerText = 'Login';
            submit.innerText = 'Login';
            toggle.innerText = 'Create Account';
        }
    },

    playAsGuest() {
        resetGameData();
        localStorage.removeItem("spaceColonySave");
        document.getElementById('auth-modal').style.display = 'none';
        this.init();
    },

    renderBuildings() {
        const container = document.getElementById("buildings-list");
        if (!container) return;

        let listHtml = "";
        for (let key of Object.keys(gameData.buildings)) {
            let b = gameData.buildings[key];
            
            // USE CENTRALIZED CHECK
            const reqStatus = Economy.checkRequirements(key);
            let reqHtml = "";
            
            if (!reqStatus.met) {
                // Generate HTML from the missing array
                reqHtml = reqStatus.missing.map(msg => 
                    `<div class="req-tag" style="font-size:0.8em; color:#ff6666;">Requires ${msg}</div>`
                ).join("");
            }

            listHtml += `
                <div class="card ${!reqStatus.met ? 'locked' : ''}" style="border-left: 3px solid #0066ff;">
                    <div class="card-header">
                        <h3 onclick="UI.showDetails('${key}')" style="cursor:pointer; text-decoration:underline;">${b.name}</h3>
                        <span class="lvl-badge">Lvl <span id="lvl-${key}">${b.level}</span></span>
                    </div>
                    ${!reqStatus.met ? reqHtml : `
                        <div class="building-footer">
                            <div id="cost-${key}" class="cost-grid"></div>
                            <div class="action-row">
                                <span id="time-${key}" class="build-time"></span>
                                <button id="btn-${key}" class="btn-build" onclick="Game.build('${key}')">Upgrade</button>
                            </div>
                        </div>
                    `}
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
            
            // USE CENTRALIZED CHECK
            const reqStatus = Economy.checkRequirements(key);
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
                            <div id="res-cost-${key}" class="cost-grid"></div>
                            <div class="action-row">
                                <span id="res-time-${key}" class="build-time"></span>
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
            let reqHtml = "";
            
            if (!reqStatus.met) {
                for (const req of reqStatus.missing) {
                    reqHtml += `<div class="req-tag" style="font-size:0.8em; color:#ff6666;">${req}</div>`;
                }
            }
            
            // ONE CALL: Get all calculated stats for this ship
            const stats = Economy.getShipStats(key);

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
                                <div id="ship-cost-${key}" class="cost-grid" style="flex: 1;"></div>
                                <div id="ship-total-${key}" style="text-align: right; white-space: nowrap;">Total: -</div>
                            </div>
                            <div id="ship-time-${key}" class="build-time" style="text-align: left; margin-top: 5px; margin-bottom: 10px;"></div>
                            <div class="ship-controls" style="display: flex; gap: 10px; align-items: center;">
                                <input type="number" id="amt-${key}" value="1" min="1" class="ship-input" style="flex: 1; padding: 8px; font-size: 1em;" oninput="UI.updateShipTotal('${key}')">
                                <button id="btn-ship-${key}" class="btn-build" onclick="Game.buildShip('${key}')">Build</button>
                            </div>
                        </div>
                    `}
                </div>
            `;
        }
        container.innerHTML = html;
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
        // Update Resource Bar with Storage logic
        ['metal', 'crystal', 'deuterium'].forEach(res => {
            const el = document.getElementById(`res-${res}`);
            if (!el) return;

            const current = gameData.resources[res];
            const cap = Economy.getStorageCapacity(res);
            
            el.innerText = `${Economy.formatNum(current)} / ${Economy.formatNum(cap)}`;

            // Visual feedback for storage limits
            if (current >= cap) {
                el.style.color = "#ff4d4d"; // Red: Full
            } else if (current >= cap * 0.9) {
                el.style.color = "#ffa500"; // Orange: Near capacity
            } else {
                el.style.color = "#ffffff"; // White: Normal
            }
        });

        // Update Energy
        const energyEl = document.getElementById('res-energy');
        if (energyEl) {
            energyEl.innerText = `${Math.floor(gameData.resources.energy)} / ${gameData.resources.maxEnergy}`;
            energyEl.style.color = gameData.resources.energy < 0 ? "#ff4d4d" : "#00ff00";
        }

        // Update Progress Bars / Status Text
        this.renderQueueList("building-status", gameData.construction?.buildingKey ? [gameData.construction] : [], "Construction");
        this.renderQueueList("research-status", gameData.researchQueue, "Research");
        this.renderQueueList("ship-status", gameData.shipQueue, "Hangar");
    },

    renderQueueList(containerId, queue, label) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (queue.length === 0) {
            container.style.display = "none";
            return;
        }

        // Determine type for the limit check
        const type = label.toLowerCase().includes("research") ? 'research' : 'ship';
        const limit = Economy.getQueueLimit(type);
        
        container.style.display = "block";
        
        // 1. Header with [x/y] indicator
        let html = `
            <div class="queue-header">
                <h3>${label}</h3>
                <span class="slot-indicator">Slots: ${queue.length}/${limit}</span>
            </div>
        `;

        // 2. Active Item
        const active = queue[0];
        const activeName = gameData.research[active.key]?.name || gameData.ships[active.key]?.name || "Unit";

        // Calculate the percentage: (Elapsed Time / Total Time) * 100
        // We use Math.max/Math.min to ensure the bar never goes outside 0-100%
        const progressPercent = Math.min(100, Math.max(0, ((active.totalTime - active.timeLeft) / active.totalTime) * 100));

        html += `
            <div class="active-task">
                <strong>Active:</strong> ${activeName} (${Economy.formatTime(active.timeLeft)})
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${progressPercent}%"></div>
            </div>
        `;

        // 3. Waiting List
        if (queue.length > 1) {
            html += `<div class="queued-items">`;
            for (let i = 1; i < queue.length; i++) {
                const item = queue[i];
                const itemName = gameData.research[item.key]?.name || gameData.ships[item.key]?.name || "Unit";
                const amountStr = item.amount ? `[${item.amount}] ` : "";
                html += `<div class="next-item">Next: ${amountStr}${itemName}</div>`;
            }
            html += `</div>`;
        }

        container.innerHTML = html;
    },

    updateShipTotal(key) {
        const el = document.getElementById(`ship-total-${key}`);
        const amtInput = document.getElementById(`amt-${key}`);
        const timeEl = document.getElementById(`ship-time-${key}`);
        if (!el || !amtInput) return;

        const amt = parseInt(amtInput.value || 1);
        const base = Economy.getCost(key, 'ship');
        const total = { m: base.metal * amt, c: base.crystal * amt, d: base.deuterium * amt };
        
        const res = gameData.resources;
        const colorM = res.metal >= total.m ? '' : 'insufficient';
        const colorC = res.crystal >= total.c ? '' : 'insufficient';
        const colorD = res.deuterium >= total.d ? '' : 'insufficient';

        el.innerHTML = `<span class="${colorM}">${icons.metal}${Economy.formatNum(total.m)}</span> <span class="${colorC}">${icons.crystal}${Economy.formatNum(total.c)}</span> <span class="${colorD}">${icons.deuterium}${Economy.formatNum(total.d)}</span>`;
            
        // Update total time
        const s = gameData.ships[key];
        const hangarLvl = gameData.buildings.hangar.level;
        const roboticsLvl = gameData.buildings.robotics?.level || 0;
        const timePerUnit = s.baseTime / (1 + hangarLvl + roboticsLvl);
        if(timeEl) timeEl.innerText = `⌛ Total Time: ${Economy.formatTime(timePerUnit * amt)}`;
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

        if (tabID === 'buildings') this.renderBuildings();
        if (tabID === 'research') this.renderResearch();
        if (tabID === 'hangar') this.renderHangar();
        if (tabID === 'tech-tree') this.renderTechTree();
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
                    <td>🔘${Economy.formatNum(m)} 💎${Economy.formatNum(c)}</td>
                    <td>${energyFlow}</td>
                    <td style="color:#fff;">${benefit}</td>
                </tr>`;
        }
        projectionHtml += `</tbody></table>`;
        document.getElementById("details-projection").innerHTML = projectionHtml;
        this.showTab('details');
    }
};

window.Game = {
    build(key) {
        const costs = Economy.getCost(key, 'building');
        const b = gameData.buildings[key];
        if (gameData.construction || gameData.resources.metal < costs.metal || 
            gameData.resources.crystal < costs.crystal || gameData.resources.deuterium < costs.deuterium) return;

        gameData.resources.metal -= costs.metal;
        gameData.resources.crystal -= costs.crystal;
        gameData.resources.deuterium -= costs.deuterium;

        const time = b.baseTime * Math.pow(b.timeGrowth, b.level);
        gameData.construction = { buildingKey: key, timeLeft: time, totalTime: time };
    },

    startResearch(key) {
        const status = Economy.canQueue('research');
        if (!status.can) {
            alert(status.reason);
            return;
        }

        const cost = Economy.getCost(key, 'research');
        if (Economy.hasResources(cost)) {
            Economy.deductResources(cost);
            const res = gameData.research[key];
            
            gameData.researchQueue.push({
                key: key,
                timeLeft: res.baseTime * Math.pow(res.growth, res.level),
                totalTime: res.baseTime * Math.pow(res.growth, res.level)
            });
            UI.renderResearch();
        }
    },

    buildShip(key) {
        // 1. Check Queue Availability & Hangar Upgrades
        const status = Economy.canQueue('ship');
        if (!status.can) {
            alert(status.reason);
            return;
        }

        // 2. Get and validate amount
        const amtInput = document.getElementById(`amt-${key}`);
        const amount = parseInt(amtInput?.value || 1);
        if (amount < 1) return;

        // 3. Resource Check
        const singleCost = Economy.getCost(key, 'ship');
        const totalCost = {
            metal: singleCost.metal * amount,
            crystal: singleCost.crystal * amount,
            deuterium: singleCost.deuterium * amount
        };

        if (!Economy.hasResources(totalCost)) {
            alert("Not enough resources!");
            return;
        }

        // 4. Deduct Resources
        Economy.deductResources(totalCost);

        // 5. Calculate Time (Preserving your Robotics/Hangar formula)
        const hangarLvl = gameData.buildings.hangar.level;
        const roboticsLvl = gameData.buildings.robotics?.level || 0;
        const timePerUnit = gameData.ships[key].baseTime / (1 + hangarLvl + roboticsLvl);

        // 6. Push to Queue
        const stackTotalTime = timePerUnit * amount;

        gameData.shipQueue.push({
            key: key,
            amount: amount,
            unitTime: timePerUnit, 
            timeLeft: stackTotalTime,  // The timer starts at the full duration
            totalTime: stackTotalTime  // This ensures the progress bar tracks the whole 99-ship batch
        });

        UI.renderHangar();
    },

    cancelConstruction() { gameData.construction = null; document.getElementById("construction-status").style.display = "none"; },
    cancelResearch() { gameData.researchQueue = null; document.getElementById("research-status").style.display = "none"; },
    downloadSave: SaveSystem.downloadSave,
    cloudSync() { AuthSystem.saveToCloud().then(success => alert(success ? 'Saved to cloud!' : 'Save failed')); },
    logout() { AuthSystem.logout(); },
    uploadSave: (e) => { 
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedData = JSON.parse(e.target.result);
                localStorage.setItem("spaceColonySave", JSON.stringify(loadedData));
                if (isCloudEnabled) AuthSystem.saveToCloud();
                location.reload();
            } catch (err) { alert("Invalid save file."); }
        };
        reader.readAsText(file);
    }
};

function tick() {
    const now = Date.now();
    const delta = (now - gameData.lastTick) / 1000;
    gameData.lastTick = now;

    // 1. Update Resource amounts based on production and storage caps
    Economy.updateResources(delta);

    // 2. Process Building Queue (Standard single construction)
    if (gameData.construction && gameData.construction.buildingKey) {
        gameData.construction.timeLeft -= delta;
        if (gameData.construction.timeLeft <= 0) {
            const key = gameData.construction.buildingKey;
            gameData.buildings[key].level++;
            gameData.construction = { buildingKey: null, timeLeft: 0, totalTime: 0 };
            UI.renderBuildings(); // Refresh UI to show new level/costs
        }
    }

    // 3. Process Research Queue (Multi-Queue)
    if (gameData.researchQueue.length > 0) {
        const activeRes = gameData.researchQueue[0]; // Only process the first item
        activeRes.timeLeft -= delta;
        
        if (activeRes.timeLeft <= 0) {
            gameData.research[activeRes.key].level++;
            gameData.researchQueue.shift(); // Remove finished item, starts next one next tick
            UI.renderResearch();
        }
    }

    // 4. Process Ship Queue (Sequential Batching)
    if (gameData.shipQueue.length > 0) {
        const batch = gameData.shipQueue[0];
        const previousTime = batch.timeLeft;
        batch.timeLeft -= delta;

        // Calculate how many units were completed during this specific tick
        // (Total Duration - Current Time) / Time per Unit = Units that should be finished
        const totalUnitsFinished = Math.floor((batch.totalTime - batch.timeLeft) / batch.unitTime);
        const unitsAlreadyAdded = batch.initialAmount - batch.amount; // You'll need to store 'initialAmount' in buildShip
        
        const newUnits = totalUnitsFinished - unitsAlreadyAdded;
        if (newUnits > 0) {
            gameData.ships[batch.key].count += newUnits;
            batch.amount -= newUnits;
        }

        if (batch.timeLeft <= 0) {
            gameData.shipQueue.shift(); // Move to Cargo Ships only when the full Fighter stack is done
        }
    }

    UI.update();
    if (Math.random() < 0.01) SaveSystem.save(); 
}

window.onload = () => {
    AuthSystem.init();
    SaveSystem.load();
    UI.init();
    setInterval(tick, 100);
    setInterval(() => {
        if (isCloudEnabled && Math.random() < 0.01) AuthSystem.saveToCloud();
    }, 100);
    
    // Auth form handler
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const errorEl = document.getElementById('auth-error');
            const title = document.getElementById('auth-title').innerText;
            
            try {
                if (title === 'Login') {
                    await AuthSystem.login(email, password);
                } else {
                    await AuthSystem.signup(email, password);
                }
                errorEl.style.display = 'none';
            } catch (err) {
                errorEl.innerText = err.message;
                errorEl.style.display = 'block';
            }
        });
    }
    
    window.UI = UI;
};

window.UI = UI;
window.Game = Game;
window.AuthSystem = AuthSystem;