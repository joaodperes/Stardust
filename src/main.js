import '../style.css';
import { gameData, icons } from './gameData.js';
import { Economy } from './economy.js';

// --- SAVE/LOAD SYSTEM ---
const SaveSystem = {
    save() { localStorage.setItem("spaceColonySave", JSON.stringify(gameData)); },
    load() {
        let saved = JSON.parse(localStorage.getItem("spaceColonySave"));
        if (!saved) return;
        
        // Use Object.assign for top level, but manually map nested objects to preserve structure
        Object.assign(gameData.resources, saved.resources);
        
        if (saved.buildings) {
            for (let k in saved.buildings) {
                if (gameData.buildings[k]) gameData.buildings[k].level = saved.buildings[k].level;
            }
        }
        
        if (saved.research) {
            for (let k in saved.research) {
                if (gameData.research[k]) gameData.research[k].level = saved.research[k].level;
            }
        }

        if (saved.ships) {
            for (let k in saved.ships) {
                if (gameData.ships[k]) gameData.ships[k].count = saved.ships[k].count;
            }
        }
        
        gameData.construction = saved.construction;
        gameData.shipQueue = saved.shipQueue || []; 
        gameData.researchQueue = saved.researchQueue || null;
        gameData.lastTick = saved.lastTick || Date.now();
        gameData.currentTab = saved.currentTab || 'buildings';
    }
};

// --- UI CONTROLLER ---
const UI = {
    init() {
        // Initial render of everything
        this.renderBuildings();
        this.renderHangar();
        this.renderResearch();
        // If you have a tech tree, uncomment the line below:
        // this.renderTechTree();
        
        this.update(); 
        this.showTab(gameData.currentTab || 'buildings');
    },

    renderBuildings() {
        const container = document.getElementById("buildings-list");
        if (!container) return; // Exit if element doesn't exist

        let listHtml = "";
        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            let isLocked = false;
            let reqHtml = "";
            
            if (b.req) {
                for (let rKey in b.req) {
                    let requiredLvl = b.req[rKey];
                    let currentLvl = (gameData.buildings[rKey]?.level ?? gameData.research[rKey]?.level ?? 0);
                    if (currentLvl < requiredLvl) {
                        isLocked = true;
                        let name = gameData.buildings[rKey]?.name || gameData.research[rKey]?.name || rKey;
                        reqHtml += `<div class="req-tag">Requires ${name} Lvl ${requiredLvl}</div>`;
                    }
                }
            }

            listHtml += `
                <div class="card ${isLocked ? 'locked' : ''}">
                    <div class="card-header">
                        <h3>${b.name} <span class="lvl-badge">Lvl <span id="lvl-${key}">${b.level}</span></span></h3>
                    </div>
                    <p class="desc">${b.desc}</p>
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
                    <h3>${r.name} (Lvl <span id="res-lvl-${key}">${r.level}</span>)</h3>
                    <p>${r.desc}</p>
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
                    <h3>${s.name} (Owned: <span id="ship-count-${key}">${s.count}</span>)</h3>
                    <p>${s.desc}</p>
                    ${isLocked ? reqHtml : `
                        <div id="ship-cost-${key}" class="cost-grid"></div>
                        <div class="ship-controls">
                            <input type="number" id="amt-${key}" value="1" min="1" class="ship-input">
                            <button onclick="Game.buildShip('${key}')">Build</button>
                        </div>
                    `}
                </div>
            `;
        }
        container.innerHTML = html;
    },

    update() {
        const res = gameData.resources;
        
        // Update basic resource displays (check existence for safety)
        const updateText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        updateText("metal-display", Economy.formatNum(res.metal));
        updateText("crystal-display", Economy.formatNum(res.crystal));
        updateText("deuterium-display", Economy.formatNum(res.deuterium));
        updateText("max-energy-display", Economy.formatNum(res.maxEnergy));

        const energyEl = document.getElementById("energy-display");
        if (energyEl) {
            energyEl.innerText = Economy.formatNum(res.energy);
            energyEl.style.color = res.energy < 0 ? "#ff4444" : "#00ff00";
        }

        // Buildings Costs
        for (let key in gameData.buildings) {
            const b = gameData.buildings[key];
            const lvlEl = document.getElementById(`lvl-${key}`);
            const costEl = document.getElementById(`cost-${key}`);
            
            if (lvlEl) lvlEl.innerText = b.level;
            if (costEl) {
                const costs = Economy.getCost(key, 'building');
                costEl.innerHTML = `
                    <span class="${res.metal >= costs.metal ? '' : 'insufficient'}">${icons.metal} ${Economy.formatNum(costs.metal)}</span>
                    <span class="${res.crystal >= costs.crystal ? '' : 'insufficient'}">${icons.crystal} ${Economy.formatNum(costs.crystal)}</span>
                    <span class="${res.deuterium >= costs.deuterium ? '' : 'insufficient'}">${icons.deuterium} ${Economy.formatNum(costs.deuterium)}</span>
                `;
            }
        }

        // Research Costs
        for (let key in gameData.research) {
            const r = gameData.research[key];
            const lvlEl = document.getElementById(`res-lvl-${key}`);
            const costEl = document.getElementById(`res-cost-${key}`);
            
            if (lvlEl) lvlEl.innerText = r.level;
            if (costEl) {
                const costs = Economy.getCost(key, 'research');
                costEl.innerHTML = `
                    <span class="${res.metal >= costs.metal ? '' : 'insufficient'}">${icons.metal} ${Economy.formatNum(costs.metal)}</span>
                    <span class="${res.crystal >= costs.crystal ? '' : 'insufficient'}">${icons.crystal} ${Economy.formatNum(costs.crystal)}</span>
                    <span class="${res.deuterium >= costs.deuterium ? '' : 'insufficient'}">${icons.deuterium} ${Economy.formatNum(costs.deuterium)}</span>
                `;
            }
        }
    },

    showTab(tabID) {
        const target = document.getElementById(tabID);
        if (!target) return; // Important: Don't try to show a tab that doesn't exist

        gameData.currentTab = tabID;
        document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        
        target.style.display = 'block';
        const btn = document.getElementById(`btn-tab-${tabID}`);
        if(btn) btn.classList.add('active');

        // Fresh render for the specific tab
        if(tabID === 'buildings') this.renderBuildings();
        if(tabID === 'research') this.renderResearch();
        if(tabID === 'hangar') this.renderHangar();
    }
};

