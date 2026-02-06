import '../style.css';
import { gameData, icons, resetGameData} from './gameData.js';
import { Economy } from './economy.js';
import { auth, database, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, update, ref, set, get, child } from './firebase.js';
import planetNames from './data/names.json';
import { GalaxySystem } from './GalaxySystem.js';
import { BotSystem, BotAI } from './BotSystem.js';
import { UI } from './UI.js';
import { Fleet } from './fleet.js';
import { FleetUI} from './FleetUI.js';
import { SaveSystem } from './SaveSystem.js';

// --- AUTHENTICATION SYSTEM ---
let currentUser = null;
let isCloudEnabled = false;

export const AuthSystem = {
    init() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await SaveSystem.load();
            currentUser = user;
            UI.updateUser(user); 
            isCloudEnabled = true;
            UI.init();

            document.getElementById('logout-btn').style.display = 'inline-block';
            document.getElementById('cloud-sync-btn').style.display = 'inline-block';
            document.getElementById('auth-modal').style.display = 'none';
            
            // Check if user has a name. If not, force the modal open.
            if (!user.displayName) {
                document.getElementById('auth-modal').style.display = 'flex';
                document.getElementById('auth-title').innerText = "Complete Registration";
                document.getElementById('auth-submit').innerText = "Set Name";
                // Hide email/password, show name only
                document.getElementById('auth-email').style.display = 'none';
                document.getElementById('auth-password').style.display = 'none';
                document.getElementById('auth-name').style.display = 'block';
                document.getElementById('auth-toggle').style.display = 'none';
                document.getElementById('guest-btn').style.display = 'none';
                
                return;

            } else {
                this.loadFromCloud();
            }
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
    
    async signup(email, password, name) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });

        // Generate planet data for new players
        const planet = PlanetGenerator.generate();
        gameData.planetName = planet.name;
        gameData.coordinates = planet.coords;

        return userCredential;
    },
    
    logout() {
        resetGameData();
        localStorage.removeItem("spaceColonySave");
        return signOut(auth);
    },
    
    async saveToCloud(isAutoSave = true) {
        if (!auth.currentUser) return;
        
        try {
            const updates = {};
            const galaxyKey = gameData.coordinates.replace(/[\[\]]/g, '').replace(':', '_');

            updates[`users/${auth.currentUser.uid}/save`] = JSON.stringify(SaveSystem.getLeanSaveState());
            updates[`galaxy/${galaxyKey}`] = {
                owner: auth.currentUser.displayName || "Commander",
                score: Math.floor(gameData.score || 0),
                planetName: gameData.planetName,
                coords: gameData.coordinates,
                uid: auth.currentUser.uid,
                lastActive: Date.now()
            };

            await update(ref(database), updates);
            
            // Only show UI feedback if NOT an autosave
            if (!isAutoSave) {
                UI.showNotification("Empire Synced");
            }
        } catch (err) {
            console.error("Save Error:", err);
            if (!isAutoSave) UI.showNotification("Sync Failed", "error");
        }
    },
    
    async loadFromCloud() {
        if (!auth.currentUser) return false;
        try {
            const snapshot = await get(child(ref(database), `users/${auth.currentUser.uid}/save`));
            if (snapshot.exists()) {
                const saved = snapshot.val();

                // 1. SMART MERGE
                const recursiveMerge = (current, save) => {
                    if (!current) return;
                    for (let key in save) {
                        if (Object.prototype.hasOwnProperty.call(current, key)) {
                            const val = save[key];
                            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                                if (!current[key]) current[key] = {};
                                recursiveMerge(current[key], val);
                            } else {
                                current[key] = val;
                            }
                        }
                    }
                };
                recursiveMerge(gameData, saved);

                // Detect if coordinates are missing OR look like the old IPv4 format (contain 3 colons)
                const isObsolete = !gameData.coordinates || (gameData.coordinates.match(/:/g) || []).length > 1;
                
                if (isObsolete) {
                    //console.log("Detected obsolete coordinates. Re-assigning to new Galaxy Grid...");
                    
                    // 1. Assign new valid [System:Planet]
                    const newCoords = await GalaxySystem.assignHomePlanet(auth.currentUser, gameData.planetName || "Colony");
                    
                    // 2. Update local state
                    gameData.coordinates = newCoords;
                    
                    // 3. Force save immediately to lock it in
                    await this.saveToCloud(); 
                    //console.log("Migration successful. New Coords:", newCoords);
                }
                // -------------------------------------

                // 2. RETROACTIVE PLANET CHECK (Keep this for safety)
                if (!gameData.planetName) {
                    gameData.planetName = "Colony";
                }

                // 3. IDLE PROGRESS
                if (saved.lastTick) {
                    const elapsedSeconds = (Date.now() - saved.lastTick) / 1000;
                    Economy.updateResources(elapsedSeconds);
                }

                // 4. UPDATE UI
                Economy.updateEnergy();
                UI.renderOverview();
                UI.renderBuildings();
                UI.update();

                // Init the Galaxy UI with the new system
                GalaxyUI.init(); 

                return true;
            }
        } catch (err) {
            console.error('Cloud load failed:', err);
            UI.showNotification("Sync Error: " + err.message, "error");
        }
        return false;
    },

    async updateName(name) {
        if (!auth.currentUser) throw new Error("No user");

        // 1. Check Uniqueness
        const isFree = await GalaxySystem.isNameAvailable(name);
        if (!isFree) {
            alert("Commander name already taken! Please choose another.");
            throw new Error("Name taken");
        }

        // 2. Reserve Name
        const reserved = await GalaxySystem.reserveName(name, auth.currentUser.uid);
        if (!reserved) throw new Error("Name claimed by another user just now.");

        // 3. Update Profile (Standard Firebase)
        await updateProfile(auth.currentUser, { displayName: name });
        
        // 4. Assign Coordinates (The "Galaxy" Step)
        // We only do this if they don't have coords yet
        // Note: You might need to temporarily load gameData to check if coords exist
        const newCoords = await GalaxySystem.assignHomePlanet(auth.currentUser, "Colony");
        
        // 5. Update Local State (Crucial so they see it immediately)
        gameData.coordinates = newCoords;
        gameData.planetName = "Colony"; // Or let them pick
        
        // 6. Save everything
        await this.loadFromCloud(); 
    },
};

