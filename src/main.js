import '../style.css';
import { gameData, icons } from './gameData.js';
import { Economy } from './economy.js';

window.gameData = gameData; // Expose for debugging

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
                    <strong>${gameData.buildings[key].name} (Lvl <span id="lvl-${key}">0</span>)</strong>
                    <div class="desc">${gameData.buildings[key].desc}</div>
                    <div id="req-${key}" class="req-box"></div> <small id="cost-${key}"></small>
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
            
            // Use the shared function
            let reqStatus = Economy.checkRequirements(key); 
            
            // Update the requirement box
            let reqHtml = "";
            if (!reqStatus.met) {
                reqHtml = `<small style="color:#ff6666">Req: ${reqStatus.missing.join(", ")}</small>`;
            }
            document.getElementById(`req-${key}`).innerHTML = reqHtml;

            // Update level and costs 
            document.getElementById(`lvl-${key}`).innerText = b.level;
            let costHtml = "Cost: " + this.getSpan(costs.metal, r.metal, icons.metal);
            if (costs.crystal > 0) costHtml += " | " + this.getSpan(costs.crystal, r.crystal, icons.crystal);
            if (costs.deuterium > 0) costHtml += " | " + this.getSpan(costs.deuterium, r.deuterium, icons.deuterium);
            document.getElementById(`cost-${key}`).innerHTML = costHtml;

            // Disable logic
            let btn = document.getElementById(`btn-${key}`);
            btn.disabled = gameData.construction.buildingKey !== null || 
                        r.metal < costs.metal || 
                        r.crystal < (costs.crystal || 0) || 
                        r.deuterium < (costs.deuterium || 0) || 
                        !reqStatus.met; // Use reqStatus.met here

            btn.innerText = reqStatus.met ? "Upgrade" : "Locked";
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

// --- GLOBAL GAME OBJECT ---
// This exports our functions back to the HTML world
window.Game = {
    buyBuilding(key) {
        let b = gameData.buildings[key];
        let costs = Economy.getCost(key);
        let r = gameData.resources;

        // Check requirements using the shared function
        let reqStatus = Economy.checkRequirements(key);

        if (reqStatus.met && 
            r.metal >= costs.metal && 
            r.crystal >= (costs.crystal || 0) && 
            r.deuterium >= (costs.deuterium || 0)) {
            
            // ... (deduct resources and start construction) ...
            console.log(`Started building ${b.name}`);
            SaveSystem.save();
        } else {
            console.warn("Cannot build: Check resources or requirements.");
        }
    },
    cancelConstruction() {
        if (!gameData.construction.buildingKey) return;
        if (confirm(`Cancel construction? You will only get back 50% refund.`)) {
            let key = gameData.construction.buildingKey;
            let costs = Economy.getCost(key);
            gameData.resources.metal += Math.floor(costs.metal * 0.5);
            gameData.resources.crystal += Math.floor(costs.crystal * 0.5);
            gameData.resources.deuterium += Math.floor(costs.deuterium * 0.5);
            gameData.construction.buildingKey = null;
            SaveSystem.save();
        }
    },
    // Adding the Download/Upload functions for your buttons
    downloadSave() {
        const dataStr = JSON.stringify(gameData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "colony_save.json";
        link.click();
        URL.revokeObjectURL(url);
    },
    uploadSave(event) {
        const file = event.target.files[0];
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

// --- INITIALIZE ENGINE ---
SaveSystem.load();
UI.init(); // This builds the building list HTML on launch

setInterval(() => {
    let now = Date.now();
    let dt = (now - gameData.lastTick) / 1000;

    Economy.updateEnergy();
    
    // Handle Construction
    if (gameData.construction.buildingKey) {
        gameData.construction.timeLeft -= dt;
        if (gameData.construction.timeLeft <= 0) {
            gameData.buildings[gameData.construction.buildingKey].level++;
            gameData.construction.buildingKey = null;
            SaveSystem.save(); // Save automatically when building finishes
        }
    }

    // Handle Production
    let prod = Economy.getProduction();
    gameData.resources.metal += prod.metal * dt;
    gameData.resources.crystal += prod.crystal * dt;
    gameData.resources.deuterium += prod.deuterium * dt;

    gameData.lastTick = now;
    UI.update();
}, 100);