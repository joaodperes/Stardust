import '../style.css';
import { gameData, icons } from './gameData.js';
import { Economy } from './economy.js';

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
    },
    downloadSave() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameData));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "stardust_save.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
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

    renderBuildings() {
        const container = document.getElementById("buildings-list");
        if (!container) return;

        let listHtml = "";
        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            let isLocked = false;
            let reqHtml = "";
            
            if (b.req) {
                for (let rKey in b.req) {
                    let requiredLvl = b.req[rKey];
                    let curLvl = (gameData.buildings[rKey]?.level ?? gameData.research[rKey]?.level ?? 0);
                    if (curLvl < requiredLvl) {
                        isLocked = true;
                        let name = gameData.buildings[rKey]?.name || gameData.research[rKey]?.name || rKey;
                        reqHtml += `<div class="req-tag">Requires ${name} Lvl ${requiredLvl}</div>`;
                    }
                }
            }

            /*let prodInfo = "";
            if (b.baseProd > 0) {
                prodInfo = `<p class="prod-val">Production: +${Economy.formatNum(b.baseProd * b.level)} ${b.unit}</p>`;
            } else if (b.energyWeight < 0) {
                prodInfo = `<p class="prod-val">Energy: +${Economy.formatNum(Math.abs(b.energyWeight * b.level))}</p>`;
            }*/
            //<p class="desc">${b.desc}</p>
            // {prodInfo}

            listHtml += `
                <div class="card ${isLocked ? 'locked' : ''}">
                    <div class="card-header">
                        <h3 onclick="UI.showDetails('${key}')" style="cursor:pointer; text-decoration:underline;">${b.name}</h3>
                        <span class="lvl-badge">Lvl <span id="lvl-${key}">${b.level}</span></span>
                    </div>
                    ${isLocked ? reqHtml : `
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
        for (let key in gameData.research) {
            let r = gameData.research[key];
            let isLocked = false;
            let reqHtml = "";

            if (r.req) {
                for (let rKey in r.req) {
                    let reqLvl = r.req[rKey];
                    let curLvl = (gameData.buildings[rKey]?.level ?? gameData.research[rKey]?.level ?? 0);
                    if (curLvl < reqLvl) {
                        isLocked = true;
                        let name = gameData.buildings[rKey]?.name || gameData.research[rKey]?.name || rKey;
                        reqHtml += `<div class="req-tag">Requires ${name} Lvl ${reqLvl}</div>`;
                    }
                }
            }

            html += `
                <div class="card ${isLocked ? 'locked' : ''}" style="border-left: 3px solid #9900ff;">
                    <div class="card-header">
                        <h3>${r.name}</h3>
                        <span class="lvl-badge">Lvl <span id="res-lvl-${key}">${r.level}</span></span>
                    </div>
                    <p class="desc">${r.desc}</p>
                    ${isLocked ? reqHtml : `
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
        for (let key in gameData.ships) {
            const s = gameData.ships[key];
            const reqStatus = Economy.checkRequirements(key);
            
            // ONE CALL: Get all calculated stats for this ship
            const stats = Economy.getShipStats(key);

            html += `
                <div class="card ${!reqStatus.met ? 'locked' : ''}">
                    <div class="card-header">
                        <h3>${s.name}</h3>
                        <span class="lvl-badge">Owned: <span id="ship-count-${key}">${s.count}</span></span>
                    </div>
                    <p class="desc">${s.desc}</p>
                    <div class="desc" style="font-size:0.8em; color:#888;">
                        ⚔️ ${stats.attack} | 🛡️ ${stats.shield} | 🧱 ${stats.armor} | 📦 ${Economy.formatNum(stats.capacity)} | 🚀 ${Economy.formatNum(stats.speed)}
                        ${stats.energyProd ? ` | ⚡ ${stats.energyProd}` : ''}
                    </div>
                    ${!reqStatus.met ? `<div class="req-tag">Requires: ${reqStatus.missing.join(", ")}</div>` : `
                        <div class="building-footer">
                            <div id="ship-cost-${key}" class="cost-grid"></div>
                            <div class="total-cost-preview" id="ship-total-${key}">Total: -</div>
                            <div class="ship-controls">
                                <input type="number" id="amt-${key}" value="1" min="1" class="ship-input" oninput="UI.updateShipTotal('${key}')">
                                <button id="btn-ship-${key}" class="btn-build" onclick="Game.buildShip('${key}')">Build</button>
                            </div>
                            <div id="ship-time-${key}" class="build-time" style="text-align:right; margin-top:5px;"></div>
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
        const res = gameData.resources;
        const prod = Economy.getProduction();

        /**
         * Standardized Helper
         * id: the <span> where the resource number goes
         * containerId: the parent <div> that handles the hover tooltip
         * val: the formatted current amount
         * hourly: the calculated hourly rate (using prod.metalH etc. from Economy)
         */
        const setResource = (id, containerId, val, hourly) => {
            const el = document.getElementById(id);
            const container = document.getElementById(containerId);
            
            if (el) el.innerText = val;
            if (container) {
                container.title = `+${Economy.formatNum(hourly)}/h`;
            }
        };

        // 1. Update Resources & Hover Tooltips
        setResource("metal-display", "metal-hover", Economy.formatNum(res.metal), prod.metalH);
        setResource("crystal-display", "crystal-hover", Economy.formatNum(res.crystal), prod.crystalH);
        setResource("deuterium-display", "deuterium-hover", Economy.formatNum(res.deuterium), prod.deutH);

        // 2. Update Energy
        const maxEnergyEl = document.getElementById("max-energy-display");
        const enEl = document.getElementById("energy-display");
        
        if (maxEnergyEl) maxEnergyEl.innerText = Economy.formatNum(res.maxEnergy);
        
        if (enEl) {
            enEl.innerText = Economy.formatNum(res.energy);
            enEl.style.color = res.energy < 0 ? "#ff4444" : "#00ff00";
            
            // Energy Tooltip: Shows Production vs Consumption on hover
            const consumption = res.maxEnergy - res.energy;
            const energyContainer = enEl.closest('.res-item');
            if (energyContainer) {
                energyContainer.title = `Prod: ${Economy.formatNum(res.maxEnergy)} | Cons: ${Economy.formatNum(consumption)}`;
            }
        }

        // Helper to generate cost HTML
        const buildCostRow = (costs) => `
            <span class="${res.metal >= costs.metal ? '' : 'insufficient'}">${icons.metal} ${Economy.formatNum(costs.metal)}</span>
            <span class="${res.crystal >= costs.crystal ? '' : 'insufficient'}">${icons.crystal} ${Economy.formatNum(costs.crystal)}</span>
            <span class="${res.deuterium >= costs.deuterium ? '' : 'insufficient'}">${icons.deuterium} ${Economy.formatNum(costs.deuterium)}</span>
        `;

        // Update Buildings
        for (let k in gameData.buildings) {
            const b = gameData.buildings[k];
            const lvlEl = document.getElementById(`lvl-${k}`);
            if (lvlEl) lvlEl.innerText = b.level;
            
            const costEl = document.getElementById(`cost-${k}`);
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'building'));

            const timeEl = document.getElementById(`time-${k}`);
            if (timeEl) {
                let time = b.baseTime * Math.pow(b.timeGrowth, b.level);
                let robotLvl = gameData.buildings.robotics?.level || 0;
                time = time * Math.pow(0.99, robotLvl);
                timeEl.innerText = `⌛ ${Economy.formatTime(time)}`;
            }

            const btn = document.getElementById(`btn-${k}`);
            if (btn) {
                const costs = Economy.getCost(k, 'building');
                const reqStatus = Economy.checkRequirements(k);
                btn.disabled = gameData.construction || 
                               res.metal < costs.metal || 
                               res.crystal < costs.crystal || 
                               res.deuterium < costs.deuterium || 
                               !reqStatus.met;
            }
        }

        // Update Research (Lockout logic added)
        const isLabBusy = gameData.construction?.buildingKey === 'lab';
        for (let k in gameData.research) {
            const r = gameData.research[k];
            const lvlEl = document.getElementById(`res-lvl-${k}`);
            if (lvlEl) lvlEl.innerText = r.level;

            const costEl = document.getElementById(`res-cost-${k}`);
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'research'));

            const timeEl = document.getElementById(`res-time-${k}`);
            if (timeEl) {
                let time = r.baseTime * Math.pow(r.growth, r.level);
                let labLvl = gameData.buildings.lab?.level || 0;
                time = time / (1 + labLvl);
                timeEl.innerText = `⌛ ${Economy.formatTime(time)}`;
            }

            const btn = document.getElementById(`btn-res-${k}`);
            if (btn) {
                const costs = Economy.getCost(k, 'research');
                const reqStatus = Economy.checkRequirements(k);
                // Lock research if Lab is upgrading or Research is active
                btn.disabled = gameData.researchQueue || isLabBusy ||
                               res.metal < costs.metal || 
                               res.crystal < costs.crystal || 
                               res.deuterium < costs.deuterium || 
                               !reqStatus.met;
                if(isLabBusy) btn.title = "Lab is upgrading!";
            }
        }

        // Update Ships (Lockout logic added)
        const isHangarBusy = gameData.construction?.buildingKey === 'hangar';
        for (let k in gameData.ships) {
            const costEl = document.getElementById(`ship-cost-${k}`);
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'ship'));
            
            this.updateShipTotal(k);

            const btn = document.getElementById(`btn-ship-${k}`);
            if (btn) {
                const s = gameData.ships[k];
                const amt = parseInt(document.getElementById(`amt-${k}`)?.value || 1);
                const costs = Economy.getCost(k, 'ship');
                const total = { m: costs.metal * amt, c: costs.crystal * amt, d: costs.deuterium * amt };
                
                btn.disabled = isHangarBusy || 
                               res.metal < total.m || 
                               res.crystal < total.c || 
                               res.deuterium < total.d;
                if(isHangarBusy) btn.title = "Hangar is upgrading!";
            }
        }
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

        el.innerHTML = `Total: 
            <span class="${colorM}">${icons.metal}${Economy.formatNum(total.m)}</span> 
            <span class="${colorC}">${icons.crystal}${Economy.formatNum(total.c)}</span> 
            <span class="${colorD}">${icons.deuterium}${Economy.formatNum(total.d)}</span>`;
            
        // Update batch time
        const s = gameData.ships[key];
        const hangarLvl = gameData.buildings.hangar.level;
        const roboticsLvl = gameData.buildings.robotics?.level || 0;
        const timePerUnit = s.baseTime / (1 + hangarLvl + roboticsLvl);
        if(timeEl) timeEl.innerText = `Batch Time: ${Economy.formatTime(timePerUnit * amt)}`;
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

            if (b.unit === "% Time") {
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
        if (gameData.researchQueue) return;
        // Block research if Lab is busy
        if (gameData.construction?.buildingKey === 'lab') {
            alert("Cannot research while Lab is upgrading!");
            return;
        }

        const costs = Economy.getCost(key, 'research');
        const r = gameData.research[key];
        if (gameData.resources.metal < costs.metal || gameData.resources.crystal < costs.crystal || 
            gameData.resources.deuterium < costs.deuterium) return;

        gameData.resources.metal -= costs.metal;
        gameData.resources.crystal -= costs.crystal;
        gameData.resources.deuterium -= costs.deuterium;

        const time = r.baseTime * Math.pow(r.growth, r.level);
        gameData.researchQueue = { researchKey: key, timeLeft: time, totalTime: time };
    },

    buildShip(key) {
        // Block ships if Hangar is busy
        if (gameData.construction?.buildingKey === 'hangar') {
            alert("Cannot build ships while Hangar is upgrading!");
            return;
        }

        const amtInput = document.getElementById(`amt-${key}`);
        const amount = parseInt(amtInput?.value || 1);
        if (amount < 1) return;

        const costs = Economy.getCost(key, 'ship');
        const total = { m: costs.metal * amount, c: costs.crystal * amount, d: costs.deuterium * amount };

        if (gameData.resources.metal < total.m || gameData.resources.crystal < total.c || gameData.resources.deuterium < total.d) return;

        gameData.resources.metal -= total.m;
        gameData.resources.crystal -= total.c;
        gameData.resources.deuterium -= total.d;

        const hangarLvl = gameData.buildings.hangar.level;
        const roboticsLvl = gameData.buildings.robotics?.level || 0;
        const timePerUnit = gameData.ships[key].baseTime / (1 + hangarLvl + roboticsLvl);

        gameData.shipQueue.push({
            key: key,
            amount: amount,
            timeLeft: timePerUnit, 
            unitTime: timePerUnit
        });
        UI.renderHangar();
    },

    cancelConstruction() { gameData.construction = null; document.getElementById("construction-status").style.display = "none"; },
    cancelResearch() { gameData.researchQueue = null; document.getElementById("research-status").style.display = "none"; },
    downloadSave: SaveSystem.downloadSave,
    uploadSave: (e) => { 
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedData = JSON.parse(e.target.result);
                localStorage.setItem("spaceColonySave", JSON.stringify(loadedData));
                location.reload();
            } catch (err) { alert("Invalid save file."); }
        };
        reader.readAsText(file);
    }
};

