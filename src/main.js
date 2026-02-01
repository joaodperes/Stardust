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
        // Force an update immediately so numbers aren't empty
        this.update(); 
        UI.showTab(gameData.currentTab || 'buildings');
    },

    // 1. CREATE the HTML Structure
    renderBuildings() {
        let listHtml = "";
        const r = gameData.resources; // Define 'r' so we don't crash

        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            
            // Calculate initial values so the UI isn't empty on load
            let costs = Economy.getCost(key);
            let time = b.baseTime * Math.pow(b.timeGrowth, b.level);
            // Apply Robotics reduction (if robotics exists)
            let robotLvl = gameData.buildings.robotics?.level || 0;
            time = time * Math.pow(0.99, robotLvl);

            listHtml += `
            <div class="building-card"> 
                <div class="building-info-main">
                    <div class="info-header">
                        <strong class="details-trigger" onclick="UI.showDetails('${key}')">${b.name}</strong> 
                        <span class="lvl-tag">Lvl <span id="lvl-${key}">${b.level}</span></span>
                    </div>
                    
                    <div id="req-${key}"></div>

                    <div class="building-footer">
                        <div id="cost-${key}" class="cost-row">
                             </div>
                        
                        <div class="action-row">
                            <span id="time-${key}" class="build-time">⌛ ${Economy.formatTime(time)}</span>
                            <button id="btn-${key}" onclick="Game.buyBuilding('${key}')">Upgrade</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }
        document.getElementById("building-list").innerHTML = listHtml;
    },

    renderHangar() {
        const container = document.getElementById("tab-hangar");
        if(!container) return; 

        // Clear previous content first
        container.innerHTML = `<h2>Hangar</h2><div id="ship-list" class="list-container"></div>`;
        const listContainer = document.getElementById("ship-list");

        let html = "";
        
        for (let key in gameData.ships) {
            const s = gameData.ships[key];
            const totalCostId = `total-cost-${key}`;
            
            // Calculate Time
            const hangarLvl = gameData.buildings.hangar.level;
            const roboticsLvl = gameData.buildings.robotics?.level || 0;
            // Base time reduced by Robotics (1% per lvl) and Hangar (1% per lvl)
            const timeModifier = Math.pow(0.99, roboticsLvl) * Math.pow(0.99, hangarLvl);
            const timePerUnit = s.baseTime * timeModifier;

            // Requirements Check
            let isLocked = false;
            let reqHtml = "";
            if (s.req) {
                for (let target in s.req) {
                    const requiredLvl = s.req[target];
                    const currentLvl = gameData.buildings[target]?.level || 0;
                    if (currentLvl < requiredLvl) {
                        isLocked = true;
                        reqHtml += `<div class="req-tag">Requires ${gameData.buildings[target].name} Lvl ${requiredLvl}</div>`;
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
                            <span class="lvl-tag">Owned: <span id="count-${key}">${s.count}</span></span>
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
                                    <div id="${totalCostId}" class="total-cost-preview"></div>
                                    <div class="input-group">
                                        <input type="number" id="qty-${key}" value="1" min="1" 
                                               oninput="UI.updateShipCost('${key}')" ${isLocked ? 'disabled' : ''}>
                                        <button onclick="Game.startShipProduction('${key}', document.getElementById('qty-${key}').value)" 
                                            ${isLocked ? 'disabled' : ''}>
                                            ${isLocked ? 'Locked' : 'Build'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
        }

        // Render Queue (if exists)
        if (gameData.shipQueue.length > 0) {
            const activeOrder = gameData.shipQueue[0];
            const s = gameData.ships[activeOrder.key];
            const hangarLvl = gameData.buildings.hangar.level;
            const roboticsLvl = gameData.buildings.robotics?.level || 0;
            const timePerUnit = s.baseTime / (1 + hangarLvl + roboticsLvl);
            const totalBatchTime = timePerUnit * activeOrder.amount;
            const progress = ((totalBatchTime - activeOrder.timeLeft) / totalBatchTime) * 100;

            html += `
                <div class="ship-queue-panel">
                    <h3>Production: ${s.name} (x${activeOrder.amount})</h3>
                    <div class="progress-container">
                        <div class="progress-bar hangar-bar" style="width: ${progress}%"></div>
                    </div>
                    <small>Time: ${Economy.formatTime(activeOrder.timeLeft)}</small>
                </div>`;
        }
        
        listContainer.innerHTML = html;
    },

    renderResearch() {
        let listHtml = "";
        const r = gameData.resources;

        for (let key in gameData.research) {
            let tech = gameData.research[key];
            
            let costs = Economy.getCost(key, 'research'); // *NOTE: You need to update getCost to handle research growth
            let reqStatus = Economy.checkRequirements(key);
            
            // Calculate Time (Lab reduces research time)
            const labLvl = gameData.buildings.lab.level;
            // Time grows with tech level, then is reduced by 1% per Lab level
            const baseTime = tech.baseTime * Math.pow(tech.timeGrowth || 1.2, tech.level);
            const finalTime = baseTime * Math.pow(0.99, labLvl);

            listHtml += `
            <div class="building-card" style="border-left: 3px solid #9900ff;"> 
                <div class="building-info-main">
                    <div class="info-header">
                        <strong style="color: #d48aff">${tech.name}</strong> 
                        <span class="lvl-tag">Lvl ${tech.level}</span>
                    </div>
                    <p style="font-size:0.85em; color:#ccc; margin:5px 0">${tech.desc}</p>
                    
                    ${!reqStatus.met ? `<div style="color:#ff6666; font-size:0.8em">Req: ${reqStatus.missing.join(", ")}</div>` : ''}

                    <div class="building-footer">
                        <div class="cost-row">
                            ${tech.cost.metal > 0 ? UI.getSpan(Math.floor(tech.cost.metal * Math.pow(1.5, tech.level)), r.metal, "🔘") : ''}
                            ${tech.cost.crystal > 0 ? UI.getSpan(Math.floor(tech.cost.crystal * Math.pow(1.5, tech.level)), r.crystal, "💎") : ''}
                            ${tech.cost.deuterium > 0 ? UI.getSpan(Math.floor(tech.cost.deuterium * Math.pow(1.5, tech.level)), r.deuterium, "🧪") : ''}
                        </div>
                        
                        <div class="action-row">
                            <span class="build-time">⌛ ${Economy.formatTime(finalTime)}</span>
                            <button onclick="Game.startResearch('${key}')" 
                                ${(gameData.researchQueue || !reqStatus.met) ? 'disabled' : ''}>
                                Research
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        }
        document.getElementById("research-list").innerHTML = listHtml;
    },

    // 2. REFRESH the Numbers (Called by Game Loop)
    update() {
        let prod = Economy.getProduction();
        let r = gameData.resources;

        // Resource Header
        document.getElementById("metal-display").innerText = Economy.formatNum(r.metal);
        document.getElementById("crystal-display").innerText = Economy.formatNum(r.crystal);
        document.getElementById("deuterium-display").innerText = Economy.formatNum(r.deuterium);
        
        const enDisp = document.getElementById("energy-display");
        if(enDisp) {
            enDisp.innerText = Economy.formatNum(r.energy);
            enDisp.style.color = r.energy < 0 ? "#ff4444" : "#00ff00";
        }
        document.getElementById("max-energy-display").innerText = Economy.formatNum(r.maxEnergy);

        document.getElementById("prod-metal").innerText = `+${Economy.formatNum(prod.metal)}/s`;["metal", "crystal", "deuterium"].forEach(res => {
            const el = document.getElementById(`${res}-hover`);
            if(el) {
                // Calculate hourly production
                let hourly = prod[res] * 3600;
                el.title = `Production: ${Economy.formatNum(hourly)}/hour`;
            }
        }
        // Building Updates
        for (let key in gameData.buildings) {
            let b = gameData.buildings[key];
            // Check if element exists to avoid crash
            if(!document.getElementById(`cost-${key}`)) continue;

            let costs = Economy.getCost(key);
            let reqStatus = Economy.checkRequirements(key); 
            
            // Requirements
            let reqHtml = "";
            if (!reqStatus.met) {
                reqHtml = `<small style="color:#ff6666">Req: ${reqStatus.missing.join(", ")}</small>`;
            }
            document.getElementById(`req-${key}`).innerHTML = reqHtml;
            document.getElementById(`lvl-${key}`).innerText = b.level;
            
            // Cost & Energy Logic
            let costHtml = this.getSpan(costs.metal, r.metal, icons.metal);
            if (costs.crystal > 0) costHtml += " " + this.getSpan(costs.crystal, r.crystal, icons.crystal);
            if (costs.deuterium > 0) costHtml += " " + this.getSpan(costs.deuterium, r.deuterium, icons.deuterium);
            
            // Energy Delta Calculation
            if (b.energyWeight !== 0) {
                let currentUsage = b.level * Math.floor(Math.abs(b.energyWeight) * b.level * Math.pow(1.1, b.level));
                let nextLvl = b.level + 1;
                let nextUsage = nextLvl * Math.floor(Math.abs(b.energyWeight) * nextLvl * Math.pow(1.1, nextLvl));
                let delta = nextUsage - currentUsage;

                if (b.energyWeight > 0) {
                    // Consumer (Mine): Check if this upgrade bankrupts energy
                    let willBankrupt = (r.energy - delta) < 0;
                    let color = willBankrupt ? "#ff4444" : "#ffaa00"; 
                    costHtml += ` <span style="color:${color}">⚡-${delta}</span>`;
                } else {
                    // Producer (Solar)
                    costHtml += ` <span style="color:#00ff00">⚡+${delta}</span>`;
                }
            }
            document.getElementById(`cost-${key}`).innerHTML = costHtml;

            // Time Update
            let standardTime = b.baseTime * Math.pow(b.timeGrowth, b.level);
            let robotLvl = gameData.buildings.robotics?.level || 0;
            let finalTime = standardTime * Math.pow(0.99, robotLvl);
            
            // Only update time if the element is empty (optimization)
            const timeEl = document.getElementById(`time-${key}`);
            if(timeEl) timeEl.innerHTML = `⌛ ${Economy.formatTime(finalTime)}`;

            // Button State
            let btn = document.getElementById(`btn-${key}`);
            if(btn) {
                btn.disabled = gameData.construction.buildingKey !== null || 
                               r.metal < costs.metal || 
                               r.crystal < (costs.crystal || 0) || 
                               r.deuterium < (costs.deuterium || 0) || 
                               !reqStatus.met; 
                btn.innerText = reqStatus.met ? "Upgrade" : "Locked";
            }
        }

        // Construction Panel
        let panel = document.getElementById("construction-status");
        if (gameData.construction.buildingKey) {
            panel.style.display = "block";
            let c = gameData.construction;
            document.getElementById("build-name").innerText = gameData.buildings[c.buildingKey].name;
            document.getElementById("build-time").innerText = Economy.formatTime(c.timeLeft);
            document.getElementById("build-progress-bar").style.width = ((c.totalTime - c.timeLeft) / c.totalTime * 100) + "%";
        } else {
            panel.style.display = "none";
        }
    },

    showTab(tabName) {
        gameData.currentTab = tabName;
        document.querySelectorAll('.game-tab').forEach(tab => {
            // FIX: Ensure we target the top-level sections only
            if(tab.parentElement.tagName === "MAIN") {
                tab.style.display = tab.id === `tab-${tabName}` ? 'block' : 'none';
            }
        });
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.getElementById(`btn-tab-${tabName}`);
        if (activeBtn) activeBtn.classList.add('active');
        
        if(tabName === 'hangar') this.renderHangar();
        // Save whenever we switch tabs
        if(typeof SaveSystem !== 'undefined') SaveSystem.save();
    },

    showDetails(key) {
        const b = gameData.buildings[key];
        document.getElementById("details-name").innerText = b.name;
        document.getElementById("details-desc").innerText = b.desc;

        let projectionHtml = `
            <table class="projection-table">
                <thead>
                    <tr><th>Lvl</th><th>Costs</th><th>Energy</th><th>Benefit</th></tr>
                </thead>
                <tbody>`;

        for (let i = 1; i <= 5; i++) {
            let nextLvl = b.level + i;
            let prevLvl = nextLvl - 1; 

            // Costs
            let m = Math.floor(b.cost.metal * Math.pow(b.growth, nextLvl));
            let c = Math.floor(b.cost.crystal * Math.pow(b.growth, nextLvl));
            let d = Math.floor(b.cost.deuterium * Math.pow(b.growth, nextLvl));

            // Energy Delta
            let eWeight = b.energyWeight;
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
                const map = { mine: 'metal', crystal: 'crystal', deuterium: 'deuterium' };
                const res = map[key];
                if (res) {
                    let amount = b.baseProd * nextLvl;
                    // If energy is low, maybe show (Low Power) text? For now, raw potential:
                    benefit = `+${Economy.formatNum(amount)} ${prodIcons[res]}`;
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
    },

    getSpan(needed, has, icon) {
        return `<span style="color: ${has >= needed ? '#00ff00' : '#ff4444'}">${Economy.formatNum(needed)}${icon}</span>`;
    },

    // Include the ship cost updater in UI
    updateShipCost(key) {
        const s = gameData.ships[key];
        const qtyInput = document.getElementById(`qty-${key}`);
        if(!qtyInput) return;
        
        const qty = parseInt(qtyInput.value) || 0;
        const costDisplay = document.getElementById(`total-cost-${key}`);
        
        if (!costDisplay) return;

        let html = "";
        const resources = ["metal", "crystal", "deuterium"];
        const icons = { metal: "🔘", crystal: "💎", deuterium: "🧪" };

        resources.forEach(res => {
            if (s.cost[res] > 0) {
                const total = s.cost[res] * qty;
                const hasEnough = gameData.resources[res] >= total;
                const color = hasEnough ? "#eee" : "#ff4444";
                html += `<span style="color: ${color}; margin-right: 10px;">
                            ${icons[res]}${Economy.formatNum(total)}
                         </span>`;
            }
        });
        costDisplay.innerHTML = html;
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
           // Base time reduced by Robotics (1% per lvl) and Hangar (1% per lvl)
            const timeModifier = Math.pow(0.99, roboticsLvl) * Math.pow(0.99, hangarLvl);
            const timePerUnit = s.baseTime * timeModifier;

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

    updateShipCost(key) {
        const s = gameData.ships[key];
        const qty = parseInt(document.getElementById(`qty-${key}`).value) || 0;
        const costDisplay = document.getElementById(`total-cost-${key}`);
        
        if (!costDisplay) return;

        let html = "";
        const resources = ["metal", "crystal", "deuterium"];
        const icons = { metal: "🔘", crystal: "💎", deuterium: "🧪" };

        resources.forEach(res => {
            if (s.cost[res] > 0) {
                const total = s.cost[res] * qty;
                const hasEnough = gameData.resources[res] >= total;
                const color = hasEnough ? "#eee" : "#ff4444";
                html += `<span style="color: ${color}; margin-right: 10px;">
                            ${icons[res]}${Economy.formatNum(total)}
                        </span>`;
            }
        });

        costDisplay.innerHTML = html;
    },

    startResearch(key) {
        // 1. Check if something is already researching
        if (gameData.researchQueue.researchKey !== null) return;

        const tech = gameData.research[key];
        const costs = Economy.getCost(key, 'research');

        // 2. Resource check
        if (gameData.resources.metal < costs.metal || 
            gameData.resources.crystal < costs.crystal || 
            gameData.resources.deuterium < costs.deuterium) {
            return;
        }

        // 3. Deduct resources
        gameData.resources.metal -= costs.metal;
        gameData.resources.crystal -= costs.crystal;
        gameData.resources.deuterium -= costs.deuterium;

        // 4. Calculate Time: BaseTime * (Growth ^ Level) / (1 + LabLevel)
        const labLvl = gameData.buildings.lab.level;
        // Time grows with tech level, then is reduced by 1% per Lab level
        const baseTime = tech.baseTime * Math.pow(tech.timeGrowth || 1.2, tech.level);
        const finalTime = baseTime * Math.pow(0.99, labLvl);

        // 5. Set the Queue
        gameData.researchQueue = {
            researchKey: key,
            timeLeft: finalTime,
            totalTime: finalTime
        };

        UI.renderResearch();
        UI.update();
    },

    cancelResearch() {
        // Refund logic here
        gameData.researchQueue = null;
        UI.update();
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
    Game.updateShipQueue(dt);

    // 3. Handle Production
    let prod = Economy.getProduction();
    gameData.resources.metal += prod.metal * dt;
    gameData.resources.crystal += prod.crystal * dt;
    gameData.resources.deuterium += prod.deuterium * dt;

    // 4. Handle Research
    if (gameData.researchQueue) {
        let rq = gameData.researchQueue;
        rq.timeLeft -= dt;
        
        // Update UI Panel
        const resPanel = document.getElementById("research-status");
        if(resPanel) {
            const techName = gameData.research[rq.researchKey].name; 
            
            resPanel.style.display = "block";
            document.getElementById("res-name").innerText = techName;
            document.getElementById("res-time").innerText = Math.ceil(rq.timeLeft);
            document.getElementById("res-progress-bar").style.width = ((rq.totalTime - rq.timeLeft) / rq.totalTime * 100) + "%";
        }

        if (rq.timeLeft <= 0) {
            // FIX: Use rq.researchKey
            gameData.research[rq.researchKey].level++; 
            gameData.researchQueue = null;
            if(resPanel) resPanel.style.display = "none";
            UI.renderResearch(); 
            UI.renderBuildings(); 
            UI.renderHangar();    
            // Update Tech Tree if we are on that tab
            if(gameData.currentTab === 'tech') UI.renderTechTree();
        }
    }

    gameData.lastTick = now;
    UI.update();
}, 100);

window.gameData = gameData;
window.UI = UI;
window.Game = Game;
window.Economy = Economy;