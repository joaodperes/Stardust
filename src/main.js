import '../style.css';
import { gameData, icons, resetGameData} from './gameData.js';
import { Economy } from './economy.js';
import { auth, database, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, update, ref, set, get, child } from './firebase.js';
import planetNames from './data/names.json';
import { GalaxySystem } from './GalaxySystem.js';
import { BotSystem, BotAI } from './BotSystem';

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
        // Note: You mightmay need to temporarily load gameData to check if coords exist
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

const GalaxyUI = {
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
        // Clamp between System 1 and 50
        if (this.currentSystem < 1) this.currentSystem = 50;
        if (this.currentSystem > 50) this.currentSystem = 1;
        
        this.render();
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
                        alert(`Selected: ${planetData.planetName} ${planetData.coords}\nPlayer: ${planetData.owner}`);
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

// --- SAVE/LOAD SYSTEM ---
const SaveSystem = {
    getLeanSaveState() {
        // 1. Resources: Save just the values
        const resources = { ...gameData.resources };

        // 2. Buildings: Save ONLY levels
        const buildings = {};
        for (let key in gameData.buildings) {
            buildings[key] = { level: gameData.buildings[key].level };
        }

        // 3. Research: Save ONLY levels
        const research = {};
        for (let key in gameData.research) {
            research[key] = { level: gameData.research[key].level };
        }

        // 4. Ships: Save ONLY counts
        const ships = {};
        for (let key in gameData.ships) {
            ships[key] = { count: gameData.ships[key].count };
        }

        // 5. Return the clean object
        return {
            planetName: gameData.planetName,
            coordinates: gameData.coordinates,
            resources: resources,
            score: gameData.score,
            buildings: buildings,
            research: research,
            ships: ships,
            // Queues contain timestamps and keys, so they are effectively pure state already
            construction: gameData.construction, 
            researchQueue: gameData.researchQueue,
            shipQueue: gameData.shipQueue,
            lastTick: Date.now()
        };
    },
    save() {
        const cleanState = this.getLeanSaveState();
        localStorage.setItem("spaceColonySave", JSON.stringify(cleanState));
        //console.log("Game saved (State only)");
    },
    load() {
        const savedString = localStorage.getItem("spaceColonySave");
        if (!savedString) return;

        try {
            const saved = JSON.parse(savedString);

            // --- STEP 1: SANITIZATION (Fixes the NaN bug) ---
            // Recursively walk through the SAVE data. If we find NaN, force it to 0.
            const sanitize = (obj) => {
                for (let key in obj) {
                    if (typeof obj[key] === 'number' && isNaN(obj[key])) {
                        console.warn(`Fixed corrupted value at ${key}`);
                        obj[key] = 0;
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        sanitize(obj[key]);
                    }
                }
            };
            sanitize(saved);

            // --- STEP 2: SMART MERGE (The Future-Proof Logic) ---
            // We iterate through the SAVE data and apply it to our LIVE gameData.
            // If the live code has a new field (e.g. 'maxCap') that the save doesn't,
            // we skip it, preserving the default value from gameData.js.
            const recursiveMerge = (current, save) => {
                for (let key in save) {
                    // Only merge if the key actually exists in our current game version
                    if (current.hasOwnProperty(key)) {
                        const val = save[key];
                        // If it's a nested object (and not an array), dive deeper
                        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                            recursiveMerge(current[key], val);
                        } else {
                            // It's a value (number/string/array) -> Copy it
                            current[key] = val;
                        }
                    }
                }
            };

            // Apply the saved values onto the fresh gameData object
            recursiveMerge(gameData, saved);

            // 3. IDLE PRODUCTION CATCH-UP
            const now = Date.now();
            const elapsedSeconds = (now - (gameData.lastTick || now)) / 1000;

            if (elapsedSeconds > 0) {
                // Use the safe Economy method which now handles Storage Caps
                Economy.updateResources(elapsedSeconds);

                // Building construction catch-up (Single Item)
                if (gameData.construction && gameData.construction.buildingKey) {
                    gameData.construction.timeLeft -= elapsedSeconds;
                    if (gameData.construction.timeLeft <= 0) {
                        const b = gameData.buildings[gameData.construction.buildingKey];
                        if (b) b.level++;
                        gameData.construction = { buildingKey: null, timeLeft: 0, totalTime: 0 };
                    }
                }

                // Research Queue catch-up (Multi-Queue)
                let resTime = elapsedSeconds;
                while (resTime > 0 && gameData.researchQueue.length > 0) {
                    let active = gameData.researchQueue[0];
                    if (resTime >= active.timeLeft) {
                        resTime -= active.timeLeft;
                        gameData.research[active.key].level++;
                        gameData.researchQueue.shift();
                    } else {
                        active.timeLeft -= resTime;
                        resTime = 0;
                    }
                }

                // Ship production catch-up (Batch processing)
                let shipTime = elapsedSeconds;
                while (shipTime > 0 && gameData.shipQueue.length > 0) {
                    let q = gameData.shipQueue[0];
                    if (shipTime >= q.timeLeft) {
                        shipTime -= q.timeLeft;
                        gameData.ships[q.key].count++;
                        q.amount--;
                        if (q.amount > 0) {
                            q.timeLeft = q.unitTime; // Reset for next ship in batch
                        } else {
                            gameData.shipQueue.shift(); // Batch done
                        }
                    } else {
                        q.timeLeft -= shipTime;
                        shipTime = 0;
                    }
                }

                Economy.updateEnergy();
            }
            UI.update();
            //console.log("Save loaded and sanitized successfully.");

        } catch (e) {
            console.error("Save file corrupted, starting fresh.", e);
        }
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
        AuthSystem.saveToCloud(false).then(success => {
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
        GalaxyUI.render();
        this.update(); 
        this.showTab(gameData.currentTab || 'overview');
    },

    toggleAuthMode() {
        const form = document.getElementById('auth-form');
        const title = document.getElementById('auth-title');
        const submit = document.getElementById('auth-submit');
        const toggle = document.getElementById('auth-toggle');
        const nameField = document.getElementById('auth-name'); // Added this
        
        if (title.innerText === 'Login') {
            title.innerText = 'Create Account';
            submit.innerText = 'Sign Up';
            toggle.innerText = 'Back to Login';
            nameField.style.display = 'block'; // Show name on signup
        } else {
            title.innerText = 'Login';
            submit.innerText = 'Login';
            toggle.innerText = 'Create Account';
            nameField.style.display = 'none'; // Hide name on login
        }
    },
    handleAuthSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name').value; // Get name
        
        // Check if we are in "Signup" mode 
        const isSignup = document.getElementById('auth-submit').innerText === "Create Account";

        if (isSignup) {
            if(!name) return alert("Please enter a Commander Name");
            AuthSystem.signup(email, password, name).then(() => {
                // Success logic
            }).catch(err => alert(err.message));
        } else {
            AuthSystem.login(email, password).catch(err => alert(err.message));
        }
    },

    playAsGuest() {
        resetGameData();
        localStorage.removeItem("spaceColonySave");
        document.getElementById('auth-modal').style.display = 'none';
        this.init();
    },

    renderOverview() {
        // 1. Identify User & Planet - optional chaining (?.) and Nullish coalescing (??) to prevent crashes
        const name = currentUser?.displayName ?? "Commander";
        const pName = gameData.planetName ?? "Unknown Sector";
        const coords = gameData.coordinates ?? "[0:0]";

        // 2. Update Welcome Header
        const welcomeEl = document.getElementById('overview-welcome');
        if (welcomeEl) {
            welcomeEl.innerHTML = `
                Welcome, ${name}<br>
                <small style="color: #888; font-size: 0.5em;">Planet ${pName} ${coords}</small>
            `;
        }

        // 3. Infrastructure & Fleet Calculations
        let infraLevels = 0;
        for (const key in gameData.buildings) {
            infraLevels += (gameData.buildings[key].level || 0);
        }

        let fleetCount = 0;
        for (const key in gameData.ships) {
            fleetCount += (gameData.ships[key].count || 0);
        }

        // 4. Score & Rank
        const score = gameData.score || 0;
        let title = "Space Trainee";
        if (score > 10) title = "Space Cadet";
        if (score > 100) title = "System Explorer";
        if (gameData.score > 300) title = "Sector Specialist";
        if (gameData.score > 600) title = "Interstellar Architect";
        if (gameData.score > 900) title = "Cosmic Overlord";
        if (gameData.score > 1000) title = "Galactic Hegemon";
        if (gameData.score > 1500) title = "Universal Sovereign";

        // 5. DOM Updates with Error Checking
        const safeSet = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        safeSet('overview-rank', title);
        safeSet('overview-score', Math.floor(score));
        safeSet('overview-fleet', fleetCount);
        safeSet('overview-buildings', infraLevels);
    },

    renderBuildings() {
        const container = document.getElementById("buildings-list");
        if (!container) return;

        let listHtml = "";
        for (let key of Object.keys(gameData.buildings)) {
            const b = gameData.buildings[key];
            const reqStatus = Economy.checkRequirements(key);
            const cost = Economy.getCost(key);
            const canAffordMetal = gameData.resources.metal >= (cost.metal || 0);
            const canAffordCrystal = gameData.resources.crystal >= (cost.crystal || 0);
            const canAffordDeut = gameData.resources.deuterium >= (cost.deuterium || 0);
            
            // Calculate Time and Energy
            const time = b.baseTime ? (b.baseTime * Math.pow(b.timeGrowth || 1.2, b.level)) : 0;
            const energyUsage = Math.abs(b.energyWeight || 0) * (b.level + 1); // Estimated next level usage

            let reqHtml = "";
            if (!reqStatus.met) {
                reqHtml = reqStatus.missing.map(msg => 
                    `<div class="node-reqs">Requires ${msg}</div>`
                ).join("");
            }

            listHtml += `
                <div class="card ${!reqStatus.met ? 'locked' : ''}">
                    <div class="card-header">
                        <h3 onclick="UI.showDetails('${key}')" style="cursor:pointer; text-decoration:underline;">${b.name}</h3>
                        <span class="lvl-badge">Lvl ${b.level}</span>
                    </div>
                    
                    <div class="card-body">
                        <p class="building-desc">${b.desc}</p>
                        ${!reqStatus.met ? reqHtml : `
                            <div class="building-footer">
                                <div id="cost-${key}" class="cost-grid">
                                    ${cost.metal > 0 ? `
                                        <span style="color: ${canAffordMetal ? '#aaa' : '#ff4d4d'}">
                                            ${icons.metal} ${Economy.formatNum(cost.metal)}
                                        </span>` : ''}
                                    ${cost.crystal > 0 ? `
                                        <span style="color: ${canAffordCrystal ? '#aaa' : '#ff4d4d'}">
                                            ${icons.crystal} ${Economy.formatNum(cost.crystal)}
                                        </span>` : ''}
                                    ${cost.deuterium > 0 ? `
                                        <span style="color: ${canAffordDeut ? '#aaa' : '#ff4d4d'}">
                                            ${icons.deuterium} ${Economy.formatNum(cost.deuterium)}
                                        </span>` : ''}
                                </div>
                                <div class="action-row">
                                    <span id="time-${key}" class="build-time">
                                        ⏳ ${Economy.formatTime(time)} 
                                        ${b.energyWeight > 0 ? ` | ${icons.energy} +${Math.floor(energyUsage)}` : ''}
                                    </span>
                                    <button id="btn-${key}" class="btn-build" onclick="Game.build('${key}')">Upgrade</button>
                                </div>
                            </div>
                        `}
                    </div>
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
            
            const reqStatus = Economy.checkRequirements(key);
            
            // 1. Get Cost & Time
            const cost = Economy.getCost(key, 'research');
            const time = Economy.getBuildTime(key, 'research');

            // 2. Check Affordability (for coloring)
            const canAffordMetal = gameData.resources.metal >= (cost.metal || 0);
            const canAffordCrystal = gameData.resources.crystal >= (cost.crystal || 0);
            const canAffordDeut = gameData.resources.deuterium >= (cost.deuterium || 0);

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
                            
                            <div id="res-cost-${key}" class="cost-grid">
                                ${cost.metal > 0 ? `
                                    <span style="color: ${canAffordMetal ? '#aaa' : '#ff4d4d'}">
                                        ${icons.metal} ${Economy.formatNum(cost.metal)}
                                    </span>` : ''}
                                ${cost.crystal > 0 ? `
                                    <span style="color: ${canAffordCrystal ? '#aaa' : '#ff4d4d'}">
                                        ${icons.crystal} ${Economy.formatNum(cost.crystal)}
                                    </span>` : ''}
                                ${cost.deuterium > 0 ? `
                                    <span style="color: ${canAffordDeut ? '#aaa' : '#ff4d4d'}">
                                        ${icons.deuterium} ${Economy.formatNum(cost.deuterium)}
                                    </span>` : ''}
                            </div>

                            <div class="action-row">
                                <span id="res-time-${key}" class="build-time">
                                    ⏳ ${Economy.formatTime(time)}
                                </span>
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
            
            // 1. Get Stats, Cost (Unit), & Time (Unit)
            const stats = Economy.getShipStats(key);
            const cost = Economy.getCost(key, 'ship');
            const time = Economy.getBuildTime(key, 'ship');

            // 2. Check Affordability for 1 Unit (for initial display coloring)
            const canAffordMetal = gameData.resources.metal >= (cost.metal || 0);
            const canAffordCrystal = gameData.resources.crystal >= (cost.crystal || 0);
            const canAffordDeut = gameData.resources.deuterium >= (cost.deuterium || 0);

            let reqHtml = "";
            if (!reqStatus.met) {
                for (const req of reqStatus.missing) {
                    reqHtml += `<div class="req-tag" style="font-size:0.8em; color:#ff6666;">${req}</div>`;
                }
            }
            
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
                                
                                <div id="ship-cost-${key}" class="cost-grid" style="flex: 1;">
                                    ${cost.metal > 0 ? `
                                        <span style="color: ${canAffordMetal ? '#aaa' : '#ff4d4d'}">
                                            ${icons.metal} ${Economy.formatNum(cost.metal)}
                                        </span>` : ''}
                                    ${cost.crystal > 0 ? `
                                        <span style="color: ${canAffordCrystal ? '#aaa' : '#ff4d4d'}">
                                            ${icons.crystal} ${Economy.formatNum(cost.crystal)}
                                        </span>` : ''}
                                    ${cost.deuterium > 0 ? `
                                        <span style="color: ${canAffordDeut ? '#aaa' : '#ff4d4d'}">
                                            ${icons.deuterium} ${Economy.formatNum(cost.deuterium)}
                                        </span>` : ''}
                                </div>

                                <div id="ship-total-${key}" style="text-align: right; white-space: nowrap; font-size: 0.9em; opacity: 0.8;">Total: -</div>
                            </div>

                            <div id="ship-time-${key}" class="build-time" style="text-align: left; margin-top: 5px; margin-bottom: 10px;">
                                ⏳ ${Economy.formatTime(time)} <span style="font-size:0.8em">(per unit)</span>
                            </div>

                            <div class="ship-controls" style="display: flex; gap: 10px; align-items: center;">
                                <input type="number" id="amt-${key}" value="1" min="1" class="ship-input" 
                                    style="flex: 1; padding: 8px; font-size: 1em;" 
                                    oninput="UI.updateShipTotal('${key}')">
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
        const prod = Economy.getProduction(); // This returns metalHourly, etc.

        const setResource = (resKey, displayId, maxId, hoverId) => {
            const displayEl = document.getElementById(displayId);
            const maxEl = document.getElementById(maxId);
            const hoverEl = document.getElementById(hoverId);
            
            const current = gameData.resources[resKey];
            const cap = Economy.getStorageCapacity(resKey);
            // Use the key from getProduction (e.g., 'metal' becomes 'metalHourly')
            const hourlyRate = prod[`${resKey}Hourly` || resKey]; 

            if (displayEl) {
                // a) No decimal points: Use Math.floor
                displayEl.innerText = Economy.formatNum(Math.floor(current));
                displayEl.style.color = current >= cap ? "#ff4d4d" : (current >= cap * 0.9 ? "#ffa500" : "#ffffff");
            }

            if (maxEl) {
                // b) Showing storage cap directly in the bar
                maxEl.innerText = Economy.formatNum(cap);
            }

            if (hoverEl) {
                // d) Production per hour shown ONLY on mouse over
                hoverEl.title = `Production: +${Economy.formatNum(Math.floor(hourlyRate))}/h`;
            }
        };

        setResource('metal', 'metal-display', 'metal-max', 'metal-hover');
        setResource('crystal', 'crystal-display', 'crystal-max', 'crystal-hover');
        setResource('deuterium', 'deuterium-display', 'deuterium-max', 'deuterium-hover');

        // 2. Fix Energy (Splitting between energy-display and max-energy-display)
        const energyEl = document.getElementById('energy-display');
        const maxEnergyEl = document.getElementById('max-energy-display');
        if (energyEl && maxEnergyEl) {
            energyEl.innerText = Math.floor(gameData.resources.energy);
            maxEnergyEl.innerText = gameData.resources.maxEnergy;
            energyEl.style.color = gameData.resources.energy < 0 ? "#ff4d4d" : "#00ff00";
        }

        // 3. Status Panels
        this.renderQueueList("construction-status", (gameData.construction && gameData.construction.buildingKey) ? [gameData.construction] : [], "Construction");
        this.renderQueueList("research-status", gameData.researchQueue || [], "Research");
        this.renderQueueList("ship-production-status", gameData.shipQueue || [], "Hangar");
    },

    renderQueueList(containerId, queue, label) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (queue.length === 0) {
            container.style.display = "none";
            return;
        }

        container.style.display = "block";
        const item = queue[0];
        const progress = ((item.totalTime - item.timeLeft) / item.totalTime) * 100;

        // 1. Update Labels and Icons based on the container type
        if (containerId === "construction-status") {
            const b = gameData.buildings[item.buildingKey];
            document.getElementById("build-name").innerText = b ? b.name : "Unknown";
            document.getElementById("build-name").style.color = "#ffffff"; // White text
            document.getElementById("build-time").innerText = Economy.formatTime(item.timeLeft);
            document.getElementById("build-progress-bar").style.width = `${progress}%`;
        } 
        else if (containerId === "research-status") {
            const r = gameData.research[item.key];
            document.getElementById("res-name").innerText = r ? r.name : "Unknown";
            document.getElementById("res-name").style.color = "#ffffff"; // White text
            document.getElementById("res-time").innerText = Economy.formatTime(item.timeLeft);
            document.getElementById("res-progress-bar").style.width = `${progress}%`;
        } 
        else if (containerId === "ship-production-status") {
            const shipData = gameData.ships[item.key];
            const shipName = shipData ? shipData.name : "Ship";
            
            const countEl = document.getElementById("ship-queue-count");
            countEl.innerText = `${shipName} (${queue.length} left)`;
            countEl.style.color = "#ffffff"; 

            document.getElementById("ship-queue-time").innerText = Economy.formatTime(item.timeLeft);
            document.getElementById("ship-progress-bar").style.width = `${progress}%`;
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

        if (tabID === 'overview') this.renderOverview();
        if (tabID === 'buildings') this.renderBuildings();
        if (tabID === 'research') this.renderResearch();
        if (tabID === 'hangar') this.renderHangar();
        if (tabID === 'tech-tree') this.renderTechTree();
        if (tabID === 'galaxy') GalaxyUI.render();
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
            } else if (b.unit === "storage") {
                // 1. Get the next level's capacity from our central formula
                const nextCapacity = Economy.calculateStorageAtLevel(nextLvl);
                
                // 2. Determine which icon to use based on the key
                const icons = { metalStorage: "🔘", crystalStorage: "💎", deutStorage: "🧪" };
                const icon = icons[key] || "📦";

                // 3. Set the benefit string
                benefit = `Max ${Economy.formatNum(nextCapacity)} ${icon}`;
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
                    <td>🔘${Economy.formatNum(m)} 💎${Economy.formatNum(c)}🧪${Economy.formatNum(d)}</td>
                    <td>${energyFlow}</td>
                    <td style="color:#fff;">${benefit}</td>
                </tr>`;
        }
        projectionHtml += `</tbody></table>`;
        document.getElementById("details-projection").innerHTML = projectionHtml;
        this.showTab('details');
    },

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerText = message;
        
        // Basic styling
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 20px',
            backgroundColor: type === 'success' ? '#2ecc71' : '#e74c3c',
            color: 'white',
            borderRadius: '5px',
            zIndex: '1000',
            transition: 'opacity 0.5s'
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        }, 1000);
    },

    showModal(title, body) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-body').innerText = body;
        document.getElementById('game-modal').style.display = 'flex';
    },
    closeModal() {
        document.getElementById('game-modal').style.display = 'none';
    }
};

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
        // 1. Check Queue Availability
        const status = Economy.canQueue('ship');
        if (!status.can) {
            UI.showNotification(status.reason);
            return;
        }

        // 2. Get amount
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

        // Use checkResources
        if (!Economy.checkResources(totalCost)) {
            UI.showNotification("Not enough resources!");
            return;
        }

        // 4. Deduct Resources
        Economy.deductResources(totalCost);

        // 5. Calculate Time
        const timePerUnit = Economy.getBuildTime(key, 'ship');
        const stackTotalTime = timePerUnit * amount;

        gameData.shipQueue.push({
            key: key,
            amount: amount,
            initialAmount: amount, 
            unitTime: timePerUnit, 
            timeLeft: stackTotalTime, 
            totalTime: stackTotalTime 
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
            SaveSystem.save(); 
            if (isCloudEnabled) AuthSystem.saveToCloud();
        }
    }

    UI.update();
    if (Math.random() < 0.01) SaveSystem.save(); 
}

window.UI = UI;
window.onload = () => {
    AuthSystem.init();
    SaveSystem.load();
    UI.init();
    setInterval(tick, 100);
    setInterval(() => {
        if (isCloudEnabled && Math.random() < 0.05) AuthSystem.saveToCloud();
    }, 100);
    
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
    
    const distance = FleetSystem.calculateDistance(gameData.coordinates, coords);
    const shipDef = gameData.ships.spycraft;
    const travelTime = FleetSystem.calculateFlightTime(distance, shipDef.stats.speed, shipDef.tags);
    const fuelCost = FleetSystem.calculateFuelConsumption(distance, { spycraft: 1 });

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
    const success = await FleetSystem.startMission('SPY', window.currentTargetCoords, { spycraft: count });
    
    if (success) {
        closeDispatch();
        UI.showNotification("Probes Dispatched!");
    }
}