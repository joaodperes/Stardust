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
        for (let k in saved.buildings) gameData.buildings[k].level = saved.buildings[k].level;
        if(saved.ships) {
            for (let k in saved.ships) gameData.ships[k].count = saved.ships[k].count;
        }
        gameData.construction = saved.construction;
        gameData.shipQueue = saved.shipQueue || []; 
        gameData.lastTick = saved.lastTick || Date.now();
        UI.showTab(gameData.currentTab);
    }
};

// --- UI CONTROLLER ---
const UI = {
    init() {
        this.renderBuildings();
        this.renderHangar(); 
        UI.showTab(gameData.currentTab || 'buildings');
    },

    renderBuildings() {
        let listHtml = "";
        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            
            // REMOVED: <div class="building-image">...</div>
            // We keep "horizontal" class if you want wide cards, or remove it for standard cards.
            // I removed 'horizontal' here so they look like standard text cards.
            listHtml += `
            <div class="building-card"> 
                <div class="building-info-main">
                    <div>
                        <strong class="details-trigger" onclick="UI.showDetails('${key}')">${b.name}</strong> 
                        <span class="lvl-tag">Lvl <span id="lvl-${key}">${b.level}</span></span>
                    </div>
                    <div id="req-${key}"></div>
                    <div class="building-footer">
                        <small id="cost-${key}"></small>
                        <button id="btn-${key}" onclick="Game.buyBuilding('${key}')">Upgrade</button>
                    </div>
                    <small id="time-${key}" style="display:block; margin-top:5px;"></small>
                </div>
            </div>`;
        }
        document.getElementById("building-list").innerHTML = listHtml;
    },

    renderHangar() {
        const container = document.getElementById("tab-hangar");
        if(!container) return; 

        let html = `<h2>Hangar</h2><div id="ship-list" class="list-container">`;
        
        for (let key in gameData.ships) {
            const s = gameData.ships[key];
            
            // 1. Requirement Logic
            let isLocked = false;
            let reqHtml = "";
            if (s.req) {
                for (let target in s.req) {
                    const requiredLvl = s.req[target];
                    const currentLvl = gameData.buildings[target]?.level || 0;
                    if (currentLvl < requiredLvl) {
                        isLocked = true;
                        reqHtml = `<div class="req-tag">Requires ${gameData.buildings[target].name} Lvl ${requiredLvl}</div>`;
                    }
                }
            }

            // 2. Time Calculation (Format: hh:mm:ss)
            const shipyardLvl = gameData.buildings.shipyard.level;
            const roboticsLvl = gameData.buildings.robotics?.level || 0;
            const timePerUnit = s.baseTime / (1 + shipyardLvl + roboticsLvl);

            // 3. HTML Template
            html += `
                <div class="building-card horizontal ${isLocked ? 'locked' : ''}">
                    <div class="building-info-main">
                        <div class="info-header">
                            <div>
                                <strong>${s.name}</strong>
                                ${reqHtml}
                            </div>
                            <span class="lvl-tag">Owned: ${s.count}</span>
                        </div>
                        
                        <div class="ship-layout-grid">
                            <div class="ship-description">
                                <p>${s.desc}</p>
                                <div class="ship-stats">
                                    ⚔️ ${s.stats.attack || 0} | 🛡️ ${s.stats.shield || 0} | 🧱 ${s.stats.armor || 0} | 📦 ${Economy.formatNum(s.stats.capacity || 0)}
                                </div>
                            </div>
                            
                            <div class="ship-costs-actions">
                                <div class="cost-line">
                                    ${s.cost.metal > 0 ? '🔘' + Economy.formatNum(s.cost.metal) : ''} 
                                    ${s.cost.crystal > 0 ? '💎' + Economy.formatNum(s.cost.crystal) : ''} 
                                    ${s.cost.deuterium > 0 ? '🧪' + Economy.formatNum(s.cost.deuterium) : ''}
                                </div>
                                <div class="time-line">⌛ ${Economy.formatTime(timePerUnit)}</div>
                                <div class="ship-controls">
                                    <input type="number" id="qty-${key}" value="1" min="1" ${isLocked ? 'disabled' : ''}>
                                    <button onclick="Game.startShipProduction('${key}', document.getElementById('qty-${key}').value)" 
                                        ${isLocked ? 'disabled' : ''}>
                                        ${isLocked ? 'Locked' : 'Build'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
        }

        // 4. Render Queue (Styled with better spacing)
        if (gameData.shipQueue.length > 0) {
            html += `<div class="queue-container">
                <h3>Production Queue</h3>`;
            gameData.shipQueue.forEach(order => {
                let shipName = gameData.ships[order.key].name;
                html += `
                    <div class="queue-item">
                        <span>${shipName} (x${order.amount})</span>
                        <span class="queue-timer">${Economy.formatTime(order.timeLeft)}</span>
                    </div>`;
            });
            html += `</div>`;
        }
        
        html += `</div>`;
        container.innerHTML = html;
    },

    showTab(tabName) {
        gameData.currentTab = tabName;
        document.querySelectorAll('.game-tab').forEach(tab => {
            tab.style.display = tab.id === `tab-${tabName}` ? 'block' : 'none';
        });
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.getElementById(`btn-tab-${tabName}`);
        if (activeBtn) activeBtn.classList.add('active');
        
        if(tabName === 'hangar') this.renderHangar();
        SaveSystem.save();
    },

    showDetails(key) {
        const b = gameData.buildings[key];
        document.getElementById("details-name").innerText = b.name;
        document.getElementById("details-desc").innerText = b.desc;

        let projectionHtml = `
            <table class="projection-table">
                <thead>
                    <tr><th>Level</th><th>Costs</th><th>Energy Use</th><th>Benefit</th></tr>
                </thead>
                <tbody>`;

        for (let i = 1; i <= 5; i++) {
            let nextLvl = b.level + i;
            let m = Math.floor(b.cost.metal * Math.pow(b.growth, nextLvl));
            let c = Math.floor(b.cost.crystal * Math.pow(b.growth, nextLvl));
            let d = Math.floor(b.cost.deuterium * Math.pow(b.growth, nextLvl));

            let eWeight = b.energyWeight;
            let eValue = nextLvl * Math.floor(Math.abs(eWeight) * nextLvl * Math.pow(1.1, nextLvl));
            let energyFlow = "";

            if (eWeight < 0) energyFlow = `<span style="color:#00ff00">+${eValue}</span>`;
            else if (eWeight > 0) energyFlow = `<span style="color:#ff6666">-${eValue}</span>`;
            else energyFlow = `<span style="color:#aaa">0</span>`;

            let benefit = "";
            if (b.unit === "% Time") {
                let reduction = ((1 - Math.pow(0.99, nextLvl)) * 100).toFixed(1);
                benefit = `-${reduction}%`;
            } else {
                benefit = `${nextLvl * b.baseProd}${b.unit}`;
            }

            projectionHtml += `
                <tr>
                    <td>${nextLvl}</td>
                    <td>🔘${Economy.formatNum(m)} 💎${Economy.formatNum(c)} ${d > 0 ? '🧪' + Economy.formatNum(d) : ''}</td>
                    <td>⚡ ${energyFlow}</td>
                    <td style="color:#00ff00; font-weight:bold">${benefit}</td>
                </tr>`;
        }
        projectionHtml += `</tbody></table>`;
        document.getElementById("details-projection").innerHTML = projectionHtml;
        this.showTab('details');
    },

    update() {
        let prod = Economy.getProduction();
        let r = gameData.resources;

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
            if(el) {
                el.title = `Prod: ${Economy.formatNum(prod[res] * 3600)}/h\nEff: ${isLowPower ? '10%' : '100%'}`;
                el.classList.toggle("warning", isLowPower);
            }
        });

        // Building List
        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            // Only update if element exists (in case we are on Hangar tab)
            if(!document.getElementById(`cost-${key}`)) continue;

            let costs = Economy.getCost(key);
            let reqStatus = Economy.checkRequirements(key); 
            
            let reqHtml = "";
            if (!reqStatus.met) {
                reqHtml = `<small style="color:#ff6666">Req: ${reqStatus.missing.join(", ")}</small>`;
            }
            document.getElementById(`req-${key}`).innerHTML = reqHtml;
            document.getElementById(`lvl-${key}`).innerText = b.level;
            
            let costHtml = "Cost: " + this.getSpan(costs.metal, r.metal, icons.metal);
            if (costs.crystal > 0) costHtml += " | " + this.getSpan(costs.crystal, r.crystal, icons.crystal);
            if (costs.deuterium > 0) costHtml += " | " + this.getSpan(costs.deuterium, r.deuterium, icons.deuterium);
            
            let nextLevel = b.level + 1;
            if (b.energyWeight !== 0) {
                let nextPower = nextLevel * Math.abs(b.energyWeight);
                let powerColor = b.energyWeight < 0 ? "#00ff00" : "#ff6666";
                let powerSymbol = b.energyWeight < 0 ? "+" : "-";
                costHtml += ` | <span style="color:${powerColor}">Power: ${powerSymbol}${nextPower}⚡</span>`;
            }
            document.getElementById(`cost-${key}`).innerHTML = costHtml;

            let standardTime = b.baseTime * Math.pow(b.timeGrowth, b.level);
            let robotLvl = gameData.buildings.robotics?.level || 0;
            let bonusMultiplier = Math.pow(0.99, robotLvl);
            let finalTime = standardTime * bonusMultiplier;
            document.getElementById(`time-${key}`).innerHTML = `<small style="color:#ffaa00">Time: ${finalTime.toFixed(1)}s</small>`;

            let btn = document.getElementById(`btn-${key}`);
            btn.disabled = gameData.construction.buildingKey !== null || 
                           r.metal < costs.metal || 
                           r.crystal < (costs.crystal || 0) || 
                           r.deuterium < (costs.deuterium || 0) || 
                           !reqStatus.met; 

            btn.innerText = reqStatus.met ? "Upgrade" : "Locked";
        }

        // Construction Panel
        let panel = document.getElementById("construction-status");
        if (gameData.construction.buildingKey) {
            panel.style.display = "block";
            let c = gameData.construction;
            document.getElementById("build-name").innerText = gameData.buildings[c.buildingKey].name;
            document.getElementById("build-time").innerText = Math.max(0,Math.ceil(c.timeLeft));
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
window.Game = {
    buyBuilding(key) {
        let b = gameData.buildings[key];
        let costs = Economy.getCost(key);
        let r = gameData.resources;
        let reqStatus = Economy.checkRequirements(key);

        if (reqStatus.met && 
            r.metal >= (costs.metal || 0) && 
            r.crystal >= (costs.crystal || 0) && 
            r.deuterium >= (costs.deuterium || 0)) {
            
            r.metal -= (costs.metal || 0);
            r.crystal -= (costs.crystal || 0);
            r.deuterium -= (costs.deuterium || 0);

            let standardTime = b.baseTime * Math.pow(b.timeGrowth, b.level);
            let robotLvl = gameData.buildings.robotics?.level || 0;
            let bonusMultiplier = Math.pow(0.99, robotLvl);
            let finalTime = standardTime * bonusMultiplier;

            gameData.construction = {
                buildingKey: key,
                timeLeft: finalTime,
                totalTime: finalTime 
            };
            SaveSystem.save();
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

    startShipProduction(key, amount) {
        const ship = gameData.ships[key];
        const qty = parseInt(amount);
        if (isNaN(qty) || qty <= 0) return;

        const totalMetal = ship.cost.metal * qty;
        const totalCrystal = ship.cost.crystal * qty;
        const totalDeut = ship.cost.deuterium * qty;

        if (gameData.resources.metal >= totalMetal && 
            gameData.resources.crystal >= totalCrystal && 
            gameData.resources.deuterium >= totalDeut) {
            
            gameData.resources.metal -= totalMetal;
            gameData.resources.crystal -= totalCrystal;
            gameData.resources.deuterium -= totalDeut;

            const hangarLvl = gameData.buildings.hangar.level;
            const roboticsLvl = gameData.buildings.robotics.level;
            // Formula: BaseTime / (1 + hangarLevel + RoboticsLevel)
            const timePerUnit = ship.baseTime / (1 + hangarLvl + roboticsLvl);

            gameData.shipQueue.push({
                key: key,
                amount: qty,
                unitTime: timePerUnit,
                timeLeft: timePerUnit // Time for the FIRST unit in the batch
            });

            UI.update();
        } else {
            alert("Not enough resources!");
        }
    },

    // MOVED: logic for updating queue is now in Game, not UI
    updateShipQueue(deltaTime) {
        if (gameData.shipQueue.length === 0) return;

        let currentOrder = gameData.shipQueue[0];
        currentOrder.timeLeft -= deltaTime;

        if (currentOrder.timeLeft <= 0) {
            gameData.ships[currentOrder.key].count += 1;
            currentOrder.amount -= 1;

            if (currentOrder.amount > 0) {
                currentOrder.timeLeft = currentOrder.unitTime; 
            } else {
                gameData.shipQueue.shift(); 
            }
            UI.renderHangar(); // Re-render to show new count
        }
    },

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
UI.init(); 

setInterval(() => {
    let now = Date.now();
    let dt = (now - gameData.lastTick) / 1000;

    Economy.updateEnergy();
    
    // 1. Handle Building Construction
    if (gameData.construction.buildingKey) {
        gameData.construction.timeLeft -= dt;
        if (gameData.construction.timeLeft <= 0) {
            gameData.buildings[gameData.construction.buildingKey].level++;
            gameData.construction.buildingKey = null;
            SaveSystem.save();
            UI.renderBuildings(); 
        }
    }

    // 2. Handle Ship Queue 
    // This now works because we moved the function to window.Game
    Game.updateShipQueue(dt);

    // 3. Handle Production
    let prod = Economy.getProduction();
    gameData.resources.metal += prod.metal * dt;
    gameData.resources.crystal += prod.crystal * dt;
    gameData.resources.deuterium += prod.deuterium * dt;

    gameData.lastTick = now;
    UI.update();
}, 100);

window.gameData = gameData;
window.UI = UI;
window.Game = Game;