// --- GLOBAL GAME LOGIC ---
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

    cancelConstruction() { gameData.construction = null; },
    cancelResearch() { gameData.researchQueue = null; }
};

// --- MAIN LOOP ---
function tick() {
    const now = Date.now();
    const dt = (now - gameData.lastTick) / 1000;
    gameData.lastTick = now;

    const prod = Economy.getProduction();
    gameData.resources.metal += prod.metal * dt;
    gameData.resources.crystal += prod.crystal * dt;
    gameData.resources.deuterium += prod.deuterium * dt;
    Economy.updateEnergy();

    // Progress Logic for Buildings
    if (gameData.construction) {
        let c = gameData.construction;
        c.timeLeft -= dt;
        const panel = document.getElementById("construction-status");
        if(panel) {
            panel.style.display = "block";
            const nameEl = document.getElementById("build-name");
            const timeEl = document.getElementById("build-time");
            const barEl = document.getElementById("build-progress-bar");
            if(nameEl) nameEl.innerText = gameData.buildings[c.buildingKey].name;
            if(timeEl) timeEl.innerText = Math.ceil(c.timeLeft);
            if(barEl) barEl.style.width = ((c.totalTime - c.timeLeft) / c.totalTime * 100) + "%";
        }
        if (c.timeLeft <= 0) {
            gameData.buildings[c.buildingKey].level++;
            gameData.construction = null;
            if(panel) panel.style.display = "none";
            UI.renderBuildings();
        }
    }

    // Progress Logic for Research
    if (gameData.researchQueue) {
        let rq = gameData.researchQueue;
        rq.timeLeft -= dt;
        const panel = document.getElementById("research-status");
        if(panel) {
            panel.style.display = "block";
            const nameEl = document.getElementById("res-name");
            const timeEl = document.getElementById("res-time");
            const barEl = document.getElementById("res-progress-bar");
            if(nameEl) nameEl.innerText = gameData.research[rq.researchKey].name;
            if(timeEl) timeEl.innerText = Math.ceil(rq.timeLeft);
            if(barEl) barEl.style.width = ((rq.totalTime - rq.timeLeft) / rq.totalTime * 100) + "%";
        }
        if (rq.timeLeft <= 0) {
            gameData.research[rq.researchKey].level++;
            gameData.researchQueue = null;
            if(panel) panel.style.display = "none";
            UI.renderResearch();
        }
    }

    UI.update();
    if (Math.random() < 0.01) SaveSystem.save(); 
}

// Start Game
window.onload = () => {
    SaveSystem.load();
    UI.init();
    setInterval(tick, 100);
    window.UI = UI; // Expose to global for onclick events
};