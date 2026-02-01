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

        // Restore resources
        Object.assign(gameData.resources, saved.resources);

        // Deep restore levels for buildings and research
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

        // Restore active states
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
                prodInfo = `<p class="prod-val">Production: <span>+${Economy.formatNum(b.baseProd * b.level)} ${b.unit}</span></p>`;
            } else if (b.energyWeight < 0) {
                prodInfo = `<p class="prod-val">Energy: <span>+${Economy.formatNum(Math.abs(b.energyWeight * b.level))}</span></p>`;
            }

            listHtml += `
                <div class="card ${isLocked ? 'locked' : ''}">
                    <div class="card-header">
                        <h3 onclick="UI.showDetails('${key}')" style="cursor:pointer">${b.name}</h3>
                        <span class="lvl-badge">Lvl <span id="lvl-${key}">${b.level}</span></span>
                    </div>
                    <p class="desc">${b.desc}</p>
                    ${prodInfo}
                    ${isLocked ? reqHtml : `
                        <div class="cost-grid" id="cost-${key}"></div>
                        <button class="btn-build" onclick="Game.build('${key}')">Upgrade</button>
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
                <div class="card ${isLocked ? 'locked' : ''}">
                    <div class="card-header">
                        <h3>${r.name}</h3>
                        <span class="lvl-badge">Lvl <span id="res-lvl-${key}">${r.level}</span></span>
                    </div>
                    <p class="desc">${r.desc}</p>
                    ${isLocked ? reqHtml : `
                        <div id="res-cost-${key}" class="cost-grid"></div>
                        <button class="btn-build" onclick="Game.startResearch('${key}')">Research</button>
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
                <div class="card ${isLocked ? 'locked' : ''}">
                    <div class="card-header">
                        <h3>${s.name}</h3>
                        <span class="lvl-badge">Owned: <span id="ship-count-${key}">${s.count}</span></span>
                    </div>
                    <p class="desc">${s.desc}</p>
                    ${isLocked ? reqHtml : `
                        <div id="ship-cost-${key}" class="cost-grid"></div>
                        <div class="total-cost-preview" id="ship-total-${key}"></div>
                        <div class="ship-controls">
                            <input type="number" id="amt-${key}" value="1" min="1" class="ship-input" oninput="UI.updateShipTotal('${key}')">
                            <button class="btn-build" onclick="Game.buildShip('${key}')">Build</button>
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

        let html = `
            <div class="tree-col"><h3>Resources</h3>${categories.buildings.filter(([k,v]) => v.baseProd > 0 || v.energyWeight < 0).map(([k,v]) => `<div class="card"><strong>${v.name}</strong></div>`).join('')}</div>
            <div class="tree-col"><h3>Facilities</h3>${categories.buildings.filter(([k,v]) => v.baseProd === 0 && v.energyWeight >= 0).map(([k,v]) => `<div class="card"><strong>${v.name}</strong></div>`).join('')}</div>
            <div class="tree-col"><h3>Research</h3>${categories.research.map(([k,v]) => `<div class="card"><strong>${v.name}</strong></div>`).join('')}</div>
            <div class="tree-col"><h3>Ships</h3>${categories.ships.map(([k,v]) => `<div class="card"><strong>${v.name}</strong></div>`).join('')}</div>
        `;
        container.innerHTML = html;
    },

    update() {
        const res = gameData.resources;
        const prod = Economy.getProduction();

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

        for (let k in gameData.buildings) {
            const lvlEl = document.getElementById(`lvl-${k}`);
            const costEl = document.getElementById(`cost-${k}`);
            if (lvlEl) lvlEl.innerText = gameData.buildings[k].level;
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'building'));
        }

        for (let k in gameData.research) {
            const lvlEl = document.getElementById(`res-lvl-${k}`);
            const costEl = document.getElementById(`res-cost-${k}`);
            if (lvlEl) lvlEl.innerText = gameData.research[k].level;
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'research'));
        }

        for (let k in gameData.ships) {
            const costEl = document.getElementById(`ship-cost-${k}`);
            if (costEl) costEl.innerHTML = buildCostRow(Economy.getCost(k, 'ship'));
            this.updateShipTotal(k);
        }
    },

    updateShipTotal(key) {
        const el = document.getElementById(`ship-total-${key}`);
        const amt = parseInt(document.getElementById(`amt-${key}`)?.value || 1);
        if (!el || isNaN(amt)) return;

        const base = Economy.getCost(key, 'ship');
        const total = { m: base.metal * amt, c: base.crystal * amt, d: base.deuterium * amt };
        el.innerText = `Total: ${icons.metal}${Economy.formatNum(total.m)} ${icons.crystal}${Economy.formatNum(total.c)} ${icons.deuterium}${Economy.formatNum(total.d)}`;
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
        // Placeholder for details navigation
        console.log("Navigating to details for:", key);
    }
};

window.Game = {
    build(key) {
        const costs = Economy.getCost(key, 'building');
        const b = gameData.buildings[key];
        if (gameData.construction || gameData.resources.metal < costs.metal || gameData.resources.crystal < costs.crystal || gameData.resources.deuterium < costs.deuterium) return;

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
        if (gameData.resources.metal < costs.metal || gameData.resources.crystal < costs.crystal || gameData.resources.deuterium < costs.deuterium) return;

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

    cancelConstruction() { gameData.construction = null; },
    cancelResearch() { gameData.researchQueue = null; },
    downloadSave: SaveSystem.downloadSave
};

function tick() {
    const now = Date.now();
    const dt = (now - gameData.lastTick) / 1000;
    gameData.lastTick = now;

    // Resource Generation
    const prod = Economy.getProduction();
    gameData.resources.metal += prod.metal * dt;
    gameData.resources.crystal += prod.crystal * dt;
    gameData.resources.deuterium += prod.deuterium * dt;
    Economy.updateEnergy();

    // Construction Progress
    const bPanel = document.getElementById("construction-status");
    if (gameData.construction) {
        let c = gameData.construction;
        c.timeLeft -= dt;
        if (bPanel) {
            bPanel.style.display = "block";
            const b = gameData.buildings[c.buildingKey];
            if (b) {
                document.getElementById("build-name").innerText = b.name;
                document.getElementById("build-time").innerText = Math.ceil(c.timeLeft);
                document.getElementById("build-progress-bar").style.width = ((c.totalTime - c.timeLeft) / c.totalTime * 100) + "%";
            }
        }
        if (c.timeLeft <= 0) {
            gameData.buildings[c.buildingKey].level++;
            gameData.construction = null;
            UI.renderBuildings();
        }
    } else if (bPanel) bPanel.style.display = "none";

    // Research Progress
    const rPanel = document.getElementById("research-status");
    if (gameData.researchQueue) {
        let rq = gameData.researchQueue;
        rq.timeLeft -= dt;
        const r = gameData.research[rq.researchKey];
        if (rPanel && r) {
            rPanel.style.display = "block";
            document.getElementById("res-name").innerText = r.name;
            document.getElementById("res-time").innerText = Math.ceil(rq.timeLeft);
            document.getElementById("res-progress-bar").style.width = ((rq.totalTime - rq.timeLeft) / rq.totalTime * 100) + "%";
        }
        if (rq.timeLeft <= 0) {
            if (r) r.level++;
            gameData.researchQueue = null;
            UI.renderResearch();
            UI.renderBuildings();
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