import '../style.css';
import { gameData, icons } from './gameData.js';
import { Economy } from './economy.js';

// --- SAVE/LOAD SYSTEM ---
const SaveSystem = {
    save() {
        localStorage.setItem("spaceColonySave", JSON.stringify(gameData));
    },
    load() {
        let saved = JSON.parse(localStorage.getItem("spaceColonySave"));
        if (!saved) return;

        Object.assign(gameData.resources, saved.resources);

        // Deep restore levels for buildings, research, and ships
        const syncLevels = (target, source) => {
            if (!source) return;
            for (let k in source) {
                if (target[k]) target[k].level = source[k].level || 0;
            }
        };

        syncLevels(gameData.buildings, saved.buildings);
        syncLevels(gameData.research, saved.research);

        if (saved.ships) {
            for (let k in saved.ships) {
                if (gameData.ships[k]) gameData.ships[k].count = saved.ships[k].count || 0;
            }
        }

        // Validate queues to prevent crashes
        if (saved.construction && gameData.buildings[saved.construction.buildingKey]) {
            gameData.construction = saved.construction;
        } else {
            gameData.construction = null;
        }

        if (saved.researchQueue && gameData.research[saved.researchQueue.researchKey]) {
            gameData.researchQueue = saved.researchQueue;
        } else {
            gameData.researchQueue = null;
        }

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
                    let reqLvl = b.req[rKey];
                    let curLvl = (gameData.buildings[rKey]?.level ?? gameData.research[rKey]?.level ?? 0);
                    if (curLvl < reqLvl) {
                        isLocked = true;
                        let name = gameData.buildings[rKey]?.name || gameData.research[rKey]?.name || rKey;
                        reqHtml += `<div class="req-tag">Requires ${name} Lvl ${reqLvl}</div>`;
                    }
                }
            }

            let prodInfo = "";
            if (b.baseProd > 0) {
                prodInfo = `<p class="prod-val" style="color:#00b300; font-size:0.9em">Production: +${Economy.formatNum(b.baseProd * b.level)} ${b.unit}</p>`;
            } else if (b.energyWeight < 0) {
                prodInfo = `<p class="prod-val" style="color:#00b300; font-size:0.9em">Energy: +${Economy.formatNum(Math.abs(b.energyWeight * b.level))}</p>`;
            }

            listHtml += `
                <div class="building-card ${isLocked ? 'locked' : ''}">
                    <div class="building-info-main">
                        <div class="info-header">
                            <strong class="details-trigger" onclick="UI.showDetails('${key}')">${b.name}</strong> 
                            <span class="lvl-tag">Lvl <span id="lvl-${key}">${b.level}</span></span>
                        </div>
                        
                        <p class="desc" style="font-size:0.9em; color:#aaa; margin:5px 0;">${b.desc}</p>
                        ${prodInfo}
                        ${isLocked ? reqHtml : `
                            <div class="building-footer">
                                <div id="cost-${key}" class="cost-row"></div>
                                <div class="action-row">
                                    <span id="time-${key}" class="build-time"></span>
                                    <button id="btn-${key}" onclick="Game.build('${key}')">Upgrade</button>
                                </div>
                            </div>
                        `}
                    </div>
                </div>`;
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
                <div class="building-card ${isLocked ? 'locked' : ''}" style="border-left: 3px solid #9900ff;">
                    <div class="building-info-main">
                        <div class="info-header">
                            <strong style="color: #d48aff">${r.name}</strong>
                            <span class="lvl-tag">Lvl <span id="res-lvl-${key}">${r.level}</span></span>
                        </div>
                        <p class="desc" style="font-size:0.9em; color:#aaa; margin:5px 0;">${r.desc}</p>
                        ${isLocked ? reqHtml : `
                            <div class="building-footer">
                                <div id="res-cost-${key}" class="cost-row"></div>
                                <div class="action-row">
                                    <span id="res-time-${key}" class="build-time"></span>
                                    <button class="btn-build" onclick="Game.startResearch('${key}')">Research</button>
                                </div>
                            </div>
                        `}
                    </div>
                </div>`;
        }
        container.innerHTML = html;
    },

    renderHangar() {
        const container = document.getElementById("hangar-list");
        if (!container) return;

        let html = "";
        for (let key in gameData.ships) {
            let s = gameData.ships[key];
            let isLocked = false;
            let reqHtml = "";

            if (s.req) {
                for (let rKey in s.req) {
                    let reqLvl = s.req[rKey];
                    let curLvl = (gameData.buildings[rKey]?.level ?? gameData.research[rKey]?.level ?? 0);
                    if (curLvl < reqLvl) {
                        isLocked = true;
                        let name = gameData.buildings[rKey]?.name || gameData.research[rKey]?.name || rKey;
                        reqHtml += `<div class="req-tag">Requires ${name} Lvl ${reqLvl}</div>`;
                    }
                }
            }

            html += `
                <div class="building-card horizontal ${isLocked ? 'locked' : ''}">
                    <div class="building-info-main">
                        <div class="info-header">
                            <div>
                                <strong>${s.name}</strong>
                                ${reqHtml}
                            </div>
                            <span class="lvl-tag">Owned: <span id="ship-count-${key}">${s.count}</span></span>
                        </div>
                        
                        <div class="ship-layout-grid">
                            <div class="ship-description">
                                <p style="font-size:0.9em; color:#aaa">${s.desc}</p>
                                <div class="ship-stats">
                                    ⚔️ ${s.stats.attack || 0} | 🛡️ ${s.stats.shield || 0} | 🧱 ${s.stats.armor || 0} | 📦 ${Economy.formatNum(s.stats.capacity || 0)}
                                </div>
                            </div>
                            
                            <div class="ship-costs-actions">
                                <div id="ship-cost-${key}" class="cost-line"></div>
                                <div id="ship-time-${key}" class="time-line"></div>
                                <div class="total-cost-preview" id="ship-total-${key}"></div>
                                <div class="ship-controls">
                                    <input type="number" id="amt-${key}" value="1" min="1" class="ship-input" oninput="UI.updateShipTotal('${key}')" ${isLocked ? 'disabled' : ''}>
                                    <button onclick="Game.buildShip('${key}')" ${isLocked ? 'disabled' : ''}>Build</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
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

        // Resources & Tooltips
        const updateDisplay = (id, val, title = "") => {
            const el = document.getElementById(id);
            if (el) {
                el.innerText = val;
                if (title) el.title = title;
            }
        };

        updateDisplay("metal-display", Economy.formatNum(res.metal), `+${Economy.formatNum(prod.metal * 3600)}/h`);
        updateDisplay("crystal-display", Economy.formatNum(res.crystal), `+${Economy.formatNum(prod.crystal * 3600)}/h`);
        updateDisplay("deuterium-display", Economy.formatNum(res.deuterium), `+${Economy.formatNum(prod.deuterium * 3600)}/h`);
        updateDisplay("max-energy-display", Economy.formatNum(res.maxEnergy));

        const energyEl = document.getElementById("energy-display");
        if (energyEl) {
            energyEl.innerText = Economy.formatNum(res.energy);
            energyEl.style.color = res.energy < 0 ? "#ff4444" : "#00ff00";
        }

        const buildCostRow = (costs) => `
            <span class="${res.metal >= costs.metal ? '' : 'insufficient'}">${icons.metal} ${Economy.formatNum(costs.metal)}</span>
            <span class="${res.crystal >= costs.crystal ? '' : 'insufficient'}">${icons.crystal} ${Economy.formatNum(costs.crystal)}</span>
            <span class="${res.deuterium >= costs.deuterium ? '' : 'insufficient'}">${icons.deuterium} ${Economy.formatNum(costs.deuterium)}</span>
        `;

        // Update Buildings
        for (let k in gameData.buildings) {
            const b = gameData.buildings[k];
            const lvlEl = document.getElementById(`lvl-${k}`);
            if (lvlEl) lvlEl.innerText = gameData.buildings[k].level;
            
            const costEl = document.getElementById(`cost-${k}`);
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'building'));

            // Time & Button
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

        // Update Research
        for (let k in gameData.research) {
            const r = gameData.research[k];
            const lvlEl = document.getElementById(`res-lvl-${k}`);
            if (lvlEl) lvlEl.innerText = gameData.research[k].level;

            const costEl = document.getElementById(`res-cost-${k}`);
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'research'));

            const timeEl = document.getElementById(`res-time-${k}`);
            if (timeEl) {
                let time = r.baseTime * Math.pow(r.growth, r.level);
                let labLvl = gameData.buildings.lab?.level || 0;
                time = time / (1 + labLvl);
                timeEl.innerText = `⌛ ${Economy.formatTime(time)}`;
            }
        }

        // Update Ships
        for (let k in gameData.ships) {
            const costEl = document.getElementById(`ship-cost-${k}`);
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'ship'));
            
            const timeEl = document.getElementById(`ship-time-${k}`);
            if(timeEl) {
                const s = gameData.ships[k];
                const hangarLvl = gameData.buildings.hangar.level;
                const roboticsLvl = gameData.buildings.robotics?.level || 0;
                const time = s.baseTime / (1 + hangarLvl + roboticsLvl);
                timeEl.innerText = `⌛ ${Economy.formatTime(time)}`;
            }
            
            this.updateShipTotal(k);
        }
    },

    updateShipTotal(key) {
        const el = document.getElementById(`ship-total-${key}`);
        const amtInput = document.getElementById(`amt-${key}`);
        if (!el || !amtInput) return;

        const amt = parseInt(amtInput.value || 1);
        const base = Economy.getCost(key, 'ship');
        const total = { m: base.metal * amt, c: base.crystal * amt, d: base.deuterium * amt };
        el.innerText = `Total: ${icons.metal}${Economy.formatNum(total.m)} ${icons.crystal}${Economy.formatNum(total.c)} ${icons.deuterium}${Economy.formatNum(total.d)}`;
        el.style.color = "#aaa";
        el.style.fontSize = "0.8em";
        el.style.marginBottom = "5px";
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
                // Determine resource type by key name simple check
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
        const amtInput = document.getElementById(`amt-${key}`);
        const amount = parseInt(amtInput?.value || 1);
        if (amount < 1) return;

        const costs = Economy.getCost(key, 'ship');
        const total = { m: costs.metal * amount, c: costs.crystal * amount, d: costs.deuterium * amount };

        if (gameData.resources.metal < total.m || gameData.resources.crystal < total.c || gameData.resources.deuterium < total.d) return;

        gameData.resources.metal -= total.m;
        gameData.resources.crystal -= total.c;
        gameData.resources.deuterium -= total.d;

        gameData.ships[key].count += amount;
        UI.renderHangar();
    },

    cancelConstruction() { gameData.construction = null; document.getElementById("construction-status").style.display = "none"; },
    cancelResearch() { gameData.researchQueue = null; document.getElementById("research-status").style.display = "none"; },
    downloadSave: SaveSystem.downloadSave,
    uploadSave: (e) => { // Fixed upload handler
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

    const prod = Economy.getProduction();
    gameData.resources.metal += prod.metal * dt;
    gameData.resources.crystal += prod.crystal * dt;
    gameData.resources.deuterium += prod.deuterium * dt;
    Economy.updateEnergy();

    // Construction Progress
    const bPanel = document.getElementById("construction-status");
    if (gameData.construction) {
        let c = gameData.construction;
        const b = gameData.buildings[c.buildingKey];

        if (!b) {
            gameData.construction = null;
            if (bPanel) bPanel.style.display = "none";
        } else {
            c.timeLeft -= dt;
            if (bPanel) {
                bPanel.style.display = "block";
                document.getElementById("build-name").innerText = b.name;
                document.getElementById("build-time").innerText = Economy.formatTime(c.timeLeft); // FIXED formatting
                document.getElementById("build-progress-bar").style.width = ((c.totalTime - c.timeLeft) / c.totalTime * 100) + "%";
            }
            if (c.timeLeft <= 0) {
                b.level++;
                gameData.construction = null;
                UI.renderBuildings();
            }
        }
    } else if (bPanel) bPanel.style.display = "none";

    // Research Progress
    const rPanel = document.getElementById("research-status");
    if (gameData.researchQueue) {
        let rq = gameData.researchQueue;
        const r = gameData.research[rq.researchKey];

        if (!r) {
            gameData.researchQueue = null;
            if (rPanel) rPanel.style.display = "none";
        } else {
            rq.timeLeft -= dt;
            if (rPanel) {
                rPanel.style.display = "block";
                document.getElementById("res-name").innerText = r.name;
                document.getElementById("res-time").innerText = Economy.formatTime(rq.timeLeft); // FIXED formatting
                document.getElementById("res-progress-bar").style.width = ((rq.totalTime - rq.timeLeft) / rq.totalTime * 100) + "%";
            }
            if (rq.timeLeft <= 0) {
                r.level++;
                gameData.researchQueue = null;
                UI.renderResearch();
                UI.renderBuildings();
                UI.renderTechTree();
            }
        }
    } else if (rPanel) rPanel.style.display = "none";

    UI.update();
    if (Math.random() < 0.01) SaveSystem.save(); 
}

window.onload = () => {
    SaveSystem.load();
    UI.init();
    setInterval(tick, 100);
    window.UI = UI;
};