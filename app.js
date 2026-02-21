/**
 * Master Mind - Core Application Logic
 * Features: Tabs, 3 Games, Back/Home nav, localStorage persistence per game
 */

document.addEventListener('DOMContentLoaded', () => {

    /* =============================================
       PERSISTENT STORAGE — per-game data in localStorage
       ============================================= */
    const DB = {
        load() {
            return JSON.parse(localStorage.getItem('mastermind_data') || 'null') || {
                coins: 0,
                stars: 0,
                memory: { level: 1, highScore: 0, gamesPlayed: 0, levelsCompleted: 0, hasFailedCurrent: false },
                f1: { bestTime: null, gamesPlayed: 0 },
                schulte: { bestTime: null, gamesPlayed: 0 },
                confusion: { highScore: 0, gamesPlayed: 0 }
            };
        },
        save(data) {
            localStorage.setItem('mastermind_data', JSON.stringify(data));
        }
    };

    const API_URL = 'http://127.0.0.1:5000/api';

    // Live state (loaded from DB on startup)
    const state = {
        user: JSON.parse(localStorage.getItem('mastermind_user') || 'null'),
        currentView: 'home',
        currentGame: null,
        ...DB.load()
    };

    async function syncScore(gameType, score, level = 1, extraData = {}) {
        if (!state.user) return;
        try {
            const response = await fetch(`${API_URL}/save-progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: state.user.id,
                    game_type: gameType,
                    score: score,
                    level: level,
                    coins_gained: gameType === 'memory' ? (score >= Math.ceil(5 * 0.6) ? 1 : 0) : (gameType === 'f1' ? 20 : (gameType === 'schulte' ? 30 : Math.floor(score / 10))),
                    stars_gained: gameType === 'memory' ? (score === 5 ? 3 : (score >= 4 ? 2 : (score >= 3 ? 1 : 0))) : (gameType === 'schulte' ? 2 : (gameType === 'confusion' ? Math.floor(score / 5) : 0)),
                    extra_data: extraData
                })
            });
            const data = await response.json();
            if (data.status === 'success') {
                state.coins = data.coins;
                state.stars = data.stars;
                updateNavStats();
                DB.save(state);
            }
        } catch (e) {
            console.error("Backend sync failed:", e);
        }
    }

    /* =============================================
       DOM REFS
       ============================================= */
    const loader = document.getElementById('loader');
    const app = document.getElementById('app');
    const mainContent = document.getElementById('main-content');
    const loginBtn = document.getElementById('login-btn');
    const authModal = document.getElementById('auth-modal');
    const googleLogin = document.getElementById('google-login');

    /* =============================================
       INIT
       ============================================= */
    init();

    function init() {
        updateNavStats();

        let progress = 0;
        const progressFill = document.getElementById('loader-progress');
        const interval = setInterval(() => {
            progress += Math.random() * 30;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                hideLoader();
            }
            if (progressFill) progressFill.style.width = `${progress}%`;
        }, 200);

        if (state.user) {
            loginBtn.classList.add('hidden');
            const userInfo = document.getElementById('user-info');
            userInfo.classList.remove('hidden');
            const nameEl = userInfo.querySelector('.user-name');
            if (nameEl) nameEl.textContent = state.user.username;
        }

        setupEventListeners();
    }

    function hideLoader() {
        gsap.to(loader, {
            opacity: 0, duration: 0.8,
            onComplete: () => {
                loader.classList.add('hidden');
                app.classList.remove('hidden');
                gsap.from('.hero', { opacity: 0, y: 30, duration: 1 });
                gsap.from('.game-card-expanded', { opacity: 0, y: 30, duration: 1, stagger: 0.2, delay: 0.3 });
            }
        });
    }

    function updateNavStats() {
        const coinEl = document.getElementById('coin-count');
        const starEl = document.getElementById('star-count');
        if (coinEl) coinEl.textContent = state.coins;
        if (starEl) starEl.textContent = state.stars;
    }

    /* =============================================
       EVENT LISTENERS
       ============================================= */
    function setupEventListeners() {
        // Navbar links
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                switchView(item.getAttribute('data-view'));
            });
        });

        // Game Mode Card Switching
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

        // Play buttons on home tab cards
        document.querySelectorAll('.play-game-btn').forEach(btn => {
            btn.addEventListener('click', () => startGame(btn.getAttribute('data-game')));
        });

        // Auth
        loginBtn.addEventListener('click', () => authModal.classList.remove('hidden'));
        document.querySelector('.close-modal').addEventListener('click', () => authModal.classList.add('hidden'));
        googleLogin.addEventListener('click', handleGoogleLogin);
        document.getElementById('gmail-login').addEventListener('click', handleGoogleLogin);
    }

    /* =============================================
       VIEW ROUTING
       ============================================= */
    function switchView(view) {
        state.currentView = view;

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-view') === view);
        });

        if (view === 'home') {
            location.reload();
        } else if (view === 'about') {
            renderAbout();
        } else if (view === 'help') {
            renderHelp();
        } else if (view === 'leaderboard') {
            renderLeaderboard();
        } else {
            mainContent.innerHTML = `<div class='view'><h2>${view.charAt(0).toUpperCase() + view.slice(1)} Coming Soon</h2></div>`;
        }
    }

    function goHome() {
        location.reload();
    }

    function goBack() {
        // Returns to home tab selection (game lobby)
        location.reload();
    }

    /* =============================================
       GAME TOOLBAR — Back & Home buttons injected into every game
       ============================================= */
    function gameToolbar(gameTitle) {
        return `
            <div class="game-toolbar">
                <button class="toolbar-btn" id="btn-back" onclick="">
                    <span>&#8592;</span> Back
                </button>
                <span class="toolbar-title">${gameTitle}</span>
                <button class="toolbar-btn home-btn" id="btn-home" onclick="">
                    🏠 Home
                </button>
            </div>
        `;
    }

    function attachToolbarListeners() {
        const backBtn = document.getElementById('btn-back');
        const homeBtn = document.getElementById('btn-home');
        if (backBtn) backBtn.addEventListener('click', goBack);
        if (homeBtn) homeBtn.addEventListener('click', goHome);
    }

    /* =============================================
       AUTH
       ============================================= */
    async function handleGoogleLogin() {
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'player@example.com',
                    username: 'Master Player'
                })
            });
            const data = await response.json();
            if (data.status === 'success') {
                state.user = data.user;
                localStorage.setItem('mastermind_user', JSON.stringify(state.user));
                state.coins = data.user.coins;
                state.stars = data.user.stars;

                loginBtn.classList.add('hidden');
                const userInfo = document.getElementById('user-info');
                userInfo.classList.remove('hidden');
                userInfo.querySelector('.user-name').textContent = state.user.username;
                authModal.classList.add('hidden');
                updateNavStats();
                showToast(`✅ Logged in as ${state.user.username}!`);
            }
        } catch (e) {
            // Fallback for offline
            state.user = { id: 1, username: 'Master Player' };
            loginBtn.classList.add('hidden');
            document.getElementById('user-info').classList.remove('hidden');
            authModal.classList.add('hidden');
            showToast('⚠️ Offline Mode: Logged in locally');
        }
    }

    /* =============================================
       TOAST NOTIFICATION
       ============================================= */
    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    /* =============================================
       RESULT CARD (replaces alert popups)
       ============================================= */
    function showResultCard({ icon, title, subtitle, details = [], onPrimary, primaryLabel, onSecondary, secondaryLabel }) {
        const card = document.createElement('div');
        card.className = 'result-overlay';
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
        document.body.appendChild(card);
        setTimeout(() => card.classList.add('show'), 10);

        document.getElementById('res-primary').addEventListener('click', () => {
            card.remove();
            onPrimary();
        });
        if (secondaryLabel) {
            document.getElementById('res-secondary').addEventListener('click', () => {
                card.remove();
                onSecondary();
            });
        }
    }

    /* =============================================
       GAME DISPATCHER
       ============================================= */
    function startGame(gameId) {
        state.currentGame = gameId;
        if (gameId === 'memory') initMemoryGame();
        else if (gameId === 'f1') initF1Game();
        else if (gameId === 'schulte') initSchulteGame();
        else if (gameId === 'confusion') initConfusionGame();
    }

    /* =============================================
       GAME 1: ROOM OBSERVER — PREMIUM REDESIGN
       Icon cards · Lavender timer · Glass question panel
       ============================================= */

    // ── Per-object SVG icons + card palette ───────────────────────────────
    const OBJECT_DATA = {
        Flower: {
            bg: '#FFF0EE',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="36" cy="36" r="8" fill="currentColor" opacity="0.4"/>
                <path d="M36 28 Q36 12 48 12 Q56 12 56 24 Q56 36 36 36" stroke="currentColor" stroke-width="4"/>
                <path d="M36 28 Q36 12 24 12 Q16 12 16 24 Q16 36 36 36" stroke="currentColor" stroke-width="4"/>
                <path d="M36 44 Q36 60 48 60 Q56 60 56 48 Q56 36 36 36" stroke="currentColor" stroke-width="4"/>
                <path d="M36 44 Q36 60 24 60 Q16 60 16 48 Q16 36 36 36" stroke="currentColor" stroke-width="4"/>
                <circle cx="36" cy="36" r="6" stroke="currentColor" stroke-width="3"/>
            </svg>`
        },
        Airplane: {
            bg: '#E8FBFB',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M36 10 L40 28 L62 36 L40 44 L36 62 L32 44 L10 36 L32 28 Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                <path d="M36 28 V44 M32 36 H40" stroke="currentColor" stroke-width="3" opacity="0.5"/>
            </svg>`
        },
        Phone: {
            bg: '#FFF8ED',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 20 C20 15 25 10 36 10 C47 10 52 15 52 20 C52 35 35 52 20 52 C15 52 10 47 10 36 C10 25 15 20 20 20Z" stroke="currentColor" stroke-width="4"/>
                <rect x="24" y="24" width="24" height="24" rx="4" stroke="currentColor" stroke-width="3" opacity="0.4"/>
            </svg>`
        },
        Sun: {
            bg: '#EAF4FF',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="36" cy="36" r="14" stroke="currentColor" stroke-width="4"/>
                <line x1="36" y1="8" x2="36" y2="16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <line x1="36" y1="56" x2="36" y2="64" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <line x1="8" y1="36" x2="16" y2="36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <line x1="56" y1="36" x2="64" y2="36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
            </svg>`
        },
        Wristwatch: {
            bg: '#FFF3E8',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="30" y="8" width="12" height="56" rx="4" stroke="currentColor" stroke-width="4" opacity="0.3"/>
                <circle cx="36" cy="36" r="18" fill="white" stroke="currentColor" stroke-width="4"/>
                <path d="M36 36 L36 26 M36 36 L44 36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
            </svg>`
        },
        "Paint Palette": {
            bg: '#FFF0EE',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 36 C12 20 25 10 36 10 C47 10 60 20 60 36 C60 52 47 62 36 62 C25 62 12 52 12 36Z" stroke="currentColor" stroke-width="4"/>
                <circle cx="25" cy="28" r="4" fill="currentColor"/>
                <circle cx="47" cy="28" r="4" fill="currentColor" opacity="0.6"/>
                <circle cx="36" cy="48" r="4" fill="currentColor" opacity="0.3"/>
            </svg>`
        },
        Book: {
            bg: '#F0EDFF',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="15" y="10" width="42" height="52" rx="4" stroke="currentColor" stroke-width="4"/>
                <line x1="25" y1="10" x2="25" y2="62" stroke="currentColor" stroke-width="4"/>
            </svg>`
        },
        Clock: {
            bg: '#F0FDF4',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="36" cy="36" r="28" stroke="currentColor" stroke-width="4"/>
                <path d="M36 36 L36 20 M36 36 L50 36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
            </svg>`
        },
        Trophy: {
            bg: '#FEFCE8',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 15 H52 L48 45 C46 52 40 55 36 55 C32 55 26 52 24 45 Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
                <path d="M20 25 H15 V35 H20 M52 25 H57 V35 H52" stroke="currentColor" stroke-width="4"/>
                <path d="M30 65 H42 M36 55 V65" stroke="currentColor" stroke-width="4"/>
            </svg>`
        },
        Radio: {
            bg: '#FDF2F8',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="25" width="52" height="35" rx="6" stroke="currentColor" stroke-width="4"/>
                <circle cx="28" cy="42" r="8" stroke="currentColor" stroke-width="3" opacity="0.5"/>
                <circle cx="48" cy="42" r="5" fill="currentColor"/>
                <path d="M20 15 L25 25" stroke="currentColor" stroke-width="4"/>
            </svg>`
        },
        Camera: {
            bg: '#EAF4FF',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="20" width="52" height="38" rx="6" stroke="currentColor" stroke-width="4"/>
                <circle cx="36" cy="39" r="10" stroke="currentColor" stroke-width="4"/>
                <rect x="20" y="14" width="12" height="6" fill="currentColor"/>
            </svg>`
        },
        Gift: {
            bg: '#FFF0EE',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="14" y="24" width="44" height="36" rx="4" stroke="currentColor" stroke-width="4"/>
                <rect x="12" y="18" width="48" height="8" rx="2" fill="currentColor"/>
                <path d="M36 18 V60 M14 42 H58" stroke="currentColor" stroke-width="2" opacity="0.5"/>
            </svg>`
        },
        Umbrella: {
            bg: '#FDF2F8',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 36 C10 22 21 10 36 10 C51 10 62 22 62 36 H10Z" stroke="currentColor" stroke-width="4"/>
                <path d="M36 36 V56 C36 61 30 61 30 56" stroke="currentColor" stroke-width="4" fill="none"/>
            </svg>`
        },
        Statue: {
            bg: '#F3F4F6',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="36" cy="22" r="10" stroke="currentColor" stroke-width="4"/>
                <path d="M20 60 L24 35 H48 L52 60 H20Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
            </svg>`
        },
        Lamp: {
            bg: '#FEFCE8',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 52 H48 L40 24 H32 Z" stroke="currentColor" stroke-width="4"/>
                <path d="M36 52 V65 M28 65 H44" stroke="currentColor" stroke-width="4"/>
            </svg>`
        },
        Vase: {
            bg: '#FFF7ED',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M36 10 C28 10 22 18 22 28 C22 45 30 62 36 62 C42 62 50 45 50 28 C50 18 44 10 36 10Z" stroke="currentColor" stroke-width="4"/>
            </svg>`
        },
        Ring: {
            bg: '#F0F9FF',
            svg: `<svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="36" cy="42" r="18" stroke="currentColor" stroke-width="6"/>
                <path d="M36 24 L42 12 L36 4 L30 12 Z" fill="currentColor"/>
            </svg>`
        }
    };

    // Colour → CSS hex used for bullet dots and colour-chips in the question card
    const COLOR_HEX = {
        Red: '#ef4444', Blue: '#3b82f6', Green: '#22c55e',
        Yellow: '#eab308', Purple: '#a855f7', Orange: '#f97316',
        Pink: '#ff29ff', Cyan: '#06b6d4', Indigo: '#6366f1',
        Violet: '#8b5cf6', Lavender: '#a78bfa', Beige: '#f5f5dc',
        Brown: '#78350f', White: '#ffffff', Black: '#1a1a1a'
    };

    function getRoomTheme(level) {
        const index = Math.floor((level - 1) / 50);
        const themes = [
            'transparent', // Default
            'linear-gradient(135deg, rgba(26,26,46,0.8) 0%, rgba(22,33,62,0.8) 100%)', // Midnight
            'linear-gradient(135deg, rgba(75,108,183,0.8) 0%, rgba(24,40,72,0.8) 100%)', // Ocean
            'linear-gradient(135deg, rgba(15,32,39,0.8) 0%, rgba(44,83,100,0.8) 100%)', // Emerald
            'linear-gradient(135deg, rgba(55,59,68,0.8) 0%, rgba(66,134,244,0.8) 100%)', // Electric
            'linear-gradient(135deg, rgba(131,58,180,0.8) 0%, rgba(253,29,29,0.8) 100%)' // Sunset
        ];
        return themes[index] || themes[0];
    }

    function initMemoryGame() {
        const memData = state.memory;
        let level = memData.level;
        let objectCount = 5 + Math.floor((level - 1) / 5);
        let timerSeconds = 10 + Math.floor((level - 1) / 5) * 2;
        const totalTime = timerSeconds;

        const colorNames = Object.keys(COLOR_HEX);
        const objectNames = Object.keys(OBJECT_DATA);

        // Build a unique set of room objects
        const shuffled = [...objectNames].sort(() => Math.random() - 0.5);
        const roomObjects = shuffled.slice(0, Math.min(objectCount, objectNames.length)).map(name => ({
            name,
            color: colorNames[Math.floor(Math.random() * colorNames.length)]
        }));

        mainContent.innerHTML = `
            ${gameToolbar('Room Observer')}
            <div class="view game-container ro-root" style="background: ${getRoomTheme(level)}; transition: background 0.5s ease; border-radius: 24px;">
                <!-- Header -->
                <div class="ro-header">
                    <div class="level-badge">Level ${level} / 300</div>
                    <h2 class="ro-title">Room Observer</h2>
                    <div class="memory-stats-bar">
                        <span>🏆 ${memData.highScore} pts</span>
                        <span>⭐ ${state.stars || 0} stars</span>
                        <span>🎮 ${memData.gamesPlayed} played</span>
                    </div>
                </div>

                <div class="ro-timer-capsule" id="timer-capsule">
                    <span id="game-timer" class="ro-timer-text">${timerSeconds}s</span>
                </div>

                ${state.coins >= 100 ? `
                    <div style="text-align:center; margin-bottom:1rem;">
                        <button class="btn-cta" id="buy-extra-time" style="padding: 5px 15px; font-size: 0.8rem;">
                            ⏳ Buy +5s (100 🪙)
                        </button>
                    </div>
                ` : ''}

                <div class="ro-progress-bar">
                    <div class="ro-progress-fill" id="timer-progress"></div>
                </div>

                <div id="observation-room" class="ro-card-grid">
                    ${roomObjects.map(obj => {
            const data = OBJECT_DATA[obj.name] || OBJECT_DATA['Flower'];
            const hex = COLOR_HEX[obj.color] || '#888';
            return `
                        <div class="ro-icon-card" style="background: ${data.bg}; color: ${hex};">
                            <div class="ro-icon-wrap">${data.svg}</div>
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

        let buyBtn = document.getElementById('buy-extra-time');
        if (buyBtn) {
            buyBtn.onclick = () => {
                if (state.coins >= 100) {
                    state.coins -= 100;
                    timerSeconds += 5;
                    const timerEl = document.getElementById('game-timer');
                    if (timerEl) timerEl.innerText = `${timerSeconds}s`;
                    buyBtn.disabled = true;
                    buyBtn.innerText = '✅ Added';
                    updateNavStats();
                    DB.save(state);
                }
            };
        }

        const progressEl = document.getElementById('timer-progress');
        const interval = setInterval(() => {
            timerSeconds--;
            const timerEl = document.getElementById('game-timer');
            if (timerEl) timerEl.innerText = `${timerSeconds}s`;
            if (progressEl) progressEl.style.width = `${(timerSeconds / totalTime) * 100}%`;
            if (timerSeconds <= 3 && timerSeconds > 0) {
                document.getElementById('timer-capsule')?.classList.add('urgent');
            }
            if (timerSeconds <= 0) {
                clearInterval(interval);
                showMemoryQuestions(roomObjects, level);
            }
        }, 1000);
    }

    function showMemoryQuestions(roomObjects, level) {
        const observationRoom = document.getElementById('observation-room');
        const controls = document.getElementById('game-controls');
        const qText = document.getElementById('question-text');
        const ansBtns = document.getElementById('answer-buttons');
        const qProgress = document.getElementById('q-progress');
        const qIconBg = document.getElementById('question-icon-bg');

        if (observationRoom) observationRoom.classList.add('hidden');
        const timerCapsule = document.getElementById('timer-capsule');
        const progressBar = document.getElementById('timer-progress')?.parentElement;
        const buyBtn = document.getElementById('buy-extra-time');
        if (timerCapsule) timerCapsule.style.display = 'none';
        if (progressBar) progressBar.style.display = 'none';
        if (buyBtn) buyBtn.style.display = 'none';
        if (controls) controls.classList.remove('hidden');

        let currentQ = 0, score = 0;
        const totalQs = roomObjects.length;
        const colorNames = Object.keys(COLOR_HEX);

        const ask = () => {
            const randomObj = roomObjects[Math.floor(Math.random() * roomObjects.length)];
            const objData = OBJECT_DATA[randomObj.name] || OBJECT_DATA['Flower'];

            if (qIconBg) qIconBg.innerHTML = objData.svg;
            qText.innerHTML = `What color was the <span class="ro-highlight">${randomObj.name}</span>?`;
            if (qProgress) qProgress.textContent = `Progress: ${currentQ + 1} / ${totalQs}`;

            ansBtns.innerHTML = '';
            const pool = [...new Set([randomObj.color, ...colorNames])].slice(0, 4);
            pool.sort(() => Math.random() - 0.5).forEach(opt => {
                const hex = COLOR_HEX[opt] || '#888';
                const btn = document.createElement('button');
                btn.className = 'ro-answer-btn';
                btn.innerHTML = `<span class="ro-answer-dot" style="background:${hex};"></span>${opt}`;
                btn.addEventListener('click', () => {
                    const correct = opt === randomObj.color;
                    if (correct) {
                        score++;
                        // state.stars = (state.stars || 0) + 1; // Stars are now awarded at the end
                        btn.classList.add('correct');
                    } else {
                        btn.classList.add('wrong');
                        ansBtns.querySelectorAll('.ro-answer-btn').forEach(b => {
                            if (b.textContent.trim() === randomObj.color) b.classList.add('correct');
                        });
                    }
                    ansBtns.querySelectorAll('.ro-answer-btn').forEach(b => b.disabled = true);
                    currentQ++;
                    updateNavStats();
                    DB.save(state);
                    setTimeout(() => {
                        if (currentQ < totalQs) ask();
                        else finishMemoryLevel(score, totalQs, level);
                    }, 800);
                });
                ansBtns.appendChild(btn);
            });
        };
        ask();
    }

    function finishMemoryLevel(score, totalQs, level) {
        const success = score >= Math.ceil(totalQs * 0.6); // Minimum 60% (3/5) to clear
        const memData = state.memory;
        const points = score * 10 * level;

        let starsEarned = 0;
        if (score === totalQs) starsEarned = 3;
        else if (score >= Math.ceil(totalQs * 0.8)) starsEarned = 2;
        else if (score >= Math.ceil(totalQs * 0.6)) starsEarned = 1;

        let coinsEarned = 0;
        if (success) {
            state.stars = (state.stars || 0) + starsEarned;
            if (!memData.hasFailedCurrent) {
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
            secondaryLabel: '🏠 Home',
            onSecondary: () => goHome()
        });
    }

    /* =============================================
       GAME 2: F1 REACTION
       Data: bestTime, gamesPlayed
       Spacebar: react when GO, or replay after result
       ============================================= */
    function initF1Game() {
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
            // Clean up any pending timers
            if (raceTimeout) { clearTimeout(raceTimeout); raceTimeout = null; }
            if (lightInterval) { clearInterval(lightInterval); lightInterval = null; }

            document.getElementById('f1-result')?.classList.add('hidden');
            const startBtn = document.getElementById('start-f1');
            const hintEl = document.getElementById('space-hint');
            if (startBtn) startBtn.style.display = '';
            if (hintEl) { hintEl.style.display = ''; hintEl.textContent = '⌨️ Press SPACEBAR to start'; }
            [1, 2, 3, 4, 5].forEach(i => document.getElementById(`light-${i}`)?.classList.remove('on'));
            const statusEl = document.getElementById('f1-status');
            if (statusEl) { statusEl.textContent = ''; statusEl.style.color = ''; }
            document.getElementById('react-btn')?.classList.add('hidden');

            f1State = 'idle';
        }

        /* ── Core: Start the race (lights sequence → GO) ── */
        function handleStartRace() {
            if (f1State !== 'idle') return;
            f1State = 'waiting';

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

        // Hook cleanup into the toolbar back/home buttons
        const backBtn = mainContent.querySelector('.toolbar-back');
        const homeBtn = mainContent.querySelector('.toolbar-home');
        backBtn?.addEventListener('click', cleanupF1Listeners);
        homeBtn?.addEventListener('click', cleanupF1Listeners);

        // Existing button click → calls the same handler
        document.getElementById('start-f1').addEventListener('click', handleStartRace);
    }

    function showF1Result(time, replayCallback) {
        const f1Data = state.f1;
        f1Data.gamesPlayed++;

        const isNewBest = f1Data.bestTime === null || time < f1Data.bestTime;
        if (isNewBest) f1Data.bestTime = time;

        state.coins += 20;
        DB.save(state);
        updateNavStats();

        const drivers = [
            { name: 'Ayrton Senna', time: 175 },
            { name: 'Michael Schumacher', time: 180 },
            { name: 'Max Verstappen', time: 185 },
            { name: 'Charles Leclerc', time: 195 },
            { name: 'Lewis Hamilton', time: 202 },
            { name: 'Lando Norris', time: 210 },
            { name: 'George Russell', time: 215 }
        ];
        drivers.push({ name: '⭐ YOU', time });
        drivers.sort((a, b) => a.time - b.time);
        const rank = drivers.findIndex(d => d.name === '⭐ YOU') + 1;

        // Sync with backend
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
                <button class="btn-outline" onclick="location.reload()">🏠 Home</button>
            </div>
        `;
        document.getElementById('f1-leaderboard').innerHTML = html;

        // Wire up the Race Again button to the callback
        document.getElementById('race-again-btn')?.addEventListener('click', () => replayCallback());
    }


    /* =============================================
       GAME 3: SCHULTE GRID
       Data: bestTime, gamesPlayed
       ============================================= */
    function initSchulteGame() {
        const schData = state.schulte;
        let numbers = Array.from({ length: 25 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);

        mainContent.innerHTML = `
            ${gameToolbar('Schulte Grid')}
            <div class="view game-container">
                <div class="schulte-header" style="text-align:center; margin-bottom:2rem;">
                    <h2>Schulte Grid</h2>
                    <p>Find numbers 1 → 25 in order as fast as you can!</p>
                    <div class="schulte-stats-bar">
                        <span>⏱️ Best: ${schData.bestTime ? schData.bestTime + 's' : 'N/A'}</span>
                        <span>🎮 Played: ${schData.gamesPlayed}</span>
                        <span id="next-hint">Next: <strong>1</strong></span>
                    </div>
                    <div id="schulte-timer" class="timer-display">0.0s</div>
                </div>
                <div id="schulte-grid" class="schulte-grid-container">
                    ${numbers.map(n => `<button class="btn-option schulte-cell" data-val="${n}">${n}</button>`).join('')}
                </div>
            </div>
        `;

        attachToolbarListeners();

        let nextNum = 1;
        let startTime = Date.now();
        schData.gamesPlayed++;
        DB.save(state);

        const timerInt = setInterval(() => {
            const el = document.getElementById('schulte-timer');
            if (el) el.innerText = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
        }, 100);

        document.querySelectorAll('.schulte-cell').forEach(cell => {
            cell.onclick = () => {
                const val = parseInt(cell.getAttribute('data-val'));
                if (val === nextNum) {
                    cell.classList.add('found');
                    cell.disabled = true;
                    nextNum++;
                    const hint = document.getElementById('next-hint');
                    if (hint) hint.innerHTML = `Next: <strong>${nextNum}</strong>`;

                    if (nextNum > 25) {
                        clearInterval(timerInt);
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                        finishSchulte(parseFloat(elapsed));
                    }
                } else {
                    cell.classList.add('wrong');
                    setTimeout(() => cell.classList.remove('wrong'), 500);
                }
            };
        });
    }

    function finishSchulte(elapsed) {
        const schData = state.schulte;
        const isNewBest = schData.bestTime === null || elapsed < schData.bestTime;
        if (isNewBest) schData.bestTime = elapsed;
        state.coins += 30;
        state.stars += 2;
        DB.save(state);
        updateNavStats();

        // Sync with backend
        syncScore('schulte', elapsed, 1);

        showResultCard({
            icon: isNewBest ? '🏆' : '✅',
            title: isNewBest ? 'New Record!' : 'Grid Complete!',
            subtitle: `You finished the Schulte Grid in ${elapsed}s`,
            details: [
                { label: 'Your Time', value: `${elapsed}s` },
                { label: 'Best Time', value: `${schData.bestTime}s` },
                { label: 'Coins', value: '+30 🪙' },
                { label: 'Stars', value: '+2 ⭐' }
            ],
            primaryLabel: '🔄 Play Again',
            onPrimary: () => initSchulteGame(),
            secondaryLabel: '🏠 Home',
            onSecondary: () => goHome()
        });
    }

    /* =============================================
       ABOUT / HELP / LEADERBOARD VIEWS
       ============================================= */
    function renderAbout() {
        mainContent.innerHTML = `
            <div class="view">
                <div class="game-overlay glass" style="text-align:left; max-width:800px;">
                    <h2 style="font-size:3rem; margin-bottom:2rem;">About <span class="highlight-yellow">Master Mind</span></h2>
                    <div style="display:flex; gap:2rem; align-items:center; margin-bottom:2rem;">
                        <img src="https://api.dicebear.com/7.x/bottts/svg?seed=Siddhi" style="width:130px; border-radius:20px; background:var(--pastel-blue); padding:10px; flex-shrink:0;">
                        <div>
                            <h3 style="font-size:1.8rem; margin-bottom:8px;">Siddhi Hingne</h3>
                            <p style="color:var(--golden-yellow); font-weight:700; margin-bottom:8px;">Lead Developer &amp; Architect</p>
                            <p style="color:var(--text-dim);">Passionate about cognitive science, brain training, and exceptional UI/UX.</p>
                        </div>
                    </div>
                    <hr style="margin:1.5rem 0; opacity:0.1;">
                    <h3 style="margin-bottom:1rem;">Why Master Mind?</h3>
                    <p style="line-height:1.9; margin-bottom:1rem;">
                        Master Mind was created because Siddhi noticed that most brain-training apps are either boring or ineffective. 
                        The mission: build an engaging platform that actually challenges memory, reflex, and visual cognition—all wrapped in a design that makes you want to come back every day.
                    </p>
                    <p style="line-height:1.9;">
                        Every level is tuned to promote neuroplasticity, and every game mechanic is backed by cognitive research. 
                        Whether you're chasing a split-second F1 reaction time or levelling up your room-observer memory—Master Mind makes every second count.
                    </p>
                    <button class="btn-cta" style="margin-top:2rem; width:auto;" onclick="location.reload()">🎮 Play Games</button>
                </div>
            </div>
        `;
    }

    function renderHelp() {
        mainContent.innerHTML = `
            <div class="view">
                <div class="game-overlay glass" style="text-align:left; max-width:800px;">
                    <h2 style="font-size:3rem; margin-bottom:2rem;">How to <span class="highlight-yellow">Play</span></h2>
                    <div style="display:grid; gap:2rem;">
                        <div class="help-item">
                            <h3>🏘️ Room Observer</h3>
                            <p>Memorize objects and their colors in 10 seconds. Answer at least 3 questions correctly to clear the level and earn a coin. Get all 5 correct for 3 stars!</p>
                        </div>
                        <div class="help-item">
                            <h3>🏎️ F1 Reflex</h3>
                            <p>Watch 5 red lights turn on one by one. When all lights go out — react instantly by clicking <strong>REACT!</strong>. Below 200ms is world-class. Beat Verstappen!</p>
                        </div>
                        <div class="help-item">
                            <h3>🔢 Schulte Grid</h3>
                            <p>25 numbers randomly placed on a 5×5 grid. Click 1, then 2, then 3... all the way to 25 in order — as fast as possible. Use peripheral vision to get ahead!</p>
                        </div>
                    </div>
                    <button class="btn-cta" style="margin-top:2rem; width:auto;" onclick="location.reload()">🚀 I'm Ready!</button>
                </div>
            </div>
        `;
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
                            <div class="lb-stat"><span>Best Time</span><strong>${schData.bestTime ? schData.bestTime + 's' : 'N/A'}</strong></div>
                            <div class="lb-stat"><span>Games Played</span><strong>${schData.gamesPlayed}</strong></div>
                        </div>
                        <div class="lb-card confusion">
                            <h3>🎨 Color Confusion</h3>
                            <div class="lb-stat"><span>High Score</span><strong>${state.confusion.highScore} pts</strong></div>
                            <div class="lb-stat"><span>Games Played</span><strong>${state.confusion.gamesPlayed}</strong></div>
                        </div>
                    </div>
                    <div style="text-align:center; margin-top:2rem; font-size:1.2rem">
                        🪙 Total Coins: <strong>${state.coins}</strong> &nbsp;|&nbsp; ⭐ Total Stars: <strong>${state.stars}</strong>
                    </div>
                    <button class="btn-cta" style="margin-top:2rem; width:auto; display:block; margin-left:auto; margin-right:auto;" onclick="location.reload()">🎮 Play</button>
                </div>
            </div>
        `;
    }

    /* =============================================
       GAME 4: COLOR CONFUSION — STROOP EFFECT
       ============================================= */
    function initConfusionGame() {
        const confData = state.confusion;
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

                    <button class="btn-leaderboard-lite" onclick="renderLeaderboard()">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                        LEADERBOARD
                    </button>

                    <div class="conf-ver">v1.0.0 // SYSTEM READY</div>
                </div>
            </div>
        `;
        attachToolbarListeners();
    }

    function playFeedback(type) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            if (type === 'success') {
                oscillator.frequency.setTargetAtTime(800, audioCtx.currentTime, 0.05);
                gainNode.gain.setTargetAtTime(0.1, audioCtx.currentTime, 0.05);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.1);
            } else {
                oscillator.type = 'sawtooth';
                oscillator.frequency.setTargetAtTime(120, audioCtx.currentTime, 0.05);
                gainNode.gain.setTargetAtTime(0.1, audioCtx.currentTime, 0.05);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.2);
            }
        } catch (e) { }
    }

    window.startConfusionMode = function (mode) {
        const confData = state.confusion;
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

                <div class="stroop-central-card" id="stroop-card">
                    <div id="combo-display" class="combo-badge hidden">Combo x1</div>
                    <div class="stroop-word" id="stroop-word"></div>
                    <div class="card-instruction">Select the FONT COLOR</div>
                </div>

                <div id="stroop-options" class="conf-answer-grid"></div>
            </div>
        `;

        attachToolbarListeners();
        const metaLabel = document.getElementById('conf-meta-label');
        const metaValue = document.getElementById('conf-meta-value');
        const pointsEl = document.getElementById('conf-points');

        const timerInt = setInterval(() => {
            if (mode === 'survival') {
                timeLeft = Math.max(0, timeLeft - 0.1);
                if (metaValue) metaValue.innerText = timeLeft.toFixed(1) + 's';
                if (timeLeft <= 0) {
                    clearInterval(timerInt);
                    finishRefinedConfusion({ mode, score, totalPoints, reactions, maxCombo, startTime });
                }
            } else if (mode === 'speed') {
                if (metaValue) metaValue.innerText = (target - score);
                if (score >= target) {
                    clearInterval(timerInt);
                    finishRefinedConfusion({ mode, score, totalPoints, reactions, maxCombo, startTime });
                }
            } else {
                if (metaValue) metaValue.innerText = lives;
                if (lives <= 0) {
                    clearInterval(timerInt);
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
            let options = [fontColorName];
            const distractors = WORD_LIST.filter(c => c !== fontColorName && c !== textColorName);
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
                    btn.onclick = () => {
                        const RT = Date.now() - questionStartTime;
                        reactions.push(RT);

                        if (opt === fontColorName) {
                            score++;
                            combo++;
                            maxCombo = Math.max(maxCombo, combo);
                            playFeedback('success');

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
                            playFeedback('error');
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
        syncScore('confusion', totalPoints, 1, { mode, avgRT, rating });

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
            onPrimary: () => initConfusionGame(),
            secondaryLabel: 'Base Home',
            onSecondary: () => goHome()
        });
    }

});