const PlanetGenerator = {    
    generate() {
        const p = planetNames.prefixes;
        const s = planetNames.suffixes;

        const name = `${p[Math.floor(Math.random() * p.length)]} ${s[Math.floor(Math.random() * s.length)]}`;
        // IPv4 style: 0-255 for four segments
        const coords = Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join(':');
        return { name, coords };
    }
};

export const GalaxyUI = {
    currentSystem: 1,

    init() {
        // ONLY set the default system ONCE when the app loads
        if (gameData.coordinates) {
            // New Format Expectation: "[System:Planet]" e.g., "[12:4]"
            const parts = gameData.coordinates.replace(/[\[\]]/g, '').split(':');
            this.currentSystem = parseInt(parts[0]) || 1;
        }
    },

    changeSystem(dir) {
        this.currentSystem += dir;
        // Clamp between System 1 and 100
        if (this.currentSystem < 1) this.currentSystem = 100;
        if (this.currentSystem > 100) this.currentSystem = 1;
        
        this.render();
    },

    resetToHome() {
        // Reset currentSystem to home galaxy
        if (gameData.coordinates) {
            const parts = gameData.coordinates.replace(/[\[\]]/g, '').split(':');
            this.currentSystem = parseInt(parts[0]) || 1;
        }
    },

    async render() {
        const grid = document.getElementById('galaxy-grid');
        const title = document.getElementById('galaxy-system-title');
        
        // Update Title immediately
        title.innerText = `System ${this.currentSystem}`;
        grid.innerHTML = '<div class="loading">Scanning Sector...</div>';

        try {
            // We fetch the entire galaxy node (okay for small dataset, bad for huge ones)
            // Ideally, query: ref.orderByChild('sys').equalTo(this.currentSystem)
            const snapshot = await get(child(ref(database), `galaxy`));
            const allPlanets = snapshot.val() || {};
            
            grid.innerHTML = '';

            for (let i = 1; i <= 15; i++) {
                const coordKey = `${this.currentSystem}_${i}`;
                const planetData = allPlanets[coordKey];
                
                const cell = document.createElement('div');
                cell.className = 'galaxy-planet';
                
                // Add Coordinate Label
                const coordLabel = document.createElement('span');
                coordLabel.className = 'planet-coord';
                coordLabel.innerText = i;
                cell.appendChild(coordLabel);

                if (planetData) {
                    // --- OCCUPIED SLOT ---
                    cell.classList.add('occupied');
                    
                    // Highlight if it's ME
                    if (planetData.uid === auth.currentUser?.uid) {
                        cell.classList.add('is-me');
                    }

                    cell.innerHTML += `
                        <div class="planet-icon">🪐</div>
                        <div class="player-name">${planetData.owner}</div>
                        <div class="player-score">Score: ${Math.floor(planetData.score)}</div>
                    `;

                    // Highlight if it's a bot
                    if (planetData.isBot) {
                        cell.classList.add('is-bot');
                        cell.innerHTML += `<div class="bot-tag">[AI: ${planetData.archetype}]</div>`;
                    }
                    
                    // Click Event (Spy/Attack later)
                    cell.onclick = () => {
                        //console.log("Selected Planet:", planetData);
                        //alert(`Selected: ${planetData.planetName} ${planetData.coords}\nPlayer: ${planetData.owner}`);
                        FleetUI.openDispatch(planetData.coords);
                    };

                } else {
                    // --- EMPTY SLOT ---
                    cell.classList.add('empty');
                    cell.innerHTML += `
                        <div class="planet-icon" style="opacity:0.2">○</div>
                        <div class="player-name" style="color:#666">Deep Space</div>
                    `;
                }

                grid.appendChild(cell);
            }

        } catch (error) {
            console.error("Galaxy Load Error:", error);
            grid.innerHTML = 'Error loading galaxy chart.';
        }
    }
};