function tick() {
    const now = Date.now();
    const dt = (now - gameData.lastTick) / 1000;
    gameData.lastTick = now;

    // Production with Bonuses
    const prod = Economy.getProduction();
    gameData.resources.metal += prod.metal * dt;
    gameData.resources.crystal += prod.crystal * dt;
    gameData.resources.deuterium += prod.deuterium * dt;
    Economy.updateEnergy();

    // 1. Buildings Construction Logic
    if (gameData.construction) {
        let c = gameData.construction;
        const b = gameData.buildings[c.buildingKey];
        
        if (!b) {
            gameData.construction = null;
        } else {
            c.timeLeft -= dt;
            
            // Standardized UI Update
            document.getElementById("construction-status").style.display = "block";
            document.getElementById("build-name").innerText = b.name;
            document.getElementById("build-time").innerText = Economy.formatTime(Math.ceil(c.timeLeft));
            document.getElementById("build-progress-bar").style.width = ((c.totalTime - c.timeLeft) / c.totalTime * 100) + "%";
            
            if (c.timeLeft <= 0) {
                b.level++;
                gameData.construction = null;
                UI.renderBuildings();
            }
        }
    } else {
        document.getElementById("construction-status").style.display = "none";
    }

    // 2. Ships Production Logic
    if (gameData.shipQueue && gameData.shipQueue.length > 0) {
        let q = gameData.shipQueue[0]; // Current ship batch
        q.timeLeft -= dt;

        // Calculate totals for the UI
        let totalShips = gameData.shipQueue.reduce((acc, item) => acc + (item.amount || item.count || 0), 0);
        // Time left for current batch + time for all subsequent batches
        let totalTimeLeft = q.timeLeft + gameData.shipQueue.slice(1).reduce((acc, item) => acc + (item.unitTime * item.amount), 0);
        
        document.getElementById("ship-production-status").style.display = "block";
        document.getElementById("ship-queue-count").innerText = totalShips;
        document.getElementById("ship-queue-time").innerText = Economy.formatTime(Math.ceil(totalTimeLeft));
        
        // Progress bar for the CURRENT ship batch
        let batchProgress = ((q.totalTime - q.timeLeft) / q.totalTime * 100);
        document.getElementById("ship-progress-bar").style.width = batchProgress + "%";

        if (q.timeLeft <= 0) {
            gameData.ships[q.key].count++;
            q.amount--;
            if (q.amount > 0) {
                q.timeLeft = q.unitTime;
                q.totalTime = q.unitTime; // Reset totalTime for the next unit in batch
            } else {
                gameData.shipQueue.shift();
            }
            UI.renderHangar();
        }
    } else {
        document.getElementById("ship-production-status").style.display = "none";
    }

    // 3. Research Logic
    if (gameData.researchQueue) {
        let rq = gameData.researchQueue;
        const r = gameData.research[rq.researchKey];
        
        if (!r) {
            gameData.researchQueue = null;
        } else {
            rq.timeLeft -= dt;
            
            document.getElementById("research-status").style.display = "block";
            document.getElementById("res-name").innerText = r.name;
            document.getElementById("res-time").innerText = Economy.formatTime(Math.ceil(rq.timeLeft));
            document.getElementById("res-progress-bar").style.width = ((rq.totalTime - rq.timeLeft) / rq.totalTime * 100) + "%";
            
            if (rq.timeLeft <= 0) {
                r.level++;
                gameData.researchQueue = null;
                UI.renderResearch();
                UI.renderBuildings();
                UI.renderTechTree();
                UI.renderHangar();
            }
        }
    } else {
        document.getElementById("research-status").style.display = "none";
    }

    UI.update();
    if (Math.random() < 0.01) SaveSystem.save(); 
}

window.onload = () => {
    SaveSystem.load();
    UI.init();
    setInterval(tick, 100);
    window.UI = UI;
};

window.UI = UI;
window.Game = Game;