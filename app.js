/**
 * Master Mind - Core Application Logic
 * Features: Tabs, 3 Games, Back/Home nav, localStorage persistence per game
 */
// Main JavaScript file that powers the entire Master Mind game — contains all game logic, UI rendering, sound engine, and state management

document.addEventListener('DOMContentLoaded', () => {
    // Waits for the entire HTML page to finish loading before running any game code — prevents errors from accessing elements that don't exist yet

    /* =============================================
       PERSISTENT STORAGE — per-game data in localStorage
       ============================================= */
    // DB object handles saving and loading all game progress to the browser's localStorage so data persists between sessions
    const DB = {
        load() {
            // Loads saved game data from localStorage, or returns default starting values if no save exists
            return JSON.parse(localStorage.getItem('mastermind_data') || 'null') || {
                // Parses the stored JSON string back into a JavaScript object; falls back to default data structure if nothing is saved
                coins: 0, // Starting in-game currency
                stars: 0, // Starting star rating currency
                memory: { level: 1, highScore: 0, gamesPlayed: 0, levelsCompleted: 0, hasFailedCurrent: false }, // Room Observer game defaults
                f1: { bestTime: null, gamesPlayed: 0 }, // F1 Reflex game defaults — null means no best time recorded yet
                schulte: { bestTimes: { '3x3': null, '4x4': null, '5x5': null, '6x6': null }, gamesPlayed: 0 }, // Schulte Grid defaults with per-size best times
                confusion: { bestScores: { endless: 0, survival: 0, speed: 0 }, gamesPlayed: 0 } // Color Confusion defaults with per-mode best scores
            };
        },
        save(data) {
            // Saves the entire game state to localStorage as a JSON string so it persists after closing the browser
            localStorage.setItem('mastermind_data', JSON.stringify(data));
        }
    };

    const API_URL = 'http://127.0.0.1:5000/api';
    // Base URL for the Flask backend API — all server requests are sent to this address

    // Live state (loaded from DB on startup)
    // The central state object holds ALL game data in memory — loaded from localStorage on startup
    const state = {
        user: JSON.parse(localStorage.getItem('mastermind_user') || 'null'),
        // Loads the logged-in user's profile from localStorage (null if not logged in)
        currentView: 'home',
        // Tracks which page/view is currently displayed (home, about, help, leaderboard)
        currentGame: null,
        // Tracks which game is currently active (memory, f1, schulte, confusion) or null if on home screen
        currentStage: 'home', // 'home' | 'lobby' | 'playing'
        // Tracks the navigation depth within a game: home → lobby → playing
        activeInterval: null,
        // Stores the ID of any active setInterval timer so it can be cleared when navigating away
        ...DB.load()
        // Spreads all saved game data (coins, stars, memory, f1, schulte, confusion) into the state object
    };

    /* =============================================
       SOUND ENGINE — Web Audio API synthesizer
       ============================================= */
    const SoundEngine = (() => {
        // Self-executing function (IIFE) that creates the sound engine with private variables — handles all game audio using Web Audio API
        let ctx = null; // Web Audio API context — created lazily on first sound play
        let muted = false; // Whether sound is currently muted
        let activeOscillators = []; // Tracks all playing sound oscillators so they can be stopped
        let bgGain = null; // Gain node for background music volume control
        let bgOscillators = []; // Tracks background music oscillators separately
        let bgPlaying = false; // Whether background music is currently playing
        let heartbeatInterval = null; // Interval ID for the looping heartbeat sound (used in timer urgency)
        let bgInterval = null; // Interval ID for the background music note sequence
        let bgStep = 0; // Current position in the background music note sequence

        function getCtx() {
            // Gets or creates the Web Audio API context — needed before any sound can play
            if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Creates a new AudioContext (webkitAudioContext for older Safari browsers)
            if (ctx.state === 'suspended') ctx.resume();
            // Resumes the context if it was suspended (browsers require user interaction before playing audio)
            return ctx;
        }

        function osc(type, freq, duration, volume = 0.1, rampFreq = null) {
            // Helper function to play a single tone — creates an oscillator with optional frequency ramping
            if (muted) return; // Don't play anything if sound is muted
            try {
                const c = getCtx(); // Get the audio context
                const o = c.createOscillator(); // Create a sound wave generator
                const g = c.createGain(); // Create a volume controller
                o.type = type; // Set the wave shape (sine, sawtooth, square, triangle) — each sounds different
                o.frequency.setValueAtTime(freq, c.currentTime); // Set the starting pitch frequency in Hz
                if (rampFreq !== null) o.frequency.exponentialRampToValueAtTime(rampFreq, c.currentTime + duration);
                // If rampFreq is specified, smoothly slide the pitch from freq to rampFreq over the duration (creates sweeping effects)
                g.gain.setValueAtTime(volume, c.currentTime); // Set the starting volume
                g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
                // Fade the volume to near-silence over the duration (natural decay effect)
                o.connect(g); // Connect oscillator → gain node (sound goes through volume control)
                g.connect(c.destination); // Connect gain → speakers (sends sound to output)
                o.start(c.currentTime); // Start playing the tone immediately
                o.stop(c.currentTime + duration); // Schedule the tone to stop after the specified duration
                activeOscillators.push(o); // Track this oscillator so it can be force-stopped if needed
                o.onended = () => { activeOscillators = activeOscillators.filter(x => x !== o); };
                // When the tone finishes, remove it from the tracking array to free memory
            } catch (e) { } // Silently catch any audio errors (e.g., if audio isn't supported)
        }

        return {
            // Public API returned by the SoundEngine IIFE — these methods can be called from game code
            get muted() { return muted; }, // Getter that returns the current mute state
            toggleMute() {
                // Toggles sound on/off; stops all active sounds when muting
                muted = !muted; // Flip the mute flag
                if (muted) this.stopAll(); // If now muted, immediately stop all playing sounds
                return muted; // Return the new mute state
            },

            // Short crisp click — played when any button is pressed throughout the game
            click() { osc('sine', 1000, 0.05, 0.08); }, // 1000Hz sine wave, 50ms, low volume

            // Pleasant ascending tone — played when the player answers a question correctly
            correct() {
                if (muted) return; // Skip if muted
                try {
                    const c = getCtx();
                    const t = c.currentTime;
                    // Two quick ascending notes (C5=523Hz, G5=784Hz) create a cheerful "ding-ding" reward sound
                    [523, 784].forEach((f, i) => {
                        const o = c.createOscillator();
                        const g = c.createGain();
                        o.type = 'sine'; // Pure sine wave for a clean, pleasant tone
                        o.frequency.setValueAtTime(f, t); // Set pitch to the note frequency
                        g.gain.setValueAtTime(0.12, t + i * 0.08); // Start each note 80ms apart
                        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.12); // Quick fade out
                        o.connect(g); g.connect(c.destination); // Route to speakers
                        o.start(t + i * 0.08); // Stagger the start of each note by 80ms
                        o.stop(t + i * 0.08 + 0.12); // Each note lasts 120ms
                        activeOscillators.push(o);
                        o.onended = () => { activeOscillators = activeOscillators.filter(x => x !== o); };
                    });
                } catch (e) { }
            },

            // Descending buzzer — played when the player gives a wrong answer
            wrong() { osc('sawtooth', 200, 0.25, 0.1); }, // Sawtooth wave at low 200Hz creates a harsh buzzer sound

            // Timer tick — short soft tick played every second during countdown timers
            tick() { osc('sine', 800, 0.03, 0.06); }, // 800Hz for 30ms — creates a subtle clock-tick effect

            // Double heartbeat thump — creates urgency when timer is about to expire
            heartbeat() {
                if (muted) return;
                try {
                    const c = getCtx();
                    const t = c.currentTime;
                    [0, 0.15].forEach(delay => {
                        // Two thumps 150ms apart simulate a "lub-dub" heartbeat rhythm
                        const o = c.createOscillator();
                        const g = c.createGain();
                        o.type = 'sine';
                        o.frequency.setValueAtTime(60, t + delay); // Very low 60Hz creates a deep chest-thump feeling
                        g.gain.setValueAtTime(0.2, t + delay); // Moderate volume for impact
                        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15); // Quick fade
                        o.connect(g); g.connect(c.destination);
                        o.start(t + delay);
                        o.stop(t + delay + 0.15);
                        activeOscillators.push(o);
                        o.onended = () => { activeOscillators = activeOscillators.filter(x => x !== o); };
                    });
                } catch (e) { }
            },

            // Start a looping heartbeat — called when timer drops to 3 seconds or less
            startHeartbeatLoop() {
                if (heartbeatInterval) return; // Don't start multiple loops
                this.heartbeat(); // Play immediately
                heartbeatInterval = setInterval(() => this.heartbeat(), 800); // Then repeat every 800ms
            },
            stopHeartbeatLoop() {
                // Stops the heartbeat loop when the timer phase ends
                if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
            },

            // F1 light beep — played when each red light turns on during the F1 race countdown
            lightBeep() { osc('sine', 440, 0.1, 0.1); }, // A4 note (440Hz) for 100ms

            // F1 GO burst — played when all lights go out and the player can react
            goBurst() { osc('sine', 1200, 0.3, 0.15, 600); }, // High pitch sweeping down from 1200Hz to 600Hz

            // False start warning — played when the player presses too early in F1 Reflex
            falseStart() { osc('square', 150, 0.5, 0.12); }, // Harsh square wave buzzer at low frequency

            // Level complete fanfare (C-E-G-C arpeggio) — celebratory sound played when the player beats a level
            fanfare() {
                if (muted) return;
                try {
                    const c = getCtx();
                    const t = c.currentTime;
                    [523, 659, 784, 1047].forEach((f, i) => {
                        // Plays C5-E5-G5-C6 notes in sequence — a classic victory arpeggio
                        const o = c.createOscillator();
                        const g = c.createGain();
                        o.type = 'sine';
                        o.frequency.setValueAtTime(f, t); // Set each note's pitch
                        g.gain.setValueAtTime(0, t); // Start silent
                        g.gain.linearRampToValueAtTime(0.12, t + i * 0.12 + 0.01); // Quick fade in
                        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.2); // Smooth fade out
                        o.connect(g); g.connect(c.destination);
                        o.start(t + i * 0.12); // Each note starts 120ms after the previous
                        o.stop(t + i * 0.12 + 0.2); // Each note lasts 200ms
                        activeOscillators.push(o);
                        o.onended = () => { activeOscillators = activeOscillators.filter(x => x !== o); };
                    });
                } catch (e) { }
            },

            // Background ambient music — dual mode (lobby vs suspense)
            // Lobby: soothing guitar-pluck arpeggio for menus; Suspense: slow sine-wave pulses for tense gameplay
            startBgMusic(type = 'lobby') {
                if (muted) return; // Don't play if muted
                // If already playing the same type, ignore. Otherwise stop and switch.
                if (bgPlaying && this.currentMusicType === type) return; // Already playing this type
                if (bgPlaying) this.stopBgMusic(); // Stop current music before switching types

                try {
                    const c = getCtx();
                    bgPlaying = true; // Flag that background music is active
                    this.currentMusicType = type; // Remember which type is playing
                    bgStep = 0; // Reset the note sequence position

                    // Lobby music: C major → G major → A minor → F major chord progression
                    const lobbySequence = [
                        130.81, 164.81, 196.00, 261.63, // Cmaj arpeggio notes
                        98.00, 146.83, 196.00, 246.94,  // Gmaj arpeggio notes
                        110.00, 164.81, 220.00, 261.63, // Am arpeggio notes
                        87.31, 130.81, 196.00, 220.00   // Fmaj arpeggio notes
                    ];

                    // Soothing Suspense: A-minor based tension — deeper, slower notes for in-game atmosphere
                    const suspenseSequence = [
                        55.00, 82.41,  // Bass pulses (A1, E2) — deep rumbling foundation
                        110.00, 130.81, // A2, C3 — mid-range tension
                        55.00, 73.42,  // A1, D2 — returning to bass
                        110.00, 146.83  // A2, D3 — rising tension
                    ];

                    const sequence = type === 'lobby' ? lobbySequence : suspenseSequence;
                    // Selects the note sequence based on the music type
                    const interval = type === 'lobby' ? 250 : 1500; // Fast for lobby arpeggio, slow for suspense
                    // Lobby plays notes every 250ms (upbeat feel); Suspense plays every 1500ms (slow, tense feel)

                    const playNote = () => {
                        // Inner function that plays one note from the sequence and advances to the next
                        if (muted || !bgPlaying) return; // Stop if muted or music was stopped
                        const freq = sequence[bgStep % sequence.length];
                        // Gets the current note frequency, looping back to the start when the sequence ends

                        const playGuitarPluck = (f, vol, dcy) => {
                            // Simulates an acoustic guitar pluck sound using multiple oscillators + noise burst
                            // Main string sound (Triangle for acoustic feel)
                            const o = c.createOscillator();
                            const g = c.createGain();
                            o.type = 'triangle'; // Triangle wave mimics the warm tone of a plucked guitar string
                            o.frequency.setValueAtTime(f, c.currentTime); // Set the note pitch

                            // Harmonic (one octave up, quieter) — adds brightness to the pluck
                            const oh = c.createOscillator();
                            const gh = c.createGain();
                            oh.type = 'triangle'; // Same wave type for consistency
                            oh.frequency.setValueAtTime(f * 2, c.currentTime); // Double the frequency for one octave higher

                            // Envelope: Shorter attack for "plucked" feel — fast start, gradual decay
                            const attack = 0.01; // 10ms attack time — very fast, like a string being snapped
                            g.gain.setValueAtTime(0, c.currentTime); // Start silent
                            g.gain.linearRampToValueAtTime(vol, c.currentTime + attack); // Quick volume rise
                            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dcy); // Slow natural decay

                            gh.gain.setValueAtTime(0, c.currentTime); // Harmonic starts silent too
                            gh.gain.linearRampToValueAtTime(vol * 0.4, c.currentTime + attack); // Harmonic is 40% volume of fundamental
                            gh.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dcy * 0.8); // Harmonic decays faster than the fundamental

                            // Subtle pluck noise (white noise burst) — simulates the initial "attack" of a guitar pick
                            const bufSize = c.sampleRate * 0.02; // 20ms of samples
                            const buffer = c.createBuffer(1, bufSize, c.sampleRate); // Single-channel audio buffer
                            const data = buffer.getChannelData(0); // Get the raw audio sample array
                            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
                            // Fill with random values between -1 and 1 (white noise) to simulate pick attack
                            const noise = c.createBufferSource(); // Source node to play the noise buffer
                            const nGain = c.createGain(); // Volume control for the noise
                            noise.buffer = buffer; // Assign the noise samples
                            nGain.gain.setValueAtTime(vol * 0.2, c.currentTime); // Noise is 20% of the main volume
                            nGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.02); // Fade out in 20ms

                            o.connect(g); g.connect(c.destination); // Route fundamental to speakers
                            oh.connect(gh); gh.connect(c.destination); // Route harmonic to speakers
                            noise.connect(nGain); nGain.connect(c.destination); // Route noise burst to speakers

                            o.start(c.currentTime); o.stop(c.currentTime + dcy); // Play fundamental for full decay
                            oh.start(c.currentTime); oh.stop(c.currentTime + dcy); // Play harmonic for full decay
                            noise.start(c.currentTime); // Play noise burst (auto-stops when buffer ends)

                            bgOscillators.push(o, oh); // Track both oscillators for cleanup
                            o.onended = () => { bgOscillators = bgOscillators.filter(x => x !== o && x !== oh); };
                            // Remove from tracking when done
                        };

                        if (type === 'lobby') {
                            playGuitarPluck(freq, 0.04, 3.0); // Lobby: play a soft guitar pluck with 3s decay
                        } else {
                            // Suspense mode: slow sine-wave drones for tense in-game atmosphere
                            const o = c.createOscillator();
                            const g = c.createGain();
                            o.type = 'sine'; // Pure sine for smooth, haunting tones
                            o.frequency.setValueAtTime(freq, c.currentTime); // Set the bass note pitch

                            if (bgStep % 4 === 0) {
                                // Every 4th note, add a high shimmer overlay for ethereal effect
                                const highO = c.createOscillator();
                                const highG = c.createGain();
                                highO.type = 'sine';
                                highO.frequency.setValueAtTime(freq * 4, c.currentTime); // 2 octaves up for shimmer
                                highG.gain.setValueAtTime(0, c.currentTime); // Start silent
                                highG.gain.linearRampToValueAtTime(0.015, c.currentTime + 1.0); // Slow 1s fade in
                                highG.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 4.0); // 4s total decay
                                highO.connect(highG); highG.connect(c.destination);
                                highO.start(c.currentTime); highO.stop(c.currentTime + 4.0);
                            }

                            g.gain.setValueAtTime(0, c.currentTime); // Start silent
                            g.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.2); // Gentle 200ms fade in
                            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 4.0); // Long 4s decay
                            o.connect(g); g.connect(c.destination);
                            o.start(c.currentTime); o.stop(c.currentTime + 4.0);
                            bgOscillators.push(o); // Track for cleanup
                            o.onended = () => { bgOscillators = bgOscillators.filter(x => x !== o); };
                        }

                        bgStep++; // Advance to the next note in the sequence
                    };

                    playNote(); // Play the first note immediately
                    bgInterval = setInterval(playNote, interval); // Schedule subsequent notes at the set interval
                } catch (e) { } // Silently catch any audio errors
            },
            stopBgMusic() {
                // Stops all background music and cleans up oscillators
                if (bgInterval) { clearInterval(bgInterval); bgInterval = null; } // Stop the note scheduler
                bgOscillators.forEach(o => { try { o.stop(); } catch (e) { } }); // Force-stop all playing notes
                bgOscillators = []; // Clear the tracking array
                bgPlaying = false; // Mark music as stopped
                this.currentMusicType = null; // Reset the music type
            },

            // Kill everything — stops all sounds, heartbeat, and background music at once
            stopAll() {
                this.stopHeartbeatLoop(); // Stop heartbeat if playing
                this.stopBgMusic(); // Stop background music
                activeOscillators.forEach(o => { try { o.stop(); } catch (e) { } }); // Stop all sound effects
                activeOscillators = []; // Clear the effects tracking array
            }
        };
    })(); // Immediately invoked — SoundEngine is ready to use right away

    async function syncScore(gameType, score, level = 1, extraData = {}) {
        // Sends the player's game results to the Flask backend for server-side storage and leaderboard tracking
        if (!state.user) return; // Can't sync if not logged in
        try {
            const response = await fetch(`${API_URL}/save-progress`, {
                // POST request to the save-progress API endpoint
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: state.user.id, // Which user is submitting
                    game_type: gameType, // Which game was played
                    score: score, // The score achieved
                    level: level, // The level played (mainly for Room Observer)
                    coins_gained: gameType === 'memory' ? (score >= Math.ceil(5 * 0.6) ? 1 : 0) : (gameType === 'f1' ? 20 : (gameType === 'schulte' ? 30 : Math.floor(score / 10))),
                    // Calculates coins earned: Memory=1 coin if passed, F1=20 coins, Schulte=30 coins, Confusion=score/10
                    stars_gained: gameType === 'memory' ? (score === 5 ? 3 : (score >= 4 ? 2 : (score >= 3 ? 1 : 0))) : (gameType === 'schulte' ? 2 : (gameType === 'confusion' ? Math.floor(score / 5) : 0)),
                    // Calculates stars earned: Memory=1-3 stars based on score, Schulte=2 stars, Confusion=score/5
                    extra_data: extraData // Additional game-specific data (rank, mode, etc.)
                })
            });
            const data = await response.json(); // Parse the server response
            if (data.status === 'success') {
                state.coins = data.coins; // Update local coin count with server value
                state.stars = data.stars; // Update local star count with server value
                updateNavStats(); // Refresh the navbar display
                DB.save(state); // Save the updated state to localStorage
            }
        } catch (e) {
            console.error("Backend sync failed:", e); // Log the error but don't crash the game
        }
    }

    /* =============================================
       DOM REFS — cached references to frequently used HTML elements
       ============================================= */
    const loader = document.getElementById('loader'); // Loading screen container
    const app = document.getElementById('app'); // Main app container (hidden during loading)
    const mainContent = document.getElementById('main-content'); // Dynamic content area where game views are rendered
    const loginBtn = document.getElementById('login-btn'); // Login button in the navbar
    const authModal = document.getElementById('auth-modal'); // Login modal popup
    const googleLogin = document.getElementById('google-login'); // Google login button inside the modal

    /* =============================================
       INIT — runs once when the page loads
       ============================================= */
    init(); // Call the initialization function immediately

    async function init() {
        // Sets up the initial state of the game: loading bar, user session, and event listeners
        updateNavStats(); // Display current coins/stars in the navbar

        await checkSession(); // Wait for session fetch to complete before setting up user info
        initGoogleAuth(); // Initialize Google Identity Services

        let progress = 0; // Loading bar progress percentage (0-100)
        const progressFill = document.getElementById('loader-progress'); // The loading bar fill element
        const interval = setInterval(() => {
            // Simulates a loading bar by incrementing progress at random speeds every 200ms
            progress += Math.random() * 30; // Add a random amount (0-30%) each tick for natural feel
            if (progress >= 100) {
                progress = 100; // Cap at 100%
                clearInterval(interval); // Stop the loading simulation
                hideLoader(); // Transition from loading screen to the main app
            }
            if (progressFill) progressFill.style.width = `${progress}%`; // Update the visual width of the progress bar
        }, 200); // Run every 200ms

        if (state.user) {
            // If a user is already logged in (from a previous session), show their profile instead of the Login button
            loginBtn.classList.add('hidden'); // Hide the Login button
            const userInfo = document.getElementById('user-info');
            userInfo.classList.remove('hidden'); // Show the user info section
            const nameEl = userInfo.querySelector('.user-name');
            if (nameEl) nameEl.textContent = state.user.username; // Display the user's name
            const avatarEl = document.getElementById('user-avatar');
            if (avatarEl && state.user.picture) avatarEl.src = state.user.picture; // Display Google avatar if available
        }

        setupEventListeners(); // Attach all click handlers and navigation listeners
    }

    function hideLoader() {
        // Fades out the loading screen and reveals the main app with entry animations
        gsap.to(loader, {
            opacity: 0, duration: 0.8, // Fade out loader over 0.8 seconds
            onComplete: () => {
                // After fade completes:
                loader.classList.add('hidden'); // Remove loader from view
                app.classList.remove('hidden'); // Show the main app
                gsap.from('.hero', { opacity: 0, y: 30, duration: 1 }); // Animate hero section sliding up
                gsap.from('.game-card-expanded', { opacity: 0, y: 30, duration: 1, stagger: 0.2, delay: 0.3 });
                // Animate game cards sliding up with staggered delay for a cascading entrance effect
            }
        });
    }

    function updateNavStats() {
        // Updates the coin and star displays in the navigation bar to reflect current state
        const coinEl = document.getElementById('coin-count');
        const starEl = document.getElementById('star-count');
        if (coinEl) coinEl.textContent = state.coins; // Set the displayed coin count
        if (starEl) starEl.textContent = state.stars; // Set the displayed star count
    }

    /* =============================================
       EVENT LISTENERS — sets up all interactive behaviors
       ============================================= */
    function setupEventListeners() {
        // Attaches all click handlers for navigation, game selection, and authentication

        // Global click sound for all buttons — plays a subtle click on any button press
        document.addEventListener('click', (e) => {
            if (e.target.closest('button')) { // Check if the clicked element is a button (or inside one)
                SoundEngine.click(); // Play the click sound effect
            }
        });

        // Navbar links — handles switching between Home, Leaderboard, About, and Help views
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault(); // Prevent the default link behavior (page jump)
                switchView(item.getAttribute('data-view')); // Switch to the view specified in data-view attribute
            });
        });

        // Game Mode Card Switching — handles clicking between Room Observer, F1 Reflex, Schulte, Color Confusion
        document.querySelectorAll('.mode-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const gameId = btn.getAttribute('data-game'); // Get which game was clicked
                document.querySelectorAll('.mode-card').forEach(b => b.classList.remove('active')); // Deactivate all cards
                btn.classList.add('active'); // Highlight the clicked card
                document.querySelectorAll('.game-card-expanded').forEach(card => {
                    card.classList.add('hidden'); // Hide all preview cards
                    card.classList.remove('active');
                });
                const preview = document.getElementById(`${gameId}-preview`); // Find the matching preview card
                if (preview) {
                    preview.classList.remove('hidden'); // Show the selected game's preview
                    preview.classList.add('active');
                }
            });
        });

        // Play buttons on home tab cards — launches the selected game
        document.querySelectorAll('.play-game-btn').forEach(btn => {
            btn.addEventListener('click', () => startGame(btn.getAttribute('data-game')));
            // Starts the game identified by the button's data-game attribute
        });

        // Auth — login/modal event handlers
        loginBtn.addEventListener('click', () => authModal.classList.remove('hidden')); // Open login modal
        document.querySelector('.close-modal').addEventListener('click', () => authModal.classList.add('hidden')); // Close login modal
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout); // Logout handler
    }

    /* =============================================
       VIEW ROUTING — handles switching between the main pages
       ============================================= */
    function switchView(view) {
        // Switches the main content area to show a different page (home, about, help, leaderboard)
        if (state.activeInterval) clearInterval(state.activeInterval); // Stop any running game timers
        state.currentView = view; // Update the current view tracker
        state.currentGame = null; // Clear any active game
        state.currentStage = 'home'; // Reset to home stage

        // Update navbar to highlight the active tab
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-view') === view);
            // Adds 'active' class to the matching nav item, removes from others
        });

        if (view === 'home') {
            goBack(); // Renders the home view with game cards
        } else if (view === 'about') {
            renderAbout(); // Renders the About page with team info
        } else if (view === 'help') {
            renderHelp(); // Renders the Help page with game instructions
        } else if (view === 'leaderboard') {
            renderLeaderboard(); // Renders the Leaderboard/Stats page
        } else {
            mainContent.innerHTML = `<div class='view'><h2>${view.charAt(0).toUpperCase() + view.slice(1)} Coming Soon</h2></div>`;
            // Fallback: shows a "Coming Soon" message for any unimplemented views
        }
    }

    function goBack() {
        // Handles the "Back" navigation: goes from playing→lobby, lobby→home, or stays home
        // Stop all sounds when navigating away
        SoundEngine.stopAll();
        // Sequential navigation logic — checks current game and stage to determine where to go back to
        if (state.currentGame === 'memory' && state.currentStage === 'playing') {
            SoundEngine.startBgMusic('lobby'); // Switch back to lobby music
            if (state.activeInterval) clearInterval(state.activeInterval); // Stop any game timers
            initMemoryLobby(); // Go back to the Room Observer lobby screen
            return;
        }
        if (state.currentGame === 'schulte' && state.currentStage === 'playing') {
            SoundEngine.startBgMusic('lobby');
            if (state.activeInterval) clearInterval(state.activeInterval);
            initSchulteGame(); // Go back to Schulte Grid size selection
            return;
        }
        if (state.currentGame === 'confusion' && state.currentStage === 'playing') {
            SoundEngine.startBgMusic('lobby');
            if (state.activeInterval) clearInterval(state.activeInterval);
            initConfusionGame(); // Go back to Color Confusion mode selection
            return;
        }

        // Returns to home tab selection (game lobby) without page reload
        if (state.activeInterval) clearInterval(state.activeInterval); // Stop any remaining timers
        SoundEngine.stopBgMusic(); // Stop music when at home screen
        state.currentGame = null; // Clear the active game
        state.currentView = 'home'; // Set the view to home
        state.currentStage = 'home'; // Set the stage to home

        // Reset nav active states
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-view') === 'home');
        });

        // Re-render the home view
        mainContent.innerHTML = `
            <section id="home-view" class="view">
                <header class="hero" style="text-align: center; margin-bottom: 2rem;">
                    <h2 class="sub-greeting">Mastering the Mind</h2>
                    <p>Select your challenge and reach new heights.</p>
                </header>
                <div class="mode-cards-row">
                    <button class="mode-card active" data-game="memory">
                        <div class="mode-card-icon memory-icon">🏠</div>
                        <div class="mode-card-title">Room Observer</div>
                        <div class="mode-card-sub">Spatial Memory</div>
                    </button>
                    <button class="mode-card" data-game="f1">
                        <div class="mode-card-icon f1-icon">🏎️</div>
                        <div class="mode-card-title">F1 Reflex</div>
                        <div class="mode-card-sub">Reaction Speed</div>
                    </button>
                    <button class="mode-card" data-game="schulte">
                        <div class="mode-card-icon schulte-icon">🔢</div>
                        <div class="mode-card-title">Schulte Grid</div>
                        <div class="mode-card-sub">Visual Perception</div>
                    </button>
                    <button class="mode-card" data-game="confusion">
                        <div class="mode-card-icon confusion-icon">🎨</div>
                        <div class="mode-card-title">Color Confusion</div>
                        <div class="mode-card-sub">Stroop Effect</div>
                    </button>
                </div>
                <div id="game-display-area" class="game-display-container">
                    <div class="game-card-expanded active" id="memory-preview">
                        <div class="preview-visual memory">🏘️</div>
                        <div class="preview-content">
                            <h3>Room Observer</h3>
                            <p>Challenge your spatial memory by observing 5 objects and their colors in just 10 seconds. Perfect for sharpening focus!</p>
                            <button class="btn-cta play-game-btn" data-game="memory">Play Game</button>
                        </div>
                    </div>
                    <div class="game-card-expanded hidden" id="f1-preview">
                        <div class="preview-visual f1">🏎️</div>
                        <div class="preview-content">
                            <h3>F1 Reflex</h3>
                            <p>Test your reaction speed against legendary F1 drivers. React as soon as the lights go out. Can you beat Verstappen?</p>
                            <button class="btn-cta play-game-btn" data-game="f1">Start Racing</button>
                        </div>
                    </div>
                    <div class="game-card-expanded hidden" id="schulte-preview">
                        <div class="preview-visual schulte">🔢</div>
                        <div class="preview-content">
                            <h3>Schulte Grid</h3>
                            <p>Improve visual perception and peripheral vision. Find the numbers 1 to 25 in ascending order as fast as possible.</p>
                            <button class="btn-cta play-game-btn" data-game="schulte">Start Finding</button>
                        </div>
                    </div>
                    <div class="game-card-expanded hidden" id="confusion-preview">
                        <div class="preview-visual confusion">🎨</div>
                        <div class="preview-content">
                            <h3>Color Confusion</h3>
                            <p>Master the Stroop Effect! Quickly identify either the physical color or the written text under intense time pressure.</p>
                            <button class="btn-cta play-game-btn" data-game="confusion">Start Mixing</button>
                        </div>
                    </div>
                </div>
            </section>
        `;

        // Re-attach event listeners for the home view
        document.querySelectorAll('.mode-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const gameId = btn.getAttribute('data-game');
                document.querySelectorAll('.mode-card').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.game-card-expanded').forEach(card => {
                    card.classList.add('hidden');
                    card.classList.remove('active');
                });
                const preview = document.getElementById(`${gameId}-preview`);
                if (preview) {
                    preview.classList.remove('hidden');
                    preview.classList.add('active');
                }
            });
        });

        document.querySelectorAll('.play-game-btn').forEach(btn => {
            btn.addEventListener('click', () => startGame(btn.getAttribute('data-game')));
        });

        // Animate the home view in
        gsap.from('.hero', { opacity: 0, y: 30, duration: 0.6 });
        gsap.from('.game-card-expanded', { opacity: 0, y: 30, duration: 0.6, delay: 0.15 });
        updateNavStats();
    }

    /* =============================================
       GAME TOOLBAR — Back button and mute toggle injected into every game screen
       ============================================= */
    function gameToolbar(gameTitle) {
        // Returns HTML string for the top toolbar with a Back button, game title, and mute toggle
        return `
            <div class="game-toolbar">
                <button class="toolbar-btn" id="btn-back" onclick="">
                    <span>&#8592;</span> Back
                </button>
                <span class="toolbar-title">${gameTitle}</span>
                <button class="toolbar-btn" id="btn-mute" title="Toggle Sound" style="font-size:1.2rem; min-width:40px;">
                    ${SoundEngine.muted ? '🔇' : '🔊'}
                </button>
            </div>
        `;
        // The toolbar shows: left arrow + "Back" button, centered game title, and a speaker/mute icon button
    }

    function attachToolbarListeners() {
        // Attaches click handlers to the Back and Mute buttons in the game toolbar
        const backBtn = document.getElementById('btn-back');
        if (backBtn) backBtn.addEventListener('click', goBack); // Back button triggers the goBack navigation function
        const muteBtn = document.getElementById('btn-mute');
        if (muteBtn) muteBtn.addEventListener('click', () => {
            const nowMuted = SoundEngine.toggleMute(); // Toggle the mute state
            muteBtn.textContent = nowMuted ? '🔇' : '🔊'; // Update the icon to reflect current state
        });
    }

    /* =============================================
       AUTH — handles user login via Google Identity Services
       ============================================= */

    // Connect Google callback to backend token verification
    window.handleCredentialResponse = async (response) => {
        try {
            const BASE_URL = API_URL.replace('/api', '');
            const res = await fetch(`${BASE_URL}/auth/google/callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential })
            });
            const data = await res.json();
            if (data.status === 'success') {
                updateAuthUI(data.user);
                showToast(`✅ Logged in as ${data.user.username}!`);
            } else {
                showToast('❌ Login failed: ' + data.message);
            }
        } catch (e) {
            showToast('⚠️ Offline Mode: Login unavailable');
        }
    };

    function initGoogleAuth() {
        // Initialize Google Identity Services
        if (!window.google || !window.google.accounts) return;
        google.accounts.id.initialize({
            client_id: "253566578017-e11j4dmmphh8pta941dgqftjpplbshs9.apps.googleusercontent.com",
            callback: window.handleCredentialResponse
        });

        const btnContainer = document.getElementById('google-btn-container');
        if (btnContainer) {
            // Render the official Google Sign-In button inside the modal
            google.accounts.id.renderButton(btnContainer, {
                theme: "outline", size: "large", type: "standard", shape: "rectangular"
            });
        }
    }

    async function checkSession() {
        // Try restoring session from backend
        try {
            const res = await fetch(`${API_URL}/me`, { method: 'GET', credentials: 'omit' });
            const data = await res.json();
            if (data.status === 'success') {
                state.user = data.user;
                localStorage.setItem('mastermind_user', JSON.stringify(state.user));
            }
        } catch (e) {
            console.log('Session check failed (offline mode)');
        }
    }

    async function handleLogout() {
        // Logout user and clear session
        try {
            await fetch(`${API_URL}/logout`, { method: 'POST' });
        } catch (e) { console.log('Logout API failed'); }

        state.user = null;
        localStorage.removeItem('mastermind_user');

        loginBtn.classList.remove('hidden');
        document.getElementById('user-info').classList.add('hidden');

        if (window.google) google.accounts.id.disableAutoSelect();
        showToast('👋 Logged out');
    }

    function updateAuthUI(user) {
        // Applies user data to state and UI
        state.user = user;
        localStorage.setItem('mastermind_user', JSON.stringify(state.user));
        state.coins = user.coins;
        state.stars = user.stars;

        loginBtn.classList.add('hidden');
        const userInfo = document.getElementById('user-info');
        userInfo.classList.remove('hidden');
        userInfo.querySelector('.user-name').textContent = user.username;
        const avatarEl = document.getElementById('user-avatar');
        if (avatarEl && user.picture) avatarEl.src = user.picture;

        const authModal = document.getElementById('auth-modal');
        if (authModal) authModal.classList.add('hidden');

        updateNavStats();
    }

    /* =============================================
       TOAST NOTIFICATION — brief popup messages at the bottom of the screen
       ============================================= */
    function showToast(msg) {
        // Creates a temporary toast notification that appears, stays for 3 seconds, then fades away
        const toast = document.createElement('div'); // Create a new div element
        toast.className = 'toast-msg'; // Apply the toast styling class
        toast.textContent = msg; // Set the message text
        document.body.appendChild(toast); // Add the toast to the page
        setTimeout(() => toast.classList.add('show'), 10); // Trigger the CSS fade-in animation (small delay for transition to work)
        setTimeout(() => {
            toast.classList.remove('show'); // Start the CSS fade-out animation
            setTimeout(() => toast.remove(), 400); // Remove the element from DOM after fade-out completes
        }, 3000); // Keep the toast visible for 3 seconds
    }

    /* =============================================
       RESULT CARD — fullscreen overlay showing game results (replaces alert popups)
       ============================================= */
    function showResultCard({ icon, title, subtitle, details = [], onPrimary, primaryLabel, onSecondary, secondaryLabel }) {
        // Creates a styled fullscreen results overlay with stats, and action buttons to replay or go back
        const card = document.createElement('div');
        card.className = 'result-overlay'; // Fullscreen overlay container
        card.innerHTML = `
            <div class="result-card">
                <div class="result-icon">${icon}</div>
                <h2 class="result-title">${title}</h2>
                <p class="result-sub">${subtitle}</p>
                <div class="result-details">
                    ${details.map(d => `<div class="result-stat"><span>${d.label}</span><strong>${d.value}</strong></div>`).join('')}
                </div>
                <div class="result-actions">
                    <button class="btn-cta" id="res-primary">${primaryLabel}</button>
                    ${secondaryLabel ? `<button class="btn-outline" id="res-secondary">${secondaryLabel}</button>` : ''}
                </div>
            </div>
        `;
        // Builds the result card with: icon, title, subtitle, stat details grid, and action buttons
        document.body.appendChild(card); // Add the overlay to the page
        setTimeout(() => card.classList.add('show'), 10); // Trigger fade-in animation

        document.getElementById('res-primary').addEventListener('click', () => {
            card.remove(); // Remove the overlay
            onPrimary(); // Execute the primary action (e.g., next level, replay)
        });
        if (secondaryLabel) {
            document.getElementById('res-secondary').addEventListener('click', () => {
                card.remove(); // Remove the overlay
                onSecondary(); // Execute the secondary action (e.g., go back to menu)
            });
        }
    }

    /* =============================================
       GAME DISPATCHER — routes to the correct game initializer
       ============================================= */
    function startGame(gameId) {
        // Launches the selected game based on the game ID
        state.currentGame = gameId; // Track which game is now active
        SoundEngine.startBgMusic(); // Start background atmosphere music
        if (gameId === 'memory') initMemoryLobby(); // Launch Room Observer lobby
        else if (gameId === 'f1') initF1Game(); // Launch F1 Reflex
        else if (gameId === 'schulte') initSchulteGame(); // Launch Schulte Grid size selector
        else if (gameId === 'confusion') initConfusionGame(); // Launch Color Confusion mode selector
    }

    /* =============================================
       GAME 1: ROOM OBSERVER — PREMIUM REDESIGN
       Icon cards · Lavender timer · Glass question panel
       ============================================= */

    // ── Per-object SVG icons + card palette ───────────────────────────────
    // ── Per-object SVG icons + card palette ───────────────────────────────
    const OBJECT_DATA = {
        Flower: {
            bg: '#FDF2F2',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="36" cy="36" r="6" stroke="currentColor" stroke-width="4"/>
                <path d="M36 30c0-6 6-10 12-10s12 4 12 10-6 10-12 10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M36 30c0-6-6-10-12-10S12 24 12 30s6 10 12 10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M36 42c0 6 6 10 12 10s12-4 12-10-6-10-12-10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M36 42c0 6-6 10-12 10S12 48 12 42s6-10 12-10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M36 12v18M36 42v18" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.3"/>
            </svg>`
        },
        Airplane: {
            bg: '#EBFBFF',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 42L28 38L32 16C33 14 36 14 37 16L41 36L60 32C62 31.5 64 33 64 35C64 37 62 38.5 60 40L41 44L44 56C44 58 42 60 40 60L38 52L24 58L22 46L12 42Z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`
        },
        Phone: {
            bg: '#FFFBEB',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="22" y="10" width="28" height="52" rx="6" stroke="currentColor" stroke-width="4"/>
                <path d="M26 18h20m-20 8h10" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.4"/>
                <circle cx="36" cy="52" r="4" stroke="currentColor" stroke-width="4"/>
                <path d="M10 28c4-4 8-4 12 0m28 0c4-4 8-4 12 0" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.3"/>
            </svg>`
        },
        Sun: {
            bg: '#EFF6FF',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="36" cy="36" r="14" stroke="currentColor" stroke-width="4"/>
                <path d="M36 12v6m0 36v6M12 36h6m36 0h6m-39.6-17.1l4.2 4.2m26.8 26.8l4.2 4.2m-35.2 0l4.2-4.2m26.8-26.8l4.2-4.2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
            </svg>`
        },
        Wristwatch: {
            bg: '#FFF7ED',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="36" cy="36" r="18" stroke="currentColor" stroke-width="4"/>
                <path d="M24 22c0-8 4-12 12-12s12 4 12 12m-24 28c0 8 4 12 12 12s12-4 12-12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M36 36l6-6m-6 6v-10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
            </svg>`
        },
        Palette: {
            bg: '#FDF2F2',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60 36c0 13.3-10.7 24-24 24s-24-10.7-24-24 10.7-24 24-24 24 10.7 24 24z" stroke="currentColor" stroke-width="4"/>
                <circle cx="28" cy="28" r="4" fill="currentColor"/>
                <circle cx="44" cy="28" r="4" fill="currentColor" opacity="0.7"/>
                <circle cx="44" cy="44" r="4" fill="currentColor" opacity="0.5"/>
                <circle cx="28" cy="44" r="4" fill="currentColor" opacity="0.3"/>
                <path d="M30 60c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
            </svg>`
        }
    };

    // Colour → CSS hex used for bullet dots and colour-chips in the question card
    // Maps color names to their hex codes for rendering colored elements in the game UI
    const COLOR_HEX = {
        Red: '#ef4444', Blue: '#3b82f6', Green: '#22c55e',
        Yellow: '#eab308', Purple: '#a855f7', Orange: '#f97316',
        Pink: '#ff29ff', Cyan: '#06b6d4', Indigo: '#6366f1',
        Violet: '#8b5cf6', Lavender: '#a78bfa', Beige: '#f5f5dc',
        Brown: '#78350f', White: '#ffffff', Black: '#1a1a1a'
    };

    function getRoomTheme(level) {
        // Returns a CSS background style based on the current level — changes every 50 levels for visual variety
        const index = Math.floor((level - 1) / 50); // Calculate which theme tier (0-5) based on level
        const themes = [
            '#f8fafc', // Default light gray (levels 1-50)
            'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', // Midnight dark blue (levels 51-100)
            'linear-gradient(135deg, #4b6cb7 0%, #182848 100%)', // Ocean blue (levels 101-150)
            'linear-gradient(135deg, #0f2027 0%, #2c5364 100%)', // Emerald teal (levels 151-200)
            'linear-gradient(135deg, #373b44 0%, #4286f4 100%)', // Electric blue (levels 201-250)
            'linear-gradient(135deg, #833ab4 0%, #fd1d1d 100%)' // Sunset purple-red (levels 251-300)
        ];
        return themes[index] || themes[0]; // Return the theme for the current tier, defaulting to the first
    }

    function initMemoryLobby() {
        // Renders the Room Observer lobby screen with stats, shop items, and the Play button
        SoundEngine.startBgMusic('lobby'); // Play lobby background music
        const memData = state.memory; // Get the player's Room Observer save data
        state.currentStage = 'lobby'; // Set navigation stage to lobby (Back goes to home)
        mainContent.innerHTML = `
            ${gameToolbar('Room Observer')}
            <div class="view ro-root ro-lobby-container" style="background: ${getRoomTheme(memData.level)}; border-radius: 0;">
                <header class="ro-header">
                    <h2 class="ro-title">Room Observer</h2>
                    <p>Sharp eyes, steady mind. Master your spatial memory.</p>
                </header>

                <div class="memory-stats-bar" style="justify-content: center; gap: 2rem; margin-top: 1rem;">
                    <div class="stat-item">
                        <span class="stat-label">HIGH SCORE</span>
                        <div class="stat-value">🏆 ${memData.highScore}</div>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">LEVEL</span>
                        <div class="stat-value">📈 ${memData.level}</div>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">STARS</span>
                        <div class="stat-value">⭐ ${state.stars || 0}</div>
                    </div>
                </div>

                <div class="ro-shop-grid">
                    <div class="ro-shop-card">
                        <div class="ro-shop-icon">⏳</div>
                        <h3>Time Boost</h3>
                        <p>Adds 5 seconds to your observation time.</p>
                        <div class="ro-shop-price">100 🪙</div>
                        <button class="btn-cta buy-btn" data-item="time">+5s Time</button>
                    </div>
                    <div class="ro-shop-card">
                        <div class="ro-shop-icon">🛡️</div>
                        <h3>Safety Net</h3>
                        <p>Allows 1 wrong answer without penalty.</p>
                        <div class="ro-shop-price">250 🪙</div>
                        <button class="btn-cta buy-btn" data-item="shield">Buy Shield</button>
                    </div>
                </div>

                <div style="margin-top: 3rem;">
                <button class="btn-cta" id="start-memory-game" style="padding: 1rem 3rem; font-size: 1.2rem; width: auto;">
                    PLAY LEVEL ${memData.level} ▶
                </button>
            </div>
            </div>
        `;

        attachToolbarListeners();

        document.getElementById('start-memory-game').onclick = () => {
            SoundEngine.click();
            initMemoryGame();
        };

        document.querySelectorAll('.buy-btn').forEach(btn => {
            btn.onclick = () => {
                const item = btn.getAttribute('data-item');
                const cost = item === 'time' ? 100 : 250;
                if (state.coins >= cost) {
                    state.coins -= cost;
                    memData.activeBoosts = memData.activeBoosts || [];
                    memData.activeBoosts.push(item);
                    btn.disabled = true;
                    btn.innerText = '✅ Active';
                    updateNavStats();
                    DB.save(state);
                    showToast(`${item === 'time' ? 'Time Boost' : 'Shield'} activated!`);
                } else {
                    showToast('Not enough coins! 🪙');
                }
            };
        });

        gsap.from('.ro-shop-card', { opacity: 0, y: 30, stagger: 0.1, duration: 0.8 });
    }

    function initMemoryGame() {
        // Initializes and runs a Room Observer game round: shows objects to memorize, then asks questions
        SoundEngine.startBgMusic('lobby'); // Keep lobby music during gameplay
        const memData = state.memory;
        let level = memData.level; // Current player level
        state.currentStage = 'playing'; // Set stage to playing (Back goes to lobby)

        // Dynamic difficulty: Base 5 objects, 10 seconds.
        // Every 5 levels: +1 object to memorize, +2 seconds observation time.
        const difficultyStep = Math.floor((level - 1) / 5); // Calculate difficulty tier
        let objectCount = Math.min(12, 5 + difficultyStep); // More objects as level increases, max 12
        let timerSeconds = 10 + (difficultyStep * 2); // More time as objects increase

        // Level 300: Grand Level — the ultimate challenge
        const isGrandLevel = level === 300;
        if (isGrandLevel) {
            objectCount = 12; // Maximum number of objects to memorize
            timerSeconds = 30; // Extra time for the final level
        }

        // Setup boosters — apply any purchased power-ups
        const activeBoosts = memData.activeBoosts || [];
        let extraSeconds = activeBoosts.includes('time') ? 5 : 0; // Time Boost adds 5 seconds
        memData.activeBoosts = []; // Clear boosts after use — they're one-time use

        timerSeconds += extraSeconds; // Add boost time to total
        const totalTime = timerSeconds; // Save original time for progress bar calculation

        const colorNames = Object.keys(COLOR_HEX); // Get all available color names
        const objectNames = Object.keys(OBJECT_DATA); // Get all available object names

        // Build a unique set of room objects with random colors
        const shuffled = [...objectNames].sort(() => Math.random() - 0.5); // Shuffle all object names randomly
        const roomObjects = shuffled.slice(0, Math.min(objectCount, objectNames.length)).map(name => ({
            name, // Object name (e.g., "Flower", "Phone")
            color: colorNames[Math.floor(Math.random() * colorNames.length)] // Assign a random color
        }));
        // Creates an array of objects, each with a name and random color, for the player to memorize

        mainContent.innerHTML = `
            ${gameToolbar('Room Observer')}
            <div class="view game-container ro-root" style="background: ${getRoomTheme(level)}; border-radius: 0;">
                <div class="ro-header" style="text-align: left; padding: 0 1rem;">
                    <div style="color: ${level % 50 === 0 ? 'var(--golden-yellow)' : 'white'}; font-weight: 800; font-size: 1.5rem;">${isGrandLevel ? '🏆 GRAND LEVEL' : 'Level ' + level}</div>
                    <div style="color: white; opacity: 0.8; font-size: 1rem;">${isGrandLevel ? 'The Ultimate Memory Challenge' : 'Memorize ' + objectCount + ' items'}</div>
                </div>

                <div class="ro-timer-capsule" id="timer-capsule">
                    <span class="ro-shop-icon" style="font-size: 1.5rem;">⏱️</span>
                    <span id="game-timer" class="ro-timer-text">${timerSeconds}s</span>
                </div>

                <div class="ro-progress-bar">
                    <div class="ro-progress-fill" id="timer-progress"></div>
                </div>

                <div id="observation-room" class="ro-card-grid">
                    ${roomObjects.map(obj => {
            const data = OBJECT_DATA[obj.name];
            const hex = COLOR_HEX[obj.color];
            const isLight = ['White', 'Yellow', 'Beige'].includes(obj.color);
            const iconStyle = isLight ? 'filter: drop-shadow(0 0 2px rgba(0,0,0,0.3)) brightness(0.9);' : '';
            return `
                            <div class="ro-icon-card" style="background: ${data.bg}; color: ${hex};">
                                <div class="ro-icon-wrap" style="${iconStyle}">${data.svg}</div>
                                <div class="ro-label-pill">${obj.name}</div>
                            </div>`;
        }).join('')}
                </div>

                <div id="game-controls" class="hidden">
                    <div class="ro-question-panel">
                        <div class="ro-question-icon-bg" id="question-icon-bg"></div>
                        <h3 class="ro-question-text" id="question-text"></h3>
                        <div id="answer-buttons" class="ro-answer-grid"></div>
                        <div class="ro-question-progress" id="q-progress"></div>
                    </div>
                </div>
            </div>
        `;

        attachToolbarListeners();
        memData.gamesPlayed++;
        DB.save(state);

        const progressEl = document.getElementById('timer-progress');
        state.activeInterval = setInterval(() => {
            timerSeconds--;
            const timerEl = document.getElementById('game-timer');
            if (timerEl) {
                timerEl.innerText = `${timerSeconds}s`;
                // Add tick sound
                SoundEngine.tick();

                // Urgency at 3 seconds: Red color + Heartbeat
                if (timerSeconds <= 3 && timerSeconds > 0) {
                    timerEl.style.color = '#ef4444'; // Red
                    timerEl.style.fontWeight = '800';
                    SoundEngine.startHeartbeatLoop();
                } else if (timerSeconds <= 0) {
                    SoundEngine.stopHeartbeatLoop();
                }
            }
            if (progressEl) progressEl.style.width = `${(timerSeconds / totalTime) * 100}%`;

            if (timerSeconds <= 0) {
                clearInterval(state.activeInterval);
                showMemoryQuestions(roomObjects, level, activeBoosts);
            }
        }, 1000);

        gsap.from('.ro-icon-card', {
            scale: 0.5,
            opacity: 0,
            y: 50,
            stagger: 0.08,
            duration: 0.6,
            ease: "back.out(1.7)"
        });
    }

    function showMemoryQuestions(roomObjects, level, activeBoosts) {
        // After the observation timer ends, this function shows questions asking the player what colors the objects were
        const observationRoom = document.getElementById('observation-room');
        const controls = document.getElementById('game-controls');
        const qText = document.getElementById('question-text');
        const ansBtns = document.getElementById('answer-buttons');
        const qProgress = document.getElementById('q-progress');
        const qIconBg = document.getElementById('question-icon-bg');
        // Get references to all the question UI elements

        if (observationRoom) observationRoom.classList.add('hidden'); // Hide the object cards (memorization phase is over)
        const timerCapsule = document.getElementById('timer-capsule');
        const progressBar = document.getElementById('timer-progress')?.parentElement;
        if (timerCapsule) timerCapsule.style.display = 'none'; // Hide the countdown timer
        if (progressBar) progressBar.style.display = 'none'; // Hide the progress bar
        if (controls) controls.classList.remove('hidden'); // Show the question panel

        let currentQIdx = 0, score = 0; // Track the current question and the player's correct answers
        let hasShield = activeBoosts.includes('shield'); // Check if the player has a Shield Boost active

        // Randomize question sequence — each object is asked about once, in random order
        const questionSequence = [...roomObjects].sort(() => Math.random() - 0.5);
        const totalQs = questionSequence.length; // Total number of questions equals total objects

        const ask = () => {
            // Displays one question at a time and handles the player's answer
            const currentObj = questionSequence[currentQIdx]; // Get the current object to ask about
            const objData = OBJECT_DATA[currentObj.name]; // Get the SVG icon data for this object

            if (qIconBg) qIconBg.innerHTML = objData.svg; // Display the object's icon in the question card
            qText.innerHTML = `What color was the <span class="ro-highlight">${currentObj.name}</span>?`;
            // Ask "What color was the [object name]?" with highlighted styling
            if (qProgress) qProgress.textContent = `Question ${currentQIdx + 1} / ${totalQs}`;
            // Show progress like "Question 3 / 5"

            ansBtns.innerHTML = ''; // Clear previous answer buttons

            // Generate pool of 4 options (correct + 3 random distractors)
            const colorNames = Object.keys(COLOR_HEX); // All possible color choices
            const distractors = colorNames.filter(c => c !== currentObj.color).sort(() => Math.random() - 0.5).slice(0, 3);
            // Pick 3 random wrong answers (excluding the correct color)
            const pool = [currentObj.color, ...distractors].sort(() => Math.random() - 0.5);
            // Combine correct answer + distractors and shuffle them

            pool.forEach(opt => {
                // Create a button for each answer option
                const hex = COLOR_HEX[opt]; // Get the hex color for the visual dot
                const btn = document.createElement('button');
                btn.className = 'ro-answer-btn';
                btn.innerHTML = `<span class="ro-answer-dot" style="background:${hex};"></span>${opt}`;
                // Each button shows a colored dot + color name
                btn.addEventListener('click', () => {
                    const correct = opt === currentObj.color; // Check if this option matches the correct color
                    if (correct) {
                        score++; // Increase score for correct answers
                        btn.classList.add('correct'); // Green highlight
                        SoundEngine.correct(); // Play success sound
                    } else {
                        if (hasShield) {
                            // Shield Boost: forgives one wrong answer by treating it as correct
                            hasShield = false; // Use up the shield
                            score++; // Grant point as shield usage
                            btn.classList.add('correct');
                            SoundEngine.correct();
                            showToast('🛡️ Shield protected you!'); // Notify player
                        } else {
                            btn.classList.add('wrong'); // Red highlight for wrong answer
                            SoundEngine.wrong(); // Play error sound
                            ansBtns.querySelectorAll('.ro-answer-btn').forEach(b => {
                                if (b.textContent.trim() === currentObj.color) b.classList.add('correct');
                                // Highlight the correct answer so the player can learn
                            });
                        }
                    }

                    ansBtns.querySelectorAll('.ro-answer-btn').forEach(b => b.disabled = true);
                    // Disable all buttons after answering to prevent multiple clicks
                    currentQIdx++; // Move to the next question

                    setTimeout(() => {
                        if (currentQIdx < totalQs) ask(); // Show next question after 800ms delay
                        else finishMemoryLevel(score, totalQs, level); // All questions answered — show results
                    }, 800);
                });
                ansBtns.appendChild(btn); // Add the button to the answer container
            });

            gsap.from('.ro-answer-btn', { opacity: 0, x: -20, stagger: 0.05, duration: 0.4 });
            // Animate answer buttons sliding in from the left with a stagger effect
        };
        ask(); // Start the first question
    }

    function finishMemoryLevel(score, totalQs, level) {
        // Called after all questions are answered — determines if the player passed and awards rewards
        const success = score >= Math.ceil(totalQs * 0.6); // Player needs 60% correct to pass (e.g., 3/5)
        const memData = state.memory;
        const points = score * 10 * level; // Points scale with level — higher levels give more points per correct answer

        let starsEarned = 0; // Stars based on accuracy
        if (score >= 5) starsEarned = 3; // Perfect: 3 stars
        else if (score === 4) starsEarned = 2; // Great: 2 stars
        else if (score === 3) starsEarned = 1; // Good: 1 star

        let coinsEarned = 0;
        if (success) {
            state.stars = (state.stars || 0) + starsEarned;

            // 1 coin every 2 games played
            if (memData.gamesPlayed % 2 === 0) {
                coinsEarned = 1;
                state.coins += coinsEarned;
            }

            memData.level = Math.min(300, level + 1);
            memData.levelsCompleted++;
            memData.hasFailedCurrent = false; // Reset for next level
        } else {
            memData.hasFailedCurrent = true;
        }

        memData.highScore = Math.max(memData.highScore, points);
        DB.save(state);
        updateNavStats();

        // Success sound
        if (success) SoundEngine.fanfare();

        // Sync with backend
        syncScore('memory', score, level, { success, starsEarned });

        // 50 Stars Feature check
        const featuresUnlocked = Math.floor((state.stars || 0) / 50);

        showResultCard({
            icon: success ? '🏆' : '💫',
            title: success ? 'Level Complete!' : 'Level Failed!',
            subtitle: success ? `Star Rating: ${'⭐'.repeat(starsEarned)}` : `You got ${score}/${totalQs} correct. Need 3 to clear.`,
            details: [
                { label: 'Score', value: `${points} pts` },
                { label: 'High Score', value: `${memData.highScore} pts` },
                { label: 'Coins', value: `+${coinsEarned} 🪙` },
                { label: 'Total Stars', value: `${state.stars || 0} ⭐` }
            ],
            primaryLabel: success ? 'Next Level ▶' : 'Replay Level 🔄',
            onPrimary: () => initMemoryGame(),
            secondaryLabel: 'Back to Lobby 🏠',
            onSecondary: () => initMemoryLobby()
        });
    }

    /* =============================================
       GAME 2: F1 REACTION
       Data: bestTime, gamesPlayed
       Spacebar: react when GO, or replay after result
       ============================================= */
    function initF1Game() {
        SoundEngine.startBgMusic('lobby');
        const f1Data = state.f1;

        /* ── Spacebar State Machine ──
           idle     → waiting to start
           waiting  → lights active, waiting for lights out
           react    → lights off, measuring reaction
           finished → reaction recorded, can restart */
        let f1State = 'idle';
        let spaceHeld = false;        // debounce: ignore held key
        let raceTimeout = null;       // setTimeout ID for lights-off delay
        let lightInterval = null;     // setInterval ID for light sequence
        let startTime = null;         // reaction measurement start

        mainContent.innerHTML = `
            ${gameToolbar('F1 Reflex')}
            <div class="view game-container">
                <div class="f1-track glass game-panel" style="text-align:center;">
                    <div class="f1-stats-bar">
                        <span>🏁 Best: ${f1Data.bestTime ? f1Data.bestTime + 'ms' : 'N/A'}</span>
                        <span>🎮 Played: ${f1Data.gamesPlayed}</span>
                    </div>
                    <div class="f1-lights" style="display:flex; gap:20px; justify-content:center; margin: 2rem 0;">
                        ${[1, 2, 3, 4, 5].map(i => `<div id="light-${i}" class="f1-light"></div>`).join('')}
                    </div>
                    <div id="f1-status" class="f1-status-text"></div>
                    <button id="react-btn" class="react-btn hidden">REACT!</button>
                    <button id="start-f1" class="btn-cta" style="width:auto; padding: 15px 50px;">
                        🚦 Start Racing
                    </button>
                    <p id="space-hint" style="margin-top:12px; font-size:0.85rem; opacity:0.6; letter-spacing:1px;">
                        ⌨️ Press <strong>SPACEBAR</strong> to start
                    </p>
                    <div id="f1-result" class="hidden" style="margin-top:2rem;">
                        <div id="f1-leaderboard" class="glass" style="padding:1.5rem; border-radius:20px;"></div>
                    </div>
                </div>
            </div>
        `;

        attachToolbarListeners();

        /* ── Reset UI for a new race ── */
        function raceAgain() {
            // Resets the F1 game UI to its initial state for another race attempt
            // Clean up any pending timers from the previous race
            if (raceTimeout) { clearTimeout(raceTimeout); raceTimeout = null; }
            if (lightInterval) { clearInterval(lightInterval); lightInterval = null; }

            document.getElementById('f1-result')?.classList.add('hidden'); // Hide previous results
            const startBtn = document.getElementById('start-f1');
            const hintEl = document.getElementById('space-hint');
            if (startBtn) startBtn.style.display = ''; // Show the Start button again
            if (hintEl) { hintEl.style.display = ''; hintEl.textContent = '⌨️ Press SPACEBAR to start'; }
            [1, 2, 3, 4, 5].forEach(i => document.getElementById(`light-${i}`)?.classList.remove('on'));
            // Turn off all 5 lights by removing the 'on' class
            const statusEl = document.getElementById('f1-status');
            if (statusEl) { statusEl.textContent = ''; statusEl.style.color = ''; }
            // Clear the status message
            document.getElementById('react-btn')?.classList.add('hidden'); // Hide the REACT button

            f1State = 'idle'; // Reset the state machine to idle
        }

        /* ── Core: Start the race (lights sequence → GO) ── */
        function handleStartRace() {
            // Begins the F1 race sequence: turns on lights one by one, then turns them off after a random delay
            if (f1State !== 'idle') return; // Only start from idle state
            SoundEngine.startBgMusic('lobby');
            f1State = 'waiting'; // Transition to waiting state (lights are turning on)

            const startBtn = document.getElementById('start-f1');
            const statusEl = document.getElementById('f1-status');
            const hintEl = document.getElementById('space-hint');
            if (startBtn) startBtn.style.display = 'none';
            if (hintEl) hintEl.style.display = 'none';
            if (statusEl) { statusEl.textContent = 'Lights turning on…'; statusEl.style.color = ''; }

            let i = 1;
            lightInterval = setInterval(() => {
                if (i <= 5) {
                    document.getElementById(`light-${i}`)?.classList.add('on');
                    SoundEngine.lightBeep();
                    i++;
                } else {
                    clearInterval(lightInterval);
                    lightInterval = null;
                    if (statusEl) statusEl.textContent = 'Get ready…';

                    const delay = 1000 + Math.random() * 2000;
                    raceTimeout = setTimeout(() => {
                        raceTimeout = null;
                        [1, 2, 3, 4, 5].forEach(id => document.getElementById(`light-${id}`)?.classList.remove('on'));
                        if (statusEl) statusEl.innerHTML = '<span style="font-size:2rem;">🟢 GO!</span>';
                        SoundEngine.goBurst();

                        startTime = Date.now();
                        const reactBtn = document.getElementById('react-btn');
                        reactBtn?.classList.remove('hidden');

                        // Allow mouse click on REACT button too
                        reactBtn?.addEventListener('click', handleReact, { once: true });

                        f1State = 'react';
                    }, delay);
                }
            }, 800);
        }

        /* ── Core: Record reaction time ── */
        function handleReact() {
            if (f1State !== 'react') return;
            f1State = 'finished';

            const reactionTime = Date.now() - startTime;
            const reactBtn = document.getElementById('react-btn');
            const statusEl = document.getElementById('f1-status');
            reactBtn?.classList.add('hidden');
            // Remove any leftover click listener
            reactBtn?.removeEventListener('click', handleReact);
            if (statusEl) statusEl.textContent = '';

            showF1Result(reactionTime, raceAgain);
        }

        /* ── False start: pressed Space before lights went off ── */
        function handleFalseStart() {
            // Cancel the pending lights-off timeout
            if (raceTimeout) { clearTimeout(raceTimeout); raceTimeout = null; }
            if (lightInterval) { clearInterval(lightInterval); lightInterval = null; }

            SoundEngine.falseStart();
            const statusEl = document.getElementById('f1-status');
            if (statusEl) {
                statusEl.innerHTML = '<span style="color:#ef4444; font-size:1.5rem; font-weight:800;">⚠️ FALSE START!</span>';
            }

            // Reset back to idle after a brief pause
            setTimeout(() => raceAgain(), 1500);
        }

        /* ── Keyboard handler (Spacebar) ── */
        function onKeyDown(e) {
            if (e.code !== 'Space') return;
            e.preventDefault();               // prevent page scroll
            if (spaceHeld) return;             // debounce held key
            spaceHeld = true;

            switch (f1State) {
                case 'idle': handleStartRace(); break;
                case 'waiting': handleFalseStart(); break;
                case 'react': handleReact(); break;
                case 'finished': raceAgain(); break;
            }
        }

        function onKeyUp(e) {
            if (e.code === 'Space') spaceHeld = false;
        }

        // Attach global keyboard listeners
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        /* ── Cleanup listeners when navigating away ── */
        function cleanupF1Listeners() {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            if (raceTimeout) clearTimeout(raceTimeout);
            if (lightInterval) clearInterval(lightInterval);
        }

        // Hook cleanup into the toolbar back button
        const backBtn = mainContent.querySelector('.toolbar-back');
        backBtn?.addEventListener('click', cleanupF1Listeners);

        // Existing button click → calls the same handler
        document.getElementById('start-f1').addEventListener('click', () => {
            handleStartRace();
        });
    }

    function showF1Result(time, replayCallback) {
        // Displays the F1 Reflex results: player's time, rank against famous F1 drivers, and replay option
        const f1Data = state.f1;
        f1Data.gamesPlayed++; // Increment total games played

        const isNewBest = f1Data.bestTime === null || time < f1Data.bestTime;
        // Check if this is the player's fastest time ever
        if (isNewBest) f1Data.bestTime = time; // Update the stored best time

        DB.save(state); // Persist to localStorage
        updateNavStats(); // Refresh the navbar display
        SoundEngine.fanfare(); // Play the victory fanfare sound

        // Famous F1 drivers and their "benchmark" reaction times for comparison
        const drivers = [
            { name: 'Ayrton Senna', time: 175 },
            { name: 'Michael Schumacher', time: 180 },
            { name: 'Max Verstappen', time: 185 },
            { name: 'Charles Leclerc', time: 195 },
            { name: 'Lewis Hamilton', time: 202 },
            { name: 'Lando Norris', time: 210 },
            { name: 'George Russell', time: 215 }
        ];
        drivers.push({ name: '⭐ YOU', time }); // Add the player's time to the leaderboard
        drivers.sort((a, b) => a.time - b.time); // Sort by fastest time (ascending)
        const rank = drivers.findIndex(d => d.name === '⭐ YOU') + 1; // Find the player's position

        // Sync with backend for server-side leaderboard
        syncScore('f1', time, 1, { rank });

        const resultDiv = document.getElementById('f1-result');
        if (!resultDiv) return;
        resultDiv.classList.remove('hidden');

        const html = `
            <div style="text-align:center; margin-bottom:1.5rem;">
                <div style="font-size:3rem;">${isNewBest ? '🏆' : '🏎️'}</div>
                <h2>Your Time: <span style="color:var(--golden-yellow)">${time}ms</span></h2>
                ${isNewBest ? '<p style="color:#22c55e; font-weight:700;">🎉 New Personal Best!</p>' : ''}
                <p>Rank #${rank} of ${drivers.length}</p>
            </div>
            <table style="width:100%; border-collapse:collapse; text-align:left;">
                <tr style="opacity:0.6;"><th style="padding:8px">#</th><th style="padding:8px">Driver</th><th style="padding:8px">Time</th></tr>
                ${drivers.map((d, idx) => `
                    <tr style="${d.name === '⭐ YOU' ? 'background:rgba(255,215,0,0.15); font-weight:800;' : ''}">
                        <td style="padding:10px 8px">${idx + 1}</td>
                        <td style="padding:10px 8px">${d.name}</td>
                        <td style="padding:10px 8px">${d.time}ms</td>
                    </tr>
                `).join('')}
            </table>
            <div style="display:flex; gap:1rem; margin-top:2rem; justify-content:center; flex-wrap:wrap;">
                <button class="btn-cta" id="race-again-btn" style="width:auto;">
                    🔄 Race Again
                </button>
            </div>
        `;
        document.getElementById('f1-leaderboard').innerHTML = html;

        // Wire up the Race Again button to the callback
        document.getElementById('race-again-btn')?.addEventListener('click', () => replayCallback());
    }


    /* =============================================
       GAME 3: SCHULTE GRID
       Data: bestTimes (per size), gamesPlayed
       ============================================= */

    // Migrate old flat bestTime to new bestTimes object (backwards compatibility)
    (function migrateSchulteState() {
        // Auto-migration: converts old single bestTime to the new per-size bestTimes format
        const s = state.schulte;
        if (!s.bestTimes) {
            s.bestTimes = { '3x3': null, '4x4': null, '5x5': null, '6x6': null };
            // Create the new structure with null (no best time) for each grid size
            if (s.bestTime != null) s.bestTimes['5x5'] = s.bestTime;
            // Preserve any existing best time under the 5x5 category
            delete s.bestTime; // Remove the old field
            DB.save(state); // Save the migrated data
        }
    })(); // Runs immediately on load

    (function migrateConfusionState() {
        // Auto-migration: converts old single highScore to the new per-mode bestScores format
        const c = state.confusion;
        if (!c.bestScores) {
            c.bestScores = { endless: 0, survival: 0, speed: 0 };
            // Create the new structure with 0 for each game mode
            if (c.highScore != null) c.bestScores.endless = c.highScore;
            // Preserve any existing high score under the endless mode
            delete c.highScore; // Remove the old field
            DB.save(state); // Save the migrated data
        }
    })(); // Runs immediately on load

    function initSchulteGame() {
        // Renders the Schulte Grid size selection screen where the player picks 3x3, 4x4, 5x5, or 6x6
        SoundEngine.startBgMusic('lobby'); // Play lobby music
        const schData = state.schulte; // Get Schulte save data
        state.currentStage = 'lobby'; // Set stage for navigation
        // Clear any stale timer from a previous game
        if (state.activeInterval) { clearInterval(state.activeInterval); state.activeInterval = null; }
        // Ensure bestTimes exists (safety) in case migration didn't run
        if (!schData.bestTimes) schData.bestTimes = { '3x3': null, '4x4': null, '5x5': null, '6x6': null };

        const sizes = [
            { key: '3x3', n: 3, label: '3 × 3', sub: '9 numbers', emoji: '🟩' },
            { key: '4x4', n: 4, label: '4 × 4', sub: '16 numbers', emoji: '🟦' },
            { key: '5x5', n: 5, label: '5 × 5', sub: '25 numbers', emoji: '🟨' },
            { key: '6x6', n: 6, label: '6 × 6', sub: '36 numbers', emoji: '🟥' }
        ];

        mainContent.innerHTML = `
            ${gameToolbar('Schulte Grid')}
            <div class="view game-container">
                <div style="text-align:center; padding: 1rem 0 0.5rem;">
                    <h2 style="font-size:2rem; margin-bottom:0.3rem;">🔢 Schulte Grid</h2>
                    <p style="opacity:0.7; margin-bottom:1.5rem;">Choose a grid size to begin</p>
                </div>
                <div class="schulte-size-grid">
                    ${sizes.map(s => `
                        <button class="schulte-size-card" data-size="${s.key}">
                            <div class="schulte-size-emoji">${s.emoji}</div>
                            <div class="schulte-size-label">${s.label}</div>
                            <div class="schulte-size-sub">${s.sub}</div>
                            <div class="schulte-size-best">⏱️ Best: <strong>${schData.bestTimes[s.key] != null ? schData.bestTimes[s.key] + 's' : 'N/A'}</strong></div>
                        </button>
                    `).join('')}
                </div>
                <div style="text-align:center; margin-top:3rem; opacity:0.55; font-size:0.85rem; letter-spacing:1px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem;">🎮 Total Games Played: ${schData.gamesPlayed}</div>
            </div>
        `;

        attachToolbarListeners();

        document.querySelectorAll('.schulte-size-card').forEach(card => {
            card.addEventListener('click', () => {
                const sizeKey = card.getAttribute('data-size');
                const sizeN = parseInt(sizeKey[0]); // '3x3' → 3
                playSchulteGrid(sizeKey, sizeN);
            });
        });
        if (typeof gsap !== 'undefined') {
            gsap.from('.schulte-size-card', { y: 30, stagger: 0.08, duration: 0.5, ease: 'back.out(1.4)' });
        }
    }

    function playSchulteGrid(sizeKey, sizeN) {
        SoundEngine.startBgMusic('lobby');
        // Clear any previous timer to prevent orphaned intervals
        if (state.activeInterval) clearInterval(state.activeInterval);

        const schData = state.schulte;
        state.currentStage = 'playing';
        const total = sizeN * sizeN;
        let numbers = Array.from({ length: total }, (_, i) => i + 1).sort(() => Math.random() - 0.5);

        mainContent.innerHTML = `
            ${gameToolbar('Schulte Grid')}
            <div class="view game-container">
                <div class="schulte-header" style="text-align:center; margin-bottom:1rem;">
                    <h2 style="margin-bottom:0.2rem;">🔢 ${sizeKey} Grid</h2>
                    <p style="opacity:0.7; margin-bottom:0.8rem;">Find numbers 1 → ${total} in order!</p>
                    <div class="schulte-stats-bar">
                        <span>⏱️ Best: ${schData.bestTimes[sizeKey] != null ? schData.bestTimes[sizeKey] + 's' : 'N/A'}</span>
                        <span>Next: <strong id="next-hint">1</strong></span>
                    </div>
                    <div id="schulte-timer" class="timer-display">0.0s</div>
                </div>
                <div id="schulte-grid" class="schulte-grid-container" style="grid-template-columns: repeat(${sizeN}, 1fr);">
                    ${numbers.map(n => `<button class="btn-option schulte-cell" data-val="${n}">${n}</button>`).join('')}
                </div>
            </div>
        `;

        attachToolbarListeners();

        let nextNum = 1;
        let startTime = Date.now();
        schData.gamesPlayed++;
        DB.save(state);

        // Store the timer in state.activeInterval so goBack() can clear it
        state.activeInterval = setInterval(() => {
            const el = document.getElementById('schulte-timer');
            if (el) el.innerText = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
        }, 100);

        document.querySelectorAll('.schulte-cell').forEach(cell => {
            cell.onclick = () => {
                const val = parseInt(cell.getAttribute('data-val'));
                if (val === nextNum) {
                    SoundEngine.correct();
                    cell.classList.add('found');
                    cell.disabled = true;
                    nextNum++;
                    const hint = document.getElementById('next-hint');
                    if (hint) hint.textContent = nextNum <= total ? nextNum : '✅';

                    if (nextNum > total) {
                        clearInterval(state.activeInterval);
                        state.activeInterval = null;
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                        SoundEngine.fanfare();
                        finishSchulte(parseFloat(elapsed), sizeKey, sizeN);
                    }
                } else {
                    SoundEngine.wrong();
                    cell.classList.add('wrong');
                    setTimeout(() => cell.classList.remove('wrong'), 500);
                }
            };
        });
    }

    function finishSchulte(elapsed, sizeKey, sizeN) {
        const schData = state.schulte;
        if (!schData.bestTimes) schData.bestTimes = { '3x3': null, '4x4': null, '5x5': null, '6x6': null };
        const prevBest = schData.bestTimes[sizeKey];
        const isNewBest = prevBest === null || elapsed < prevBest;
        if (isNewBest) schData.bestTimes[sizeKey] = elapsed;
        state.stars += 2;
        DB.save(state);
        updateNavStats();

        // Sync with backend
        syncScore('schulte', elapsed, 1, { size: sizeKey });

        showResultCard({
            icon: isNewBest ? '🏆' : '✅',
            title: isNewBest ? `New ${sizeKey} Record! 🎉` : 'Grid Complete!',
            subtitle: `You finished the ${sizeKey} Schulte Grid in ${elapsed}s`,
            details: [
                { label: 'Grid Size', value: sizeKey },
                { label: 'Your Time', value: `${elapsed}s` },
                { label: 'Best Time', value: `${schData.bestTimes[sizeKey]}s` },
                { label: 'Previous Best', value: prevBest != null ? `${prevBest}s` : 'N/A' },
                { label: 'Stars Earned', value: '+2 ⭐' }
            ],
            primaryLabel: '🔄 Play Again',
            onPrimary: () => playSchulteGrid(sizeKey, sizeN),
            secondaryLabel: '← Choose Size',
            onSecondary: () => initSchulteGame()
        });
    }

    /* =============================================
       ABOUT / HELP / LEADERBOARD VIEWS
       These functions render the static content pages
       ============================================= */
    function renderAbout() {
        // Renders the About page showing the development team and project information
        const developers = [
            { name: 'Siddhi', role: 'Lead Developer', seed: 'Siddhi', color: 'var(--golden-yellow)' },
            { name: 'Yaksh', role: 'Co-Developer', seed: 'Yaksh', color: '#1B5E20', customImg: 'https://api.dicebear.com/7.x/bottts/svg?seed=CyberKnight&eyes=robocop' },
            { name: 'Rudra', role: 'Co-Developer', seed: 'Rudra', color: '#1B5E20', customImg: 'https://api.dicebear.com/7.x/bottts/svg?seed=WebHacker&eyes=eva&mouth=grill03&baseColor=00e676' },
            { name: 'Mayuri', role: 'Collaborator', seed: 'Mayuri', color: '#0D47A1' },
            { name: 'Sakshi', role: 'Collaborator', seed: 'Sakshi', color: '#0D47A1' },
            { name: 'Madhuri', role: 'Collaborator', seed: 'Madhuri', color: '#0D47A1' },
        ];

        const devCards = developers.map(dev => {
            const imgSrc = dev.customImg ? dev.customImg : 'https://api.dicebear.com/7.x/bottts/svg?seed=' + dev.seed;
            return `
            <div style="display:flex; gap:1.2rem; align-items:center; padding:1rem 1.2rem; border-radius:16px; background:rgba(255,255,255,0.04); transition: transform 0.2s, box-shadow 0.2s;"
                 onmouseenter="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.15)';"
                 onmouseleave="this.style.transform=''; this.style.boxShadow='';">
                <img src="${imgSrc}" style="width:70px; border-radius:14px; background:var(--pastel-blue); padding:6px; flex-shrink:0;">
                <div>
                    <h3 style="font-size:1.3rem; margin-bottom:4px;">${dev.name}</h3>
                    <p style="color:${dev.color}; font-weight:700; font-size:0.95rem;">${dev.role}</p>
                </div>
            </div>
        `;
        }).join('');

        mainContent.innerHTML = `
            <div class="view">
                <div class="game-overlay glass" style="text-align:left; max-width:850px;">
                    <h2 style="font-size:3rem; margin-bottom:0.5rem;">About <span class="highlight-yellow">Master Mind</span></h2>
                    <p style="color:var(--text-dim); margin-bottom:2rem; font-size:1.1rem;">Meet the master minds behind the game</p>

                    <h3 style="margin-bottom:1rem; font-size:1.4rem;">👨‍💻 Development Team</h3>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:1rem; margin-bottom:2rem;">
                        ${devCards}
                    </div>

                    <hr style="margin:1.5rem 0; opacity:0.1;">

                    <h3 style="margin-bottom:1rem; font-size:2rem; color: #000000; font-weight: 800; text-transform: capitalize;">Why Master Mind</h3>
                    <p style="line-height:1.9; margin-bottom:2rem; color: #000000; font-size: 1.15rem; font-weight: 500;">
                        Master Mind is a multi-game brain training platform designed to test and improve cognitive skills like memory, reflexes, observation, focus, and logical thinking. It features four engaging mini-games — Room Observer, F1 Reflex, Shuffle Grid, and Stroop Effect: Color Confusion — each targeting a different aspect of mental performance. Players challenge their speed, accuracy, and concentration while competing to improve their scores.
                    </p>

                    <hr style="margin:1.5rem 0; opacity:0.1;">

                    <h3 style="margin-bottom:1rem; font-size:1.4rem;">🛠️ Built With</h3>
                    <div style="display:flex; flex-wrap:wrap; gap:0.8rem; margin-bottom:2rem;">
                        <span style="padding:8px 18px; border-radius:12px; background:rgba(255,255,255,0.06); font-weight:600; font-size:0.95rem;">HTML5</span>
                        <span style="padding:8px 18px; border-radius:12px; background:rgba(255,255,255,0.06); font-weight:600; font-size:0.95rem;">CSS3</span>
                        <span style="padding:8px 18px; border-radius:12px; background:rgba(255,255,255,0.06); font-weight:600; font-size:0.95rem;">JavaScript</span>
                        <span style="padding:8px 18px; border-radius:12px; background:rgba(255,255,255,0.06); font-weight:600; font-size:0.95rem;">Python (Flask)</span>
                        <span style="padding:8px 18px; border-radius:12px; background:rgba(255,255,255,0.06); font-weight:600; font-size:0.95rem;">C++</span>
                    </div>

                    <h3 style="margin-bottom:1rem; font-size:1.4rem;">💻 IDE</h3>
                    <p style="line-height:1.9; margin-bottom:0.5rem;">
                        This game was developed using <span style="color:var(--golden-yellow); font-weight:700;">Antigravity</span> — an AI-powered agentic coding assistant by Google DeepMind, enabling intelligent code generation, seamless collaboration, and rapid development.
                    </p>

                    <button class="btn-cta" style="margin-top:2rem; width:auto;" id="about-back-btn">← Back to Games</button>
                </div>
            </div>
        `;
        document.getElementById('about-back-btn')?.addEventListener('click', goBack);
    }

    function renderHelp() {
        const games = [
            {
                icon: '🏠', title: 'Room Observer', tag: 'Spatial Memory',
                colorClass: 'memory',
                tips: [
                    'Observe 5 objects and their colors carefully.',
                    'You have limited time (10 seconds) to memorize them.',
                    'After observation, answer questions about object positions and colors.',
                    'Correct answers increase your score and memory accuracy.'
                ]
            },
            {
                icon: '🏎️', title: 'F1 Reflex', tag: 'Reaction Speed',
                colorClass: 'f1',
                tips: [
                    'Click or react as quickly as possible when the signal appears.',
                    'Do not click before the signal — that\'s a false start!',
                    'Faster reaction time gives higher points.',
                ]
            },
            {
                icon: '🔢', title: 'Schulte Grid', tag: 'Visual Perception',
                colorClass: 'schulte',
                tips: [
                    'Find numbers in ascending order as fast as possible.',
                    'Focus your vision without moving your eyes too much.',
                    'Speed and accuracy determine your performance.',
                ]
            },
            {
                icon: '🎨', title: 'Color Confusion', tag: 'Stroop Effect',
                colorClass: 'confusion',
                tips: [
                    'Identify the correct color of the word shown.',
                    'Ignore the written text and focus on the color displayed.',
                    'Tests attention and cognitive control.',
                ]
            }
        ];

        mainContent.innerHTML = `
            <div class="view help-section">
                <div class="help-header">
                    <h2 class="help-title">How to <span class="highlight-yellow">Play</span></h2>
                    <p class="help-subtitle">Learn the rules and sharpen your mind before starting.</p>
                </div>
                <div class="help-cards-list">
                    ${games.map((g, i) => `
                        <div class="help-card help-card--${g.colorClass}" style="animation-delay: ${i * 0.1}s">
                            <div class="help-card-icon help-card-icon--${g.colorClass}">${g.icon}</div>
                            <div class="help-card-body">
                                <h3>${g.title} <span class="help-tag">${g.tag}</span></h3>
                                <ul>
                                    ${g.tips.map(t => `<li>${t}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="text-align:center; margin-top:2.5rem;">
                    <button class="btn-cta" style="width:auto; padding:15px 50px;" onclick="location.reload()">🎮 Start Playing</button>
                </div>
            </div>
        `;
        document.getElementById('help-back-btn')?.addEventListener('click', goBack);
    }

    function renderLeaderboard() {
        const memData = state.memory;
        const f1Data = state.f1;
        const schData = state.schulte;

        mainContent.innerHTML = `
            <div class="view">
                <div class="game-overlay glass" style="max-width:800px;">
                    <h2 style="font-size:3rem; margin-bottom:2rem; text-align:center;">📊 Your <span class="highlight-yellow">Stats</span></h2>
                    <div class="leaderboard-grid">
                        <div class="lb-card memory">
                            <h3>🏘️ Room Observer</h3>
                            <div class="lb-stat"><span>Level Reached</span><strong>${memData.level}</strong></div>
                            <div class="lb-stat"><span>High Score</span><strong>${memData.highScore} pts</strong></div>
                            <div class="lb-stat"><span>Games Played</span><strong>${memData.gamesPlayed}</strong></div>
                            <div class="lb-stat"><span>Levels Done</span><strong>${memData.levelsCompleted}</strong></div>
                        </div>
                        <div class="lb-card f1">
                            <h3>🏎️ F1 Reflex</h3>
                            <div class="lb-stat"><span>Best Time</span><strong>${f1Data.bestTime ? f1Data.bestTime + 'ms' : 'N/A'}</strong></div>
                            <div class="lb-stat"><span>Games Played</span><strong>${f1Data.gamesPlayed}</strong></div>
                        </div>
                        <div class="lb-card schulte">
                            <h3>🔢 Schulte Grid</h3>
                            ${(function () {
                const bt = schData.bestTimes || {};
                return ['3x3', '4x4', '5x5', '6x6'].map(k =>
                    `<div class="lb-stat"><span>Best ${k}</span><strong>${bt[k] != null ? bt[k] + 's' : 'N/A'}</strong></div>`
                ).join('');
            })()}
                            <div class="lb-stat"><span>Games Played</span><strong>${schData.gamesPlayed}</strong></div>
                        </div>
                        <div class="lb-card confusion">
                            <h3>🎨 Color Confusion</h3>
                            ${(function () {
                const bs = state.confusion.bestScores || { endless: 0, survival: 0, speed: 0 };
                return [
                    { k: 'endless', l: 'Endless' },
                    { k: 'survival', l: 'Survival' },
                    { k: 'speed', l: 'Speed Run' }
                ].map(m =>
                    `<div class="lb-stat"><span>Best ${m.l}</span><strong>${bs[m.k] || 0} pts</strong></div>`
                ).join('');
            })()}
                            <div class="lb-stat"><span>Games Played</span><strong>${state.confusion.gamesPlayed}</strong></div>
                        </div>
                    </div>
                    <div style="text-align:center; margin-top:2rem; font-size:1.2rem">
                        🪙 Total Coins: <strong>${state.coins}</strong> &nbsp;|&nbsp; ⭐ Total Stars: <strong>${state.stars}</strong>
                    </div>
                    <button class="btn-cta" style="margin-top:2rem; width:auto; display:block; margin-left:auto; margin-right:auto;" id="leaderboard-back-btn">← Back to Games</button>
                </div>
            </div>
        `;
        document.getElementById('leaderboard-back-btn')?.addEventListener('click', goBack);
    }

    /* =============================================
       GAME 4: COLOR CONFUSION — STROOP EFFECT
       ============================================= */
    function initConfusionGame() {
        SoundEngine.startBgMusic('lobby');
        const confData = state.confusion;
        state.currentStage = 'lobby';
        mainContent.innerHTML = `
            ${gameToolbar('Color Confusion')}
            <div class="view game-container" style="background: white;">
                <div class="conf-landing glass" style="background: transparent; box-shadow: none; border: none; max-width: 500px; margin: 0 auto; text-align: center;">
                    <h1 class="conf-title-large">COLOR<br>CONFUSION</h1>
                    <p class="conf-subtitle-small">COGNITIVE REACTION TEST // STROOP EFFECT</p>
                    
                    <button class="mode-btn endless" onclick="startConfusionMode('endless')">
                        <span>ENDLESS</span>
                        <span class="mode-tag">3 LIVES</span>
                    </button>
                    
                    <button class="mode-btn survival" onclick="startConfusionMode('survival')">
                        <span>TIME SURVIVAL</span>
                        <span class="mode-tag">+/- SEC</span>
                    </button>
                    
                    <button class="mode-btn speed" onclick="startConfusionMode('speed')">
                        <span>SPEED RUN</span>
                        <span class="mode-tag">TARGET 50</span>
                    </button>

                    <div class="conf-ver">v1.0.0 // SYSTEM READY</div>
                </div>
            </div>
        `;
        attachToolbarListeners();
    }

    // SoundEngine handles correctly/wrong sounds internally now.
    // Removed old playFeedback function.


    window.startConfusionMode = function (mode) {
        SoundEngine.startBgMusic('lobby');
        const confData = state.confusion;
        state.currentStage = 'playing';
        confData.gamesPlayed++;
        DB.save(state);

        let lives = 3, score = 0, totalPoints = 0, difficulty = 1;
        let timeLeft = (mode === 'survival' ? 60 : 10), target = 50;
        let reactions = [], maxCombo = 0, combo = 0;
        let startTime = Date.now(), questionStartTime = null;

        mainContent.innerHTML = `
            ${gameToolbar('Color Confusion')}
            <div class="view game-container" style="background: white; border-radius: 24px;">
                <div class="conf-header">
                    <div class="score-badge">
                        <span>SCORE</span>
                        <strong id="conf-points">0</strong>
                    </div>
                    <div class="target-badge">
                        <span id="conf-meta-label">@ TARGET</span>
                        <strong id="conf-meta-value">${mode === 'endless' ? 3 : (mode === 'survival' ? 60 : 50)}</strong>
                    </div>
                </div>

                <div class="stroop-central-card" id="stroop-card" style="background: #ffffff; border: 2px solid #e0e0e0; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                    <div id="combo-display" class="combo-badge hidden">Combo x1</div>
                    <div class="stroop-word" id="stroop-word"></div>
                    <div class="card-instruction" style="color: #000;">Select the FONT COLOR</div>
                </div>

                <div id="stroop-options" class="conf-answer-grid"></div>
            </div>
        `;

        attachToolbarListeners();
        const metaLabel = document.getElementById('conf-meta-label');
        const metaValue = document.getElementById('conf-meta-value');
        const pointsEl = document.getElementById('conf-points');

        state.activeInterval = setInterval(() => {
            if (mode === 'survival') {
                timeLeft = Math.max(0, timeLeft - 0.1);
                if (metaValue) metaValue.innerText = timeLeft.toFixed(1) + 's';

                // Heartbeat urgency for Survival Mode
                if (timeLeft <= 5 && timeLeft > 0) {
                    SoundEngine.startHeartbeatLoop();
                } else if (timeLeft <= 0) {
                    SoundEngine.stopHeartbeatLoop();
                }

                if (timeLeft <= 0) {
                    clearInterval(state.activeInterval);
                    finishRefinedConfusion({ mode, score, totalPoints, reactions, maxCombo, startTime });
                }
            } else if (mode === 'speed') {
                if (metaValue) metaValue.innerText = (target - score);
                if (score >= target) {
                    clearInterval(state.activeInterval);
                    finishRefinedConfusion({ mode, score, totalPoints, reactions, maxCombo, startTime });
                }
            } else {
                if (metaValue) metaValue.innerText = lives;
                if (lives <= 0) {
                    clearInterval(state.activeInterval);
                    finishRefinedConfusion({ mode, score, totalPoints, reactions, maxCombo, startTime });
                }
            }
        }, 100);

        const ask = () => {
            const WORD_LIST = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];
            const fontColorName = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
            let textColorName = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];

            if (textColorName === fontColorName) {
                textColorName = WORD_LIST.find(c => c !== fontColorName) || 'Black';
            }

            const wordEl = document.getElementById('stroop-word');
            const optionsEl = document.getElementById('stroop-options');
            const comboEl = document.getElementById('combo-display');

            if (wordEl) {
                wordEl.innerText = textColorName.toUpperCase();
                wordEl.style.color = COLOR_HEX[fontColorName];
                wordEl.classList.toggle('streak-glow', combo >= 5);
            }

            questionStartTime = Date.now();
            let options = [fontColorName, textColorName]; // Always include the word itself as a distractor
            const distractors = WORD_LIST.filter(c => !options.includes(c));
            while (options.length < 4) {
                const rand = distractors[Math.floor(Math.random() * distractors.length)];
                if (!options.includes(rand)) options.push(rand);
            }
            options.sort(() => Math.random() - 0.5);

            if (optionsEl) {
                optionsEl.innerHTML = '';
                options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'conf-answer-btn';
                    btn.setAttribute('data-color', opt.toUpperCase());
                    btn.innerText = opt.toUpperCase();
                    btn.style.color = '#000000';
                    btn.style.backgroundColor = '#f0f0f0';
                    btn.style.border = '2px solid #e0e0e0';
                    btn.onclick = () => {
                        const RT = Date.now() - questionStartTime;
                        reactions.push(RT);

                        if (opt === fontColorName) {
                            score++;
                            combo++;
                            maxCombo = Math.max(maxCombo, combo);
                            SoundEngine.correct();

                            const basePoints = 10;
                            const speedBonus = Math.max(0, Math.floor((2000 - RT) / 100)); // 2s window for bonus
                            const multiplier = 1 + (combo * 0.1);
                            totalPoints += Math.round((basePoints + speedBonus) * multiplier);

                            if (score % 5 === 0) difficulty = Math.min(10, difficulty + 0.5);

                            if (pointsEl) {
                                pointsEl.innerText = totalPoints;
                                pointsEl.classList.remove('score-bump-anim');
                                void pointsEl.offsetWidth;
                                pointsEl.classList.add('score-bump-anim');
                            }

                            if (mode === 'survival') timeLeft += 3;

                            btn.classList.add('correct');
                            setTimeout(ask, 100);
                        } else {
                            combo = 0;
                            SoundEngine.wrong();
                            if (comboEl) comboEl.classList.add('hidden');
                            btn.classList.add('wrong');

                            if (mode === 'endless') lives--;
                            else if (mode === 'survival') timeLeft = Math.max(0, timeLeft - 3);
                            else if (mode === 'speed') totalPoints = Math.max(0, totalPoints - 5);

                            const card = document.getElementById('stroop-card');
                            if (card) {
                                card.classList.remove('shake-anim', 'wrong-flash-anim');
                                void card.offsetWidth;
                                card.classList.add('shake-anim', 'wrong-flash-anim');
                            }
                            setTimeout(ask, 300);
                        }
                    };
                    optionsEl.appendChild(btn);
                });
            }
        };

        if (mode === 'endless') metaLabel.innerHTML = '❤️ LIVES';
        else if (mode === 'survival') metaLabel.innerHTML = '🕒 TIME';
        else metaLabel.innerHTML = '🎯 @ TARGET';

        ask();
    };

    function finishRefinedConfusion({ mode, score, totalPoints, reactions, maxCombo, startTime }) {
        const confData = state.confusion;
        if (!confData.bestScores) confData.bestScores = { endless: 0, survival: 0, speed: 0 };

        const prevBest = confData.bestScores[mode] || 0;
        const isNewBest = totalPoints > prevBest;
        if (isNewBest) confData.bestScores[mode] = totalPoints;

        const finalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const avgRT = reactions.length > 0 ? (reactions.reduce((a, b) => a + b, 0) / reactions.length).toFixed(0) : 'N/A';

        let rating = "Trainee";
        if (avgRT < 600 && score > 40) rating = "Grandmaster";
        else if (avgRT < 800 && score > 25) rating = "Expert";
        else if (avgRT < 1000 && score > 15) rating = "Advanced";

        state.coins += Math.floor(totalPoints / 100);
        state.stars += Math.floor(score / 10);
        DB.save(state);
        updateNavStats();
        syncScore('confusion', totalPoints, 1, { mode, avgRT, rating, isNewBest });

        showResultCard({
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 80px; height: 80px; color: var(--mode-${mode});"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
            title: 'Calibration Complete',
            subtitle: `MODE: ${mode.toUpperCase()} // RATING: ${rating.toUpperCase()}`,
            details: [
                { label: 'Total Points', value: totalPoints },
                { label: 'Hits', value: score },
                { label: 'Avg Reaction', value: `${avgRT}ms` },
                { label: 'Longest Streak', value: `x${maxCombo}` }
            ],
            primaryLabel: 'Repeat Calibration',
            onPrimary: () => initConfusionGame()
        });
    }

});