// Expose to window for HTML buttons
window.GalaxyUI = GalaxyUI;

window.Game = {
    build(key) {
        // 1. Safety check
        if (!gameData.construction) {
            gameData.construction = { buildingKey: null, timeLeft: 0, totalTime: 0 };
        }

        // 2. Busy check
        if (gameData.construction.buildingKey) {
            UI.showNotification("Construction site is busy! Wait for the current building to finish.");
            return;
        }
        
        // 3. Prevent lab upgrade during research
        if (key === 'lab' && gameData.researchQueue.length > 0) {
            UI.showNotification("Cannot upgrade Research Lab while research is in progress!");
            return;
        }
        
        // 4. Prevent hangar upgrade during ship production
        if (key === 'hangar' && gameData.shipQueue.length > 0) {
            UI.showNotification("Cannot upgrade Hangar while ships are being built!");
            return;
        }

        const costs = Economy.getCost(key, 'building');
        
        // 3. Use checkResources instead of getCost
        if (!Economy.checkResources(costs)) {
            UI.showNotification("More resources are needed to initiate this expansion.");
            return;
        }

        // 4. Action Phase
        Economy.deductResources(costs);

        const time = Economy.getBuildTime(key, 'building');
        
        gameData.construction.buildingKey = key;
        gameData.construction.timeLeft = time;
        gameData.construction.totalTime = time;

        SaveSystem.save(); 
        UI.renderBuildings();
    },

    startResearch(key) {
        const status = Economy.canQueue('research');
        if (!status.can) {
            UI.showNotification(status.reason);
            return;
        }
        
        // Prevent duplicate research in queue
        const alreadyQueued = gameData.researchQueue.some(item => item.key === key);
        if (alreadyQueued) {
            UI.showNotification("This research is already in the queue!");
            return;
        }

        const cost = Economy.getCost(key, 'research');

        // Use checkResources and invert logic (if !check return)
        if (!Economy.checkResources(cost)) {
            UI.showNotification("Not enough resources for research!");
            return;
        }
            
        Economy.deductResources(cost);
        
        const adjustedTime = Economy.getBuildTime(key, 'research');
        
        gameData.researchQueue.push({
            key: key,
            timeLeft: adjustedTime,
            totalTime: adjustedTime
        });
        SaveSystem.save();
        UI.renderResearch();
    },

    buildShip(key) {
        // Check Queue Availability
        const status = Economy.canQueue('ship');
        if (!status.can) {
            UI.showNotification(status.reason);
            return;
        }

        const qty = parseInt(document.getElementById(`amt-${key}`).value);
        const cost = Economy.getCost(key, 'ship');
        const totalCost = { metal: cost.metal * qty, crystal: cost.crystal * qty, deuterium: cost.deuterium * qty };

        if (!Economy.checkResources(totalCost)) {
            UI.showNotification("Not enough resources!", "error");
            return;
        }

        // Deduct Resources
        Economy.deductResources(totalCost);

        const unitTime = Economy.getBuildTime(key, 'ship');
        gameData.shipQueue.push({
            key: key,
            amount: qty,
            initialAmount: qty,
            unitTime: unitTime,
            totalTime: unitTime * qty,
            timeLeft: unitTime * qty
        });

        SaveSystem.save();
        UI.renderHangar();
    },

    cancelConstruction() {
        // 1. Check if there is anything to cancel
        if (!gameData.construction || !gameData.construction.buildingKey) return;

        // 2. Ask for confirmation
        if (!confirm("Cancel construction? You will only be refunded 50% of the resources.")) {
            return;
        }

        const key = gameData.construction.buildingKey;
        
        // 3. Calculate Refund (50% of the original cost)
        // getCost returns the cost of the *current* level attempt, which is what we paid.
        const cost = Economy.getCost(key, 'building');
        const refund = {
            metal: Math.floor(cost.metal * 0.5),
            crystal: Math.floor(cost.crystal * 0.5),
            deuterium: Math.floor(cost.deuterium * 0.5)
        };

        // 4. Refund Resources
        gameData.resources.metal += refund.metal;
        gameData.resources.crystal += refund.crystal;
        gameData.resources.deuterium += refund.deuterium;

        // 5. Reset Data
        gameData.construction.buildingKey = null;
        gameData.construction.timeLeft = 0;
        gameData.construction.totalTime = 0;

        // 6. UI Updates
        document.getElementById("construction-status").style.display = "none";
        
        alert(`Construction canceled. Refunded: ${Economy.formatNum(refund.metal)} Metal, ${Economy.formatNum(refund.crystal)} Crystal and ${Economy.formatNum(refund.deuterium)} Deuterium.`);
        SaveSystem.save();
        UI.renderBuildings(); // Refresh UI to show resources back
    },

    cancelResearch() {
        // 1. Check if queue is empty
        if (!gameData.researchQueue || gameData.researchQueue.length === 0) return;

        // 2. Ask for confirmation
        if (!confirm("Cancel current research? You will only be refunded 50% of the resources.")) {
            return;
        }

        // Get the active research (usually index 0)
        const activeResearch = gameData.researchQueue[0];
        const key = activeResearch.key;

        // 3. Calculate Refund
        const cost = Economy.getCost(key, 'research');
        const refund = {
            metal: Math.floor(cost.metal * 0.5),
            crystal: Math.floor(cost.crystal * 0.5),
            deuterium: Math.floor(cost.deuterium * 0.5)
        };

        // 4. Refund Resources
        gameData.resources.metal += refund.metal;
        gameData.resources.crystal += refund.crystal;
        gameData.resources.deuterium += refund.deuterium;

        // 5. Remove from queue (Shift removes the first element)
        gameData.researchQueue.shift(); 

        // 6. UI Updates
        if (gameData.researchQueue.length === 0) {
            document.getElementById("research-status").style.display = "none";
        }

        alert(`Research canceled. Refunded: ${Economy.formatNum(refund.metal)} Metal, ${Economy.formatNum(refund.crystal)} Crystal and ${Economy.formatNum(refund.deuterium)} Deuterium.`);
        SaveSystem.save();
        UI.renderResearch();
    },
    downloadSave: SaveSystem.downloadSave,
    cloudSync() { AuthSystem.saveToCloud(false);},
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
    if (gameData.construction?.buildingKey) {
        gameData.construction.timeLeft -= delta;
        if (gameData.construction.timeLeft <= 0) {
            const key = gameData.construction.buildingKey;
            gameData.buildings[key].level++;
            gameData.construction = { buildingKey: null, timeLeft: 0, totalTime: 0 };
            SaveSystem.save(); 
            if (isCloudEnabled) AuthSystem.saveToCloud();
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
            SaveSystem.save(); 
            if (isCloudEnabled) AuthSystem.saveToCloud();
            UI.renderResearch();
        }
    }

    // 4. Process Ship Queue
    if (gameData.shipQueue.length > 0) {
        const batch = gameData.shipQueue[0];
        batch.timeLeft -= delta;

        // Calculate how many ships SHOULD be finished by now
        const totalElapsed = batch.totalTime - batch.timeLeft;
        const shipsThatShouldBeDone = Math.floor(totalElapsed / batch.unitTime);
        const shipsAlreadyFinished = batch.initialAmount - batch.amount;

        const newShips = shipsThatShouldBeDone - shipsAlreadyFinished;

        if (newShips > 0) {
            const shipsToAdd = Math.min(newShips, batch.amount);
            gameData.ships[batch.key].count += shipsToAdd;
            gameData.ships[batch.key].available = (gameData.ships[batch.key].available || 0) + shipsToAdd;
            batch.amount -= shipsToAdd;
            
            // Refresh Hangar UI so "Owned" count updates
            UI.renderHangar();
        }

        if (batch.amount <= 0 || batch.timeLeft <= 0) {
            gameData.shipQueue.shift();
            SaveSystem.save();
        }
    }

    // 5. Update Fleet Queue
    if (gameData.fleets.length > 0) {
        Fleet.update(delta); // Logic to reduce time
        FleetUI.updateMissionUI(); // UI to move the bar
    }

    UI.update();
    if (Math.random() < 0.01) SaveSystem.save(); 
}

window.UI = UI;
window.onload = async () => {
    await Promise.resolve(); // Ensures modules are fully loaded before init
    AuthSystem.init();
    await SaveSystem.load();
    UI.init();
    // 1. High-Frequency Tick (Resources & UI)
    // Runs at 10fps for smooth progress bars
    setInterval(() => {
        tick(); // Resource accumulation
        
        // Only refresh the Fleet UI if the player is looking at it
        if (gameData.currentTab === 'fleet') {
            FleetUI.updateMissionUI(); 
        }
    }, 100);

    // 2. Medium-Frequency Tick (Fleet Logic & Cloud)
    // Runs every 1s. This is plenty for arrival calculations.
    setInterval(() => {
        Fleet.processFleetArrivals();
        UI.updateMessageBadge();

        // Cloud autosave: ~once every 20 seconds on average
        if (isCloudEnabled && Math.random() < 0.05) {
            AuthSystem.saveToCloud();
        }
    }, 1000);
    
    // Auth form handler
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Get Form Values
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const name = document.getElementById('auth-name').value; // Ensure this input exists!
            
            const errorEl = document.getElementById('auth-error');
            const title = document.getElementById('auth-title').innerText; // We check this text
            
            try {
                if (title === 'Login') {
                    // CASE 1: Normal Login
                    await AuthSystem.login(email, password);
                    
                } else if (title === 'Complete Registration') {
                    // CASE 2: The "Set Name" Fix (For your nameless users)
                    if (!name || name.trim() === "") throw new Error("Commander name is required");
                    await AuthSystem.updateName(name);
                    
                } else {
                    // CASE 3: New Account Signup
                    await AuthSystem.signup(email, password, name);
                }
                
                errorEl.style.display = 'none';
            } catch (err) {
                console.error(err);
                errorEl.innerText = err.message;
                errorEl.style.display = 'block';
            }
        });
    }
}

