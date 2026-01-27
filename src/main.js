import { gameData, icons } from './gameData.js';
import { Economy } from './economy.js';

// --- SAVE/LOAD SYSTEM ---
const SaveSystem = {
    save() { localStorage.setItem("spaceColonySave", JSON.stringify(gameData)); },
    load() {
        let saved = JSON.parse(localStorage.getItem("spaceColonySave"));
        if (!saved) return;
        Object.assign(gameData.resources, saved.resources);
        for (let k in saved.buildings) gameData.buildings[k].level = saved.buildings[k].level;
        gameData.construction = saved.construction;
        gameData.lastTick = saved.lastTick || Date.now();
    }
};

// --- UI CONTROLLER ---
const UI = {
    init() {
        let listHtml = "";
        for (let key in gameData.buildings) {
            listHtml += `
            <div class="building">
                <div>
                    <strong>${gameData.buildings[key].name} (Lvl <span id="lvl-${key}">0</span>)</strong><br>
                    <small id="cost-${key}"></small>
                </div>
                <button id="btn-${key}" onclick="Game.buyBuilding('${key}')">Upgrade</button>
            </div>`;
        }
        document.getElementById("building-list").innerHTML = listHtml;
    },

    update() {
        let prod = Economy.getProduction();
        let r = gameData.resources;

        // Top Bar
        document.getElementById("metal-display").innerText = Economy.formatNum(r.metal);
        document.getElementById("crystal-display").innerText = Economy.formatNum(r.crystal);
        document.getElementById("deuterium-display").innerText = Economy.formatNum(r.deuterium);
        
        const enDisp = document.getElementById("energy-display");
        enDisp.innerText = Economy.formatNum(r.energy);
        enDisp.style.color = r.energy < 0 ? "#ff4444" : "#00ff00";
        document.getElementById("max-energy-display").innerText = Economy.formatNum(r.maxEnergy);

        // Hover Warnings
        let isLowPower = r.energy < 0;
        ["metal", "crystal", "deuterium"].forEach(res => {
            const el = document.getElementById(`${res}-hover`);
            el.title = `Prod: ${Economy.formatNum(prod[res] * 3600)}/h\nEff: ${isLowPower ? '10%' : '100%'}`;
            el.classList.toggle("warning", isLowPower);
        });

        // Building List
        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            let costs = Economy.getCost(key);
            document.getElementById(`lvl-${key}`).innerText = b.level;
            
            // Cost Coloring
            let costHtml = "Cost: " + this.getSpan(costs.metal, r.metal, icons.metal);
            if (costs.crystal > 0) costHtml += " | " + this.getSpan(costs.crystal, r.crystal, icons.crystal);
            document.getElementById(`cost-${key}`).innerHTML = costHtml;

            // Requirements & Busy State
            let meetsReq = true;
            if (b.req) for (let rk in b.req) if (gameData.buildings[rk].level < b.req[rk]) meetsReq = false;
            
            let btn = document.getElementById(`btn-${key}`);
            btn.disabled = gameData.construction.buildingKey !== null || r.metal < costs.metal || !meetsReq;
            btn.innerText = meetsReq ? "Upgrade" : "Locked";
        }

        // Construction Panel
        let panel = document.getElementById("construction-status");
        if (gameData.construction.buildingKey) {
            panel.style.display = "block";
            let c = gameData.construction;
            document.getElementById("build-name").innerText = gameData.buildings[c.buildingKey].name;
            document.getElementById("build-time").innerText = Math.ceil(c.timeLeft);
            document.getElementById("build-progress-bar").style.width = ((c.totalTime - c.timeLeft) / c.totalTime * 100) + "%";
        } else {
            panel.style.display = "none";
        }
    },

    getSpan(needed, has, icon) {
        return `<span style="color: ${has >= needed ? '#00ff00' : '#ff4444'}">${Economy.formatNum(needed)}${icon}</span>`;
    }
};

// --- GLOBAL GAME OBJECT (Exposed to HTML) ---
window.Game = {
    buyBuilding(key) {
        let costs = Economy.getCost(key);
        if (gameData.resources.metal >= costs.metal) {
            gameData.resources.metal -= costs.metal;
            let b = gameData.buildings[key];
            gameData.construction = {
                buildingKey: key,
                timeLeft: b.baseTime * Math.pow(1.2, b.level),
                totalTime: b.baseTime * Math.pow(1.2, b.level)
            };
            SaveSystem.save();
        }
    },
    cancelConstruction() {
        if (!confirm("Cancel for 50% refund?")) return;
        let costs = Economy.getCost(gameData.construction.buildingKey);
        gameData.resources.metal += Math.floor(costs.metal * 0.5);
        gameData.construction.buildingKey = null;
        SaveSystem.save();
    },
    saveGame() {
        console.log("Saving game..."); 
        localStorage.setItem("spaceColonySave", JSON.stringify(gameData));
    },
    loadGame() {
        let savedJSON = localStorage.getItem("spaceColonySave");
        if (!savedJSON) return;
        let savedGame = JSON.parse(savedJSON);

        // 1. Restore Resources safely (don't let undefined values in)
        if (savedGame.resources) {
            gameData.resources.metal = savedGame.resources.metal || 0;
            gameData.resources.crystal = savedGame.resources.crystal || 0;
            gameData.resources.deuterium = savedGame.resources.deuterium || 0;
            gameData.resources.energy = savedGame.resources.energy || 0;
        }

        // 2. Restore Building Levels
        for (let key in gameData.buildings) {
            if (savedGame.buildings && savedGame.buildings[key]) {
                gameData.buildings[key].level = savedGame.buildings[key].level || 0;
            }
        }

        // 3. Restore Construction State
        if (savedGame.construction) {
            gameData.construction = savedGame.construction;
        }

        // 4. Time Sync
        gameData.lastTick = savedGame.lastTick || Date.now();
        let now = Date.now();
        let deltaTime = (now - gameData.lastTick) / 1000;

        if (deltaTime > 1) {
            // If we were building something while offline, subtract that time
            if (gameData.construction.buildingKey) {
                gameData.construction.timeLeft -= deltaTime;
                if (gameData.construction.timeLeft < 0) gameData.construction.timeLeft = 0.1;
            }
            
            // Add offline resources
            let prod = getProduction();
            gameData.resources.metal += prod.metal * deltaTime;
            gameData.resources.crystal += prod.crystal * deltaTime;
            gameData.resources.deuterium += prod.deuterium * deltaTime;
        }
    }
};

// --- START ---
SaveSystem.load();
UI.init();
setInterval(() => {
    let now = Date.now();
    let dt = (now - gameData.lastTick) / 1000;
    
    if (gameData.construction.buildingKey) {
        gameData.construction.timeLeft -= dt;
        if (gameData.construction.timeLeft <= 0) {
            gameData.buildings[gameData.construction.buildingKey].level++;
            gameData.construction.buildingKey = null;
        }
    }

    let prod = Economy.getProduction();
    gameData.resources.metal += prod.metal * dt;
    gameData.resources.crystal += prod.crystal * dt;
    gameData.resources.deuterium += prod.deuterium * dt;

    gameData.lastTick = now;
    UI.update();
}, 100);