async function spyOnTarget(targetUid) {
    // 1. Fetch the raw data from Firebase
    const snapshot = await get(ref(database, `users/${targetUid}/save`));
    let targetData = JSON.parse(snapshot.val());

    // 2. Check if it's a bot
    if (targetUid.startsWith('bot_')) {
        console.log("Target is AI. Running simulation...");
        
        // 3. Update the local copy of the data
        targetData = BotAI.simulateEconomy(targetData);
        
        // 4. (Optional) Save the updated state back to Firebase 
        // Only do this if you want the update to persist for other players too.
        // Requires write permission on the bot node.
        /* const updates = {};
        updates[`users/${targetUid}/save`] = JSON.stringify(targetData);
        update(ref(database), updates);
        */
    }

    // 5. Show the Spy Report with the FRESH resources
    UI.showSpyReport(targetData);
}

// Helper to check max slots
export const getMaxMissions = (commandCenterLvl) => {
    return 1 + commandCenterLvl; // Lvl 1 = 2 missions, etc.
};

function openFleetDispatch(coords) {
    const targetDisplay = document.getElementById('target-coords-display');
    const distDisplay = document.getElementById('dist-val');
    const fuelDisplay = document.getElementById('fuel-val');
    const timeDisplay = document.getElementById('time-val');
    
    const distance = Fleet.calculateDistance(gameData.coordinates, coords);
    const shipDef = gameData.ships.spycraft;
    const travelTime = Fleet.calculateFlightTime(distance, shipDef.stats.speed);
    const fuelCost = Fleet.calculateFuelConsumption(distance, { spycraft: 1 });

    targetDisplay.innerText = coords;
    distDisplay.innerText = Math.floor(distance);
    fuelDisplay.innerText = fuelCost;
    timeDisplay.innerText = travelTime + "s";
    
    document.getElementById('fleet-dispatch-overlay').style.display = 'flex';
    // Save target for the actual send button
    window.currentTargetCoords = coords;
}

async function sendSpyMission() {
    const count = parseInt(document.getElementById('probe-input').value);
    const success = await Fleet.startMission('spy', window.currentTargetCoords, { spycraft: count });
    
    if (success) {
        closeDispatch();
        UI.showNotification("Probes Dispatched!");
    }
}