// index.js - COMPLETE VERSION WITH BETTING SYSTEM INTEGRATION
const { chromium } = require('playwright');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const { username, password } = require('./user');
const BettingDatabase = require('./database');

class VirtualFootballScraper {
    constructor() {
        // Betting tracking properties
        this.completedRounds = 0;
        this.roundMatches = new Set();
        this.betPlaced = false;
        this.currentMatchday = 0;

        // Existing properties
        this.db = null; // Old database
        this.bettingDB = null; // New betting database
        this.browser = null;
        this.page = null;
        this.isRunning = false;
        this.data = [];
        this.savedKeys = new Set();
        this.jsonFile = 'leap_results_with_odds.json';
        this.oddsDataFile = 'betting_odds_data.json';
        this.currentStage = 'Unknown Stage';
        this.loginPopupCount = 0;
        this.bettingTrigger = false;
        this.lastBettingCheck = null;
        this.bettingCheckInterval = 60000;
    }

    async initialize() {
        try {
            console.log('='.repeat(70));
            console.log('🏆 VIRTUAL FOOTBALL SCRAPER WITH BETTING SYSTEM');
            console.log('='.repeat(70));

            await this.setupDatabase();
            await this.launchBrowser();
            await this.loadExistingData();
            await this.showRecentMatches();

            console.log('✅ Initialization complete!\n');
            return true;

        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return false;
        }
    }

    async setupDatabase() {
        console.log('\n📦 Setting up databases...');
        console.log('   Initializing betting database...');
        this.bettingDB = new BettingDatabase();
        await this.bettingDB.initialize();

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database('./matches.db', (err) => {
                if (err) {
                    console.error('❌ Old database connection failed:', err.message);
                    reject(err);
                    return;
                }
                console.log('✅ Connected to old database for backward compatibility');

                this.db.run(`
                    CREATE TABLE IF NOT EXISTS match_results (
                                                                 matchNo INTEGER PRIMARY KEY,
                                                                 tournament_stage TEXT,
                                                                 homeTeam TEXT NOT NULL,
                                                                 awayTeam TEXT NOT NULL,
                                                                 fullTimeScore TEXT NOT NULL,
                                                                 result TEXT NOT NULL,
                                                                 savedAt TEXT NOT NULL,
                                                                 is_final INTEGER DEFAULT 0
                    )
                `, (err) => {
                    if (err) {
                        console.error('❌ Old table creation failed:', err.message);
                        reject(err);
                    } else {
                        console.log('✅ Old database table ready');
                        resolve();
                    }
                });
            });
        });
    }

    async launchBrowser() {
        console.log('\n🌐 Launching browser...');
        this.browser = await chromium.launch({
            headless: false,
            slowMo: 100,
            timeout: 60000
        });
        this.page = await this.browser.newPage();
        await this.page.setViewportSize({ width: 1366, height: 900 });
        console.log('✅ Browser launched');
    }

    async loadExistingData() {
        console.log('\n📁 Loading existing data...');
        try {
            const fileContent = await fs.readFile(this.jsonFile, 'utf8');
            this.data = JSON.parse(fileContent);
            this.data.forEach(match => {
                const key = `${match.tournament_stage || 'Unknown'}-${match.homeTeam}-${match.awayTeam}-${match.fullTimeScore}`;
                this.savedKeys.add(key);
            });
            console.log(`✅ Loaded ${this.data.length} existing matches`);
            try {
                const oddsContent = await fs.readFile(this.oddsDataFile, 'utf8');
                const oddsData = JSON.parse(oddsContent);
                console.log(`✅ Loaded ${oddsData.length} existing odds records`);
            } catch (error) {
                console.log('⚠️  No existing odds data found, will create new file');
                await fs.writeFile(this.oddsDataFile, JSON.stringify([], null, 2));
            }
        } catch (error) {
            console.log('⚠️  No existing match data found, starting fresh');
            this.data = [];
            await fs.writeFile(this.jsonFile, JSON.stringify([], null, 2));
            await fs.writeFile(this.oddsDataFile, JSON.stringify([], null, 2));
        }
    }

    async showRecentMatches() {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT * FROM match_results ORDER BY savedAt DESC LIMIT 5",
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ Error reading database:', err.message);
                        reject(err);
                        return;
                    }
                    if (rows.length === 0) {
                        console.log('ℹ️  No match data in database');
                    } else {
                        console.log(`\n📋 Recent matches from old database:`);
                        rows.forEach((row, index) => {
                            console.log(`  ${index + 1}. [${row.tournament_stage || 'Unknown'}] ${row.homeTeam} ${row.fullTimeScore} ${row.awayTeam}`);
                        });
                    }
                    console.log('');
                    resolve();
                }
            );
        });
    }

    async loginAndNavigate() {
        console.log('🔐 Logging in and navigating...');
        try {
            await this.page.goto('https://linebet.com/en/virtualsports?product=266&game=123472', {
                waitUntil: 'domcontentloaded',
                timeout: 120000
            });
            await this.page.waitForTimeout(5000);
            await this.handleInactivityPopup();
            await this.handleLoginPopup();
            const needsLogin = await this.checkIfLoginNeeded();
            if (needsLogin) {
                console.log('   Login required, attempting to login...');
                await this.performLogin();
            } else {
                console.log('✅ Already logged in!');
            }
            await this.waitForGame();
            console.log('✅ Ready to start scraping!\n');
        } catch (error) {
            console.error('❌ Navigation failed:', error.message);
            await this.alternativeLoginMethod();
        }
    }

    async alternativeLoginMethod() {
        try {
            console.log('   Trying alternative login method...');
            await this.page.goto('https://linebet.com/en/', {
                waitUntil: 'domcontentloaded',
                timeout: 90000
            });
            await this.page.waitForTimeout(3000);
            await this.handleInactivityPopup();
            const needsLogin = await this.checkIfLoginNeeded();
            if (needsLogin) {
                const loginButtonSelectors = [
                    'button:has-text("Log in")',
                    'button:has-text("Login")',
                    'a:has-text("Log in")',
                    'a:has-text("Login")',
                    '.login-button',
                    '[class*="login"] button',
                    '[class*="login"] a'
                ];
                let loginButtonFound = false;
                for (const selector of loginButtonSelectors) {
                    try {
                        const button = await this.page.$(selector);
                        if (button && await button.isVisible()) {
                            console.log(`   Found login button with selector: ${selector}`);
                            await button.click();
                            await this.page.waitForTimeout(2000);
                            loginButtonFound = true;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                if (loginButtonFound) {
                    await this.fillCredentials();
                    await this.page.goto('https://linebet.com/en/virtualsports?product=266&game=123472', {
                        waitUntil: 'domcontentloaded',
                        timeout: 120000
                    });
                    await this.waitForGame();
                    console.log('✅ Alternative login successful!\n');
                } else {
                    console.log('   ⚠️  Could not find login button');
                    console.log('💡 Please login manually and press Enter...');
                    await this.waitForManualLogin();
                }
            } else {
                console.log('   Already logged in, navigating to virtual football...');
                await this.page.goto('https://linebet.com/en/virtualsports?product=266&game=123472', {
                    waitUntil: 'domcontentloaded',
                    timeout: 120000
                });
                await this.waitForGame();
                console.log('✅ Navigation successful!\n');
            }
        } catch (error) {
            console.error('❌ Alternative login also failed:', error.message);
            throw error;
        }
    }

    async checkIfLoginNeeded() {
        try {
            const loginSelectors = [
                'input[name="username"]',
                'input[name="user"]',
                'input[type="text"][placeholder*="username" i]',
                'input[type="text"][placeholder*="user" i]',
                'input[type="password"]',
                'input[name="password"]',
                'input[type="password"][placeholder*="password" i]',
                'button:has-text("Log in"):visible',
                'button:has-text("Sign in"):visible',
                'button:has-text("Login"):visible',
                'form:has(input[type="password"]):visible',
                '.login-form:visible',
                '.auth-form:visible',
                '.login-dialog:visible'
            ];
            for (const selector of loginSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    for (const element of elements) {
                        if (await element.isVisible()) {
                            console.log(`   Login needed: Found ${selector}`);
                            return true;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            const pageText = await this.page.textContent('body').catch(() => '');
            const hasLoginText = pageText.toLowerCase().includes('log in') ||
                pageText.toLowerCase().includes('sign in') ||
                pageText.toLowerCase().includes('welcome back');
            if (hasLoginText) {
                const logoutElements = await this.page.$$('button:has-text("Log out"), button:has-text("Logout")');
                for (const element of logoutElements) {
                    if (await element.isVisible()) {
                        return false;
                    }
                }
                return true;
            }
            return false;
        } catch (error) {
            console.log('   ⚠️  Error checking login status:', error.message);
            return false;
        }
    }

    async performLogin() {
        try {
            const loginButtons = await this.page.$$('button:has-text("Log in"), button:has-text("Login"), button:has-text("Sign in")');
            if (loginButtons.length > 0) {
                for (const button of loginButtons) {
                    try {
                        if (await button.isVisible()) {
                            console.log('   Clicking login button...');
                            await button.click();
                            await this.page.waitForTimeout(2000);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            await this.fillCredentials();
        } catch (error) {
            console.log('⚠️  Could not perform automatic login:', error.message);
            console.log('💡 Please login manually and press Enter...');
            await this.waitForManualLogin();
        }
    }

    async fillCredentials() {
        try {
            console.log('   Looking for login form...');
            const usernameSelectors = [
                'input[name="username"]',
                'input[name="user"]',
                'input[type="text"]',
                'input[placeholder*="username" i]',
                'input[placeholder*="user" i]',
                'input[placeholder*="email" i]',
                '#username',
                '#user',
                '.username-input',
                '.user-input'
            ];
            let usernameField = null;
            for (const selector of usernameSelectors) {
                usernameField = await this.page.$(selector).catch(() => null);
                if (usernameField && await usernameField.isVisible()) {
                    console.log(`   Found username field with selector: ${selector}`);
                    break;
                }
            }
            if (usernameField) {
                console.log('   Filling username...');
                await usernameField.click();
                await this.page.waitForTimeout(500);
                await usernameField.fill(username);
                await this.page.waitForTimeout(1000);
                const passwordSelectors = [
                    'input[name="password"]',
                    'input[type="password"]',
                    'input[placeholder*="password" i]',
                    '#password',
                    '.password-input'
                ];
                let passwordField = null;
                for (const selector of passwordSelectors) {
                    passwordField = await this.page.$(selector).catch(() => null);
                    if (passwordField && await passwordField.isVisible()) {
                        console.log(`   Found password field with selector: ${selector}`);
                        break;
                    }
                }
                if (passwordField) {
                    console.log('   Filling password...');
                    await passwordField.click();
                    await this.page.waitForTimeout(500);
                    await passwordField.fill(password);
                    await this.page.waitForTimeout(1000);
                    const submitSelectors = [
                        'button[type="submit"]',
                        'input[type="submit"]',
                        'button:has-text("Log in")',
                        'button:has-text("Login")',
                        'button:has-text("Sign in")',
                        '.submit-button',
                        '.login-submit'
                    ];
                    for (const selector of submitSelectors) {
                        const submitButton = await this.page.$(selector).catch(() => null);
                        if (submitButton && await submitButton.isVisible()) {
                            console.log('   Clicking submit button...');
                            await submitButton.click();
                            break;
                        }
                    }
                    console.log('   Pressing Enter to submit...');
                    await passwordField.press('Enter');
                    await this.page.waitForTimeout(5000);
                    console.log('✅ Login submitted');
                } else {
                    console.log('   ⚠️  Password field not found');
                }
            } else {
                console.log('   ⚠️  Username field not found, might already be logged in');
            }
        } catch (error) {
            console.log('   ⚠️  Could not fill credentials:', error.message);
        }
    }

    async waitForManualLogin() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        return new Promise(resolve => {
            rl.question('Press Enter after you have logged in manually...', () => {
                rl.close();
                resolve();
            });
        });
    }

    async waitForGame() {
        console.log('   Waiting for game to load...');
        for (let i = 0; i < 20; i++) {
            try {
                await this.page.waitForSelector('iframe', { timeout: 5000 });
                const iframe = await this.page.$('iframe');
                if (!iframe) {
                    throw new Error('No iframe found');
                }
                const frame = await iframe.contentFrame();
                if (!frame) {
                    throw new Error('Iframe has no content');
                }
                await frame.waitForSelector('.teams-vs-btn, .scoreboard, .teams-vs, .component-head', { timeout: 5000 });
                console.log('✅ Game loaded successfully!');
                return;
            } catch (error) {
                console.log(`   Waiting for game... (${i + 1}/20)`);
                await this.page.waitForTimeout(3000);
                await this.handleInactivityPopup();
            }
        }
        console.log('⚠️  Game loading timeout, but continuing...');
    }

    // NEW: BETTING FUNCTIONALITY METHODS
    async checkBettingTrigger() {
        try {
            if (this.currentMatchday >= 2 && !this.betPlaced) {
                console.log(`\n   🎯 BETTING TRIGGERED!`);
                console.log(`   📊 Current Matchday: ${this.currentMatchday}`);
                console.log(`   🎲 Placing bet on Next Matchday...\n`);

                const betResult = await this.placeBetOnNextMatchday();
                if (betResult) {
                    this.betPlaced = true;
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.log('   ⚠️  Error checking betting trigger:', error.message);
            return false;
        }
    }

    async placeBetOnNextMatchday() {
        try {
            console.log('   🎲 Starting betting process...');

            // Get iframe
            const iframe = await this.page.$('iframe');
            if (!iframe) {
                console.log('   ❌ Iframe not found for betting');
                return false;
            }

            const frame = await iframe.contentFrame();
            if (!frame) {
                console.log('   ❌ Frame not available for betting');
                return false;
            }

            // Step 1: Find the Next Matchday section
            const nextMatchdaySection = await frame.$('.next-bets');
            if (!nextMatchdaySection) {
                console.log('   ❌ Next Matchday section not found');
                return false;
            }

            console.log('   ✅ Found Next Matchday section');

            // Step 2: Get all matches in Next Matchday
            const eventGroups = await frame.$$('.popular-event-groups');
            if (eventGroups.length === 0) {
                console.log('   ❌ No matches found in Next Matchday');
                return false;
            }

            console.log(`   📊 Found ${eventGroups.length} upcoming matches`);

            // Step 3: Find the match with the lowest odds (favorite to win)
            let lowestOdds = Infinity;
            let targetMatch = null;
            let targetButtonIndex = null;
            let targetTeamName = '';
            let matchTeams = { home: '', away: '' };

            for (let i = 0; i < eventGroups.length; i++) {
                try {
                    const matchData = await frame.evaluate((el) => {
                        // Get team names
                        const homeTeamEl = el.querySelector('.teams-vs__left-asset .team-name');
                        const awayTeamEl = el.querySelector('.teams-vs__right-asset .team-name');

                        const homeTeam = homeTeamEl ? homeTeamEl.textContent.trim() : '';
                        const awayTeam = awayTeamEl ? awayTeamEl.textContent.trim() : '';

                        // Get odds for all three outcomes
                        const betElements = el.querySelectorAll('.bet');
                        const odds = [];

                        if (betElements.length >= 3) {
                            for (let j = 0; j < 3; j++) {
                                const oddsEl = betElements[j].querySelector('.bet-odd');
                                const oddsValue = oddsEl ? parseFloat(oddsEl.getAttribute('data-decimal')) : null;
                                odds.push(oddsValue);
                            }
                        }

                        return {
                            homeTeam,
                            awayTeam,
                            odds
                        };
                    }, eventGroups[i]);

                    // Check each odds value
                    if (matchData.odds && matchData.odds.length === 3) {
                        for (let j = 0; j < 3; j++) {
                            if (matchData.odds[j] !== null && matchData.odds[j] < lowestOdds) {
                                lowestOdds = matchData.odds[j];
                                targetMatch = eventGroups[i];
                                targetButtonIndex = j;

                                if (j === 0) targetTeamName = matchData.homeTeam;
                                else if (j === 1) targetTeamName = 'Draw';
                                else targetTeamName = matchData.awayTeam;

                                matchTeams = {
                                    home: matchData.homeTeam,
                                    away: matchData.awayTeam
                                };
                            }
                        }
                    }

                } catch (error) {
                    console.log(`   ⚠️  Error analyzing match ${i + 1}:`, error.message);
                }
            }

            if (!targetMatch || targetButtonIndex === null) {
                console.log('   ❌ Could not find suitable match to bet on');
                return false;
            }

            console.log(`   ✅ Selected match: ${matchTeams.home} vs ${matchTeams.away}`);
            console.log(`   🎯 Betting on: ${targetTeamName} (Lowest odds: ${lowestOdds})`);

            // Step 4: Click the bet button
            console.log('   🖱️  Clicking bet button...');

            // Get the specific bet button within the match
            const betButtons = await targetMatch.$$('.bet');
            if (betButtons.length > targetButtonIndex) {
                await betButtons[targetButtonIndex].click();
                await frame.waitForTimeout(3000);
                console.log('   ✅ Bet button clicked');

                // Step 5: Enter bet amount (55)
                console.log('   💰 Entering bet amount: 55');

                // Find the stake input field
                const stakeInput = await frame.$('input.stake-input.focus');
                if (!stakeInput) {
                    console.log('   ⚠️  Focused stake input not found, trying any stake input...');
                    const anyStakeInput = await frame.$('input.stake-input');
                    if (anyStakeInput) {
                        await anyStakeInput.click();
                        await frame.waitForTimeout(500);
                        await anyStakeInput.fill('55');
                        console.log('   ✅ Bet amount entered');
                    } else {
                        console.log('   ❌ No stake input field found');
                        return false;
                    }
                } else {
                    await stakeInput.click();
                    await frame.waitForTimeout(500);
                    await stakeInput.fill('55');
                    console.log('   ✅ Bet amount entered');
                }

                // Step 6: Click submit button
                console.log('   📤 Submitting bet...');
                await frame.waitForTimeout(2000);

                // Find and click submit button
                const submitButton = await frame.$('div.button:not(.disabled)');
                if (!submitButton) {
                    console.log('   ⚠️  Submit button not found or is disabled, trying any button...');
                    const anySubmitButton = await frame.$('div.button');
                    if (anySubmitButton) {
                        await anySubmitButton.click();
                        console.log('   ✅ Bet submitted via alternative button!');
                    } else {
                        console.log('   ❌ Could not find any submit button');
                        return false;
                    }
                } else {
                    await submitButton.click();
                    console.log('   ✅ Bet submitted!');
                }

                // Show success alert
                console.log('\n   🎉🎉🎉 ALERT: BET PLACED SUCCESSFULLY! 🎉🎉🎉');
                console.log(`   💰 Amount: 55`);
                console.log(`   🏆 Match: ${matchTeams.home} vs ${matchTeams.away}`);
                console.log(`   🎯 Bet on: ${targetTeamName}`);
                console.log(`   📈 Odds: ${lowestOdds}`);
                console.log(`   💵 Potential Win: ${(55 * lowestOdds).toFixed(2)}\n`);

                // Save the bet to database
                await this.saveBetToDatabase(matchTeams, targetTeamName, 55, lowestOdds);

                return true;

            } else {
                console.log('   ❌ Could not click bet button');
                return false;
            }

        } catch (error) {
            console.log('   ❌ Error in betting process:', error.message);
            return false;
        }
    }

    async saveBetToDatabase(matchInfo, betOn, amount, odds) {
        try {
            const matchRef = `${this.currentStage}-${matchInfo.home}-${matchInfo.away}`;

            const betData = {
                match_reference: matchRef,
                bet_type: betOn === 'Draw' ? 'DRAW' : (betOn === matchInfo.home ? 'HOME' : 'AWAY'),
                bet_value: odds,
                amount: amount,
                potential_win: amount * odds,
                status: 'PENDING',
                placed_at: new Date().toISOString()
            };

            const result = await this.bettingDB.placeBet(betData);

            if (result && result.betId) {
                console.log(`   💾 Bet saved to database: Bet ID ${result.betId}`);
                return true;
            }
            return false;

        } catch (error) {
            console.log('   ⚠️  Error saving bet to database:', error.message);
            return false;
        }
    }

    async startScraping() {
        console.log('🎯 Starting to scrape matches and odds...');
        console.log('   Monitoring every 30 seconds');
        console.log('   Will handle login popups automatically');
        console.log('   Will check for betting triggers automatically');
        console.log('   Press Ctrl+C to stop\n');

        this.isRunning = true;
        let cycleCount = 0;

        while (this.isRunning) {
            cycleCount++;

            const now = new Date();
            const dateStr = `${now.getDate().toString().padStart(2, '0')}:${(now.getMonth() + 1).toString().padStart(2, '0')}:${now.getFullYear()}`;

            console.log(`\n🔄 Cycle ${cycleCount} - ${dateStr} ${now.toLocaleTimeString()}`);

            try {
                await this.scrapeCycle();

                // Check for betting triggers
                const currentTime = Date.now();
                if (!this.lastBettingCheck || (currentTime - this.lastBettingCheck) >= this.bettingCheckInterval) {
                    await this.checkBettingTriggers();
                    this.lastBettingCheck = currentTime;
                }

            } catch (error) {
                console.error('⚠️  Error in scrape cycle:', error.message);
            }

            await this.sleep(30000);
        }
    }

    async scrapeCycle() {
        try {
            // Handle popups before anything else
            await this.handleInactivityPopup();
            await this.handleLoginPopup();

            // Get iframe
            const iframe = await this.page.$('iframe');
            if (!iframe) {
                console.log('   ⏳ Iframe not found...');
                return;
            }

            const frame = await iframe.contentFrame();
            if (!frame) {
                console.log('   ⏳ Frame not ready...');
                return;
            }

            // Extract tournament stage
            const tournamentStage = await this.extractStage(frame);
            this.currentStage = tournamentStage;

            // Update current matchday number
            const matchdayMatch = tournamentStage.match(/Matchday (\d+)/i);
            if (matchdayMatch) {
                const matchdayNum = parseInt(matchdayMatch[1]);
                if (matchdayNum > this.currentMatchday) {
                    this.currentMatchday = matchdayNum;
                    console.log(`   📅 Current Matchday updated to: ${this.currentMatchday}`);
                }
            }

            // Get live match info
            await this.getLiveMatch(frame);

            // Extract and process matches
            const matches = await this.extractMatches(frame);
            console.log(`   📊 Found ${matches.length} match(es) in ${tournamentStage}`);

            for (const match of matches) {
                await this.processMatch(match, tournamentStage);
            }

            // Extract odds data
            console.log('   💰 Scanning for betting odds...');
            await this.extractOddsData(frame, tournamentStage);

            // Check for betting trigger (after 2 rounds)
            await this.checkBettingTrigger();

        } catch (error) {
            console.log('   ⚠️  Error in scrape cycle:', error.message);
        }
    }

    async extractOddsData(frame, tournamentStage) {
        try {
            // Method 1: Look for "Next Matchday" section
            const nextMatchdaySection = await frame.$('.next-bets').catch(() => null);
            if (nextMatchdaySection) {
                console.log('   Found "Next Matchday" section, extracting odds...');
                await this.extractNextMatchdayOdds(frame, tournamentStage);
                return;
            }

            // Method 2: Look for odds in popular-event-groups
            const eventGroups = await frame.$$('.popular-event-groups').catch(() => []);
            if (eventGroups.length > 0) {
                console.log(`   Found ${eventGroups.length} event group(s), extracting odds...`);
                await this.extractEventGroupOdds(frame, tournamentStage);
                return;
            }

            console.log('   ⚠️  No odds data found in this cycle');
        } catch (error) {
            console.log('   ⚠️  Error extracting odds data:', error.message);
        }
    }

    async extractNextMatchdayOdds(frame, tournamentStage) {
        try {
            const eventGroups = await frame.$$('.popular-event-groups');
            if (eventGroups.length === 0) {
                console.log('   No event groups found in Next Matchday');
                return;
            }

            console.log(`   Found ${eventGroups.length} match(es) in Next Matchday`);
            const oddsData = [];
            const timestamp = new Date().toISOString();

            for (let i = 0; i < eventGroups.length; i++) {
                try {
                    const matchOdds = await frame.evaluate(el => {
                        const homeTeamEl = el.querySelector('.teams-vs__left-asset .team-name');
                        const awayTeamEl = el.querySelector('.teams-vs__right-asset .team-name');
                        const homeTeam = homeTeamEl ? homeTeamEl.textContent.trim().toUpperCase() : '';
                        const awayTeam = awayTeamEl ? awayTeamEl.textContent.trim().toUpperCase() : '';
                        const betElements = el.querySelectorAll('.bet');
                        let homeOdds = null, drawOdds = null, awayOdds = null;

                        if (betElements.length >= 3) {
                            const homeOddsEl = betElements[0].querySelector('.bet-odd');
                            homeOdds = homeOddsEl ? parseFloat(homeOddsEl.getAttribute('data-decimal')) : null;
                            const drawOddsEl = betElements[1].querySelector('.bet-odd');
                            drawOdds = drawOddsEl ? parseFloat(drawOddsEl.getAttribute('data-decimal')) : null;
                            const awayOddsEl = betElements[2].querySelector('.bet-odd');
                            awayOdds = awayOddsEl ? parseFloat(awayOddsEl.getAttribute('data-decimal')) : null;
                        }

                        return { homeTeam, awayTeam, homeOdds, drawOdds, awayOdds };
                    }, eventGroups[i]);

                    if (matchOdds.homeTeam && matchOdds.awayTeam) {
                        const oddsEntry = {
                            match_reference: `${tournamentStage}-${matchOdds.homeTeam}-${matchOdds.awayTeam}`,
                            home_team: matchOdds.homeTeam,
                            away_team: matchOdds.awayTeam,
                            home_odds: matchOdds.homeOdds,
                            draw_odds: matchOdds.drawOdds,
                            away_odds: matchOdds.awayOdds,
                            bet_type: '1X2',
                            bet_value: matchOdds.homeOdds,
                            timestamp: timestamp,
                            tournament_stage: tournamentStage
                        };

                        oddsData.push(oddsEntry);
                        console.log(`   📈 ${matchOdds.homeTeam} vs ${matchOdds.awayTeam}:`);
                        console.log(`      Home: ${matchOdds.homeOdds || 'N/A'}, Draw: ${matchOdds.drawOdds || 'N/A'}, Away: ${matchOdds.awayOdds || 'N/A'}`);
                    }
                } catch (error) {
                    console.log(`   ⚠️  Could not extract odds for match ${i + 1}:`, error.message);
                }
            }

            if (oddsData.length > 0) {
                await this.saveOddsData(oddsData);
                console.log(`   💾 Saved ${oddsData.length} odds record(s) to database`);
            }

        } catch (error) {
            console.log('   ⚠️  Error extracting Next Matchday odds:', error.message);
        }
    }

    async extractEventGroupOdds(frame, tournamentStage) {
        try {
            const eventGroups = await frame.$$('.popular-event-groups');
            const oddsData = [];
            const timestamp = new Date().toISOString();

            for (const group of eventGroups) {
                try {
                    const matchData = await frame.evaluate(el => {
                        const teamNames = el.querySelectorAll('.team-name');
                        let homeTeam = '', awayTeam = '';
                        if (teamNames.length >= 2) {
                            homeTeam = teamNames[0]?.textContent.trim().toUpperCase() || '';
                            awayTeam = teamNames[1]?.textContent.trim().toUpperCase() || '';
                        }
                        const betOdds = el.querySelectorAll('.bet-odd');
                        let homeOdds = null, drawOdds = null, awayOdds = null;
                        if (betOdds.length >= 3) {
                            homeOdds = parseFloat(betOdds[0]?.getAttribute('data-decimal')) || null;
                            drawOdds = parseFloat(betOdds[1]?.getAttribute('data-decimal')) || null;
                            awayOdds = parseFloat(betOdds[2]?.getAttribute('data-decimal')) || null;
                        }
                        return { homeTeam, awayTeam, homeOdds, drawOdds, awayOdds };
                    }, group);

                    if (matchData.homeTeam && matchData.awayTeam) {
                        const oddsEntry = {
                            match_reference: `${tournamentStage}-${matchData.homeTeam}-${matchData.awayTeam}`,
                            home_team: matchData.homeTeam,
                            away_team: matchData.awayTeam,
                            home_odds: matchData.homeOdds,
                            draw_odds: matchData.drawOdds,
                            away_odds: matchData.awayOdds,
                            bet_type: '1X2',
                            bet_value: matchData.homeOdds,
                            timestamp: timestamp,
                            tournament_stage: tournamentStage
                        };

                        oddsData.push(oddsEntry);
                        if (matchData.homeOdds || matchData.drawOdds || matchData.awayOdds) {
                            console.log(`   💵 ${matchData.homeTeam} vs ${matchData.awayTeam}:`);
                            if (matchData.homeOdds) console.log(`      Home: ${matchData.homeOdds}`);
                            if (matchData.drawOdds) console.log(`      Draw: ${matchData.drawOdds}`);
                            if (matchData.awayOdds) console.log(`      Away: ${matchData.awayOdds}`);
                        }
                    }
                } catch (error) {
                    // Skip this group
                }
            }

            if (oddsData.length > 0) {
                await this.saveOddsData(oddsData);
            }

        } catch (error) {
            console.log('   ⚠️  Error extracting event group odds:', error.message);
        }
    }

    async saveOddsData(oddsData) {
        try {
            let existingOdds = [];
            try {
                const oddsContent = await fs.readFile(this.oddsDataFile, 'utf8');
                existingOdds = JSON.parse(oddsContent);
            } catch (error) {
                existingOdds = [];
            }

            const existingKeys = new Set(existingOdds.map(odds =>
                `${odds.match_reference}-${odds.home_odds}-${odds.draw_odds}-${odds.away_odds}`
            ));

            let newCount = 0;
            for (const odds of oddsData) {
                const key = `${odds.match_reference}-${odds.home_odds}-${odds.draw_odds}-${odds.away_odds}`;
                if (!existingKeys.has(key)) {
                    existingOdds.push(odds);
                    existingKeys.add(key);
                    newCount++;
                    await this.bettingDB.saveOdds(odds);
                }
            }

            await fs.writeFile(this.oddsDataFile, JSON.stringify(existingOdds, null, 2));

            if (newCount > 0) {
                console.log(`   💾 Added ${newCount} new odds record(s) to database and JSON file`);
            }

        } catch (error) {
            console.error('   ❌ Error saving odds data:', error.message);
        }
    }

    async handleInactivityPopup() {
        try {
            const inactivityPopup = await this.page.$('.overlay-page.shown');
            if (inactivityPopup) {
                console.log('   Found inactivity popup overlay...');
                const buttonSelectors = [
                    '.overlay-page.shown .overlay-content button',
                    '.overlay-content button:has-text("Click to initiate gameplay")',
                    'button:has-text("Click to initiate gameplay")',
                    '.overlay-container button',
                    '.overlay-page.shown button'
                ];
                for (const selector of buttonSelectors) {
                    try {
                        const button = await this.page.$(selector);
                        if (button) {
                            const isVisible = await button.isVisible();
                            if (isVisible) {
                                console.log('   Clicking "Click to initiate gameplay" button...');
                                await button.click();
                                await this.page.waitForTimeout(3000);
                                console.log('   ✅ Inactivity popup handled successfully.');
                                return true;
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
            const pageText = await this.page.textContent('body').catch(() => '');
            if (pageText.includes('Notification of inactivity time') ||
                pageText.includes('You have been inactive for a while now')) {
                console.log('   Found inactivity text, looking for any clickable button...');
                const allButtons = await this.page.$$('button');
                for (const button of allButtons) {
                    try {
                        if (await button.isVisible()) {
                            const buttonText = await button.textContent().catch(() => '');
                            if (buttonText.includes('Click to initiate gameplay') ||
                                buttonText.includes('Continue') ||
                                buttonText.includes('OK')) {
                                console.log(`   Clicking button: ${buttonText}`);
                                await button.click();
                                await this.page.waitForTimeout(3000);
                                console.log('   ✅ Clicked button to continue.');
                                return true;
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
            return false;
        } catch (error) {
            console.log('   ⚠️  Error handling inactivity popup:', error.message);
            return false;
        }
    }

    async handleLoginPopup() {
        const popupSelector = 'button.ui-button.ui-button--size-m.ui-button--theme-accent.ui-button--block.ui-button--uppercase.ui-button--rounded';
        try {
            const popupButton = await this.page.$(popupSelector);
            if (popupButton) {
                const isVisible = await popupButton.isVisible();
                const buttonText = await popupButton.innerText().catch(() => '');
                if (isVisible && buttonText.toLowerCase().includes('log in')) {
                    console.log('   Found login popup button, clicking...');
                    await popupButton.click();
                    this.loginPopupCount++;
                    console.log(`   Login popup clicked (${this.loginPopupCount} time(s))`);
                    await this.page.waitForTimeout(3000);
                }
            }
        } catch (error) {
            // No popup found
        }
    }

    async extractStage(frame) {
        try {
            const stage = await frame.$eval('.component-head.day-toggle h1', el => el.textContent.trim());
            if (stage) {
                return this.cleanStage(stage);
            }
        } catch (error) {
            try {
                const allH1s = await frame.$$eval('h1', h1s => h1s.map(h => h.textContent.trim()));
                for (const h1 of allH1s) {
                    if (h1 && (h1.includes('Matchday') || h1.includes('FINAL') || h1.includes('QUARTER') || h1.includes('SEMI'))) {
                        return this.cleanStage(h1);
                    }
                }
            } catch (e) {
                // Continue
            }
        }
        return 'Unknown Stage';
    }

    cleanStage(stage) {
        stage = stage.trim().toUpperCase();
        if (stage.includes('MATCHDAY')) {
            const numMatch = stage.match(/\d+/);
            return numMatch ? `Matchday ${numMatch[0]}` : 'Matchday';
        } else if (stage.includes('QUARTER')) {
            return 'Quarter Finals';
        } else if (stage.includes('SEMI')) {
            return 'Semi Finals';
        } else if (stage.includes('FINAL') && !stage.includes('QUARTER') && !stage.includes('SEMI')) {
            return 'Final';
        } else if (stage.includes('3RD')) {
            return '3rd Place';
        } else {
            return stage;
        }
    }

    async getLiveMatch(frame) {
        try {
            const home = await frame.$eval('.scoreboard .team:first-child .name', el => el.textContent.trim());
            const away = await frame.$eval('.scoreboard .team:last-child .name', el => el.textContent.trim());
            const score = await frame.$eval('.scoreboard .score', el => el.textContent.trim());
            const time = await frame.$eval('.scoreboard .trapezoid', el => el.textContent.trim());
            console.log(`   🔴 LIVE: ${home} ${score} ${away} | ${time}`);
        } catch (error) {
            // No live match
        }
    }

    async extractMatches(frame) {
        const matches = [];
        try {
            const matchElements = await frame.$$('.teams-vs-btn');
            for (const element of matchElements) {
                try {
                    const matchData = await frame.evaluate(el => {
                        const home = el.querySelector('.teams-vs__left-asset .team-name')?.textContent.trim().toUpperCase() || '';
                        const away = el.querySelector('.teams-vs__right-asset .team-name')?.textContent.trim().toUpperCase() || '';
                        const score = el.querySelector('.score')?.textContent.trim().replace(/\s/g, '') || '';
                        return { home, away, score };
                    }, element);
                    if (matchData.home && matchData.away && matchData.score && matchData.score.includes(':')) {
                        matches.push(matchData);
                    }
                } catch (e) {
                    // Skip element
                }
            }
        } catch (error) {
            console.log('   ⚠️  Error extracting matches:', error.message);
        }
        return matches;
    }

    async processMatch(matchData, tournamentStage) {
        try {
            const cleanScore = matchData.score.replace(/[^\d:]/g, '');
            if (!cleanScore.includes(':')) return;

            const [homeScore, awayScore] = cleanScore.split(':').map(Number);
            const key = `${tournamentStage}-${matchData.home}-${matchData.away}-${cleanScore}`;

            if (!this.savedKeys.has(key)) {
                let matchResult;
                if (homeScore > awayScore) {
                    matchResult = `${matchData.home} WIN`;
                } else if (awayScore > homeScore) {
                    matchResult = `${matchData.away} WIN`;
                } else {
                    matchResult = 'DRAW';
                }

                const newEntry = {
                    matchNo: this.data.length + 1,
                    tournament_stage: tournamentStage,
                    homeTeam: matchData.home,
                    awayTeam: matchData.away,
                    fullTimeScore: cleanScore,
                    result: matchResult,
                    savedAt: new Date().toISOString(),
                    is_final: 1,
                    homeScore: homeScore,
                    awayScore: awayScore
                };

                this.data.push(newEntry);
                this.savedKeys.add(key);
                await fs.writeFile(this.jsonFile, JSON.stringify(this.data, null, 2));
                await this.saveToDatabase(newEntry);

                if (this.bettingDB) {
                    const matchId = await this.bettingDB.saveMatch(newEntry);
                    if (matchId) {
                        await this.bettingDB.settleBet(matchId);
                    }
                }

                console.log(`   🎯 NEW MATCH SAVED!`);
                console.log(`       🏆 ${tournamentStage}`);
                console.log(`       ⚽ ${matchData.home} ${cleanScore} ${matchData.away}`);
                console.log(`       📊 ${matchResult}`);
                console.log(`       🆔 #${newEntry.matchNo}\n`);
            }
        } catch (error) {
            console.log(`   ⚠️  Error processing match:`, error.message);
        }
    }

    async saveToDatabase(matchData) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT OR REPLACE INTO match_results 
                (matchNo, tournament_stage, homeTeam, awayTeam, fullTimeScore, result, savedAt, is_final)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                matchData.matchNo,
                matchData.tournament_stage,
                matchData.homeTeam,
                matchData.awayTeam,
                matchData.fullTimeScore,
                matchData.result,
                matchData.savedAt,
                matchData.is_final
            ], function(err) {
                if (err) {
                    console.error('   ❌ Database error:', err.message);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async checkBettingTriggers() {
        try {
            console.log('   🔍 Checking betting triggers...');
            const summary = await this.bettingDB.getAccountSummary();
            if (summary) {
                console.log(`   💰 Account Balance: $${summary.account.balance.toFixed(2)}`);
                const scheduledMatches = await this.bettingDB.getScheduledMatches();
                if (scheduledMatches.length > 0) {
                    console.log(`   📅 Found ${scheduledMatches.length} scheduled matches`);
                    for (const match of scheduledMatches) {
                        if (match.home_odds && match.draw_odds && match.away_odds) {
                            let highestOdds = Math.max(match.home_odds, match.draw_odds, match.away_odds);
                            let betOn = '';
                            if (highestOdds > 2.0) {
                                if (highestOdds === match.home_odds) betOn = 'HOME';
                                else if (highestOdds === match.draw_odds) betOn = 'DRAW';
                                else if (highestOdds === match.away_odds) betOn = 'AWAY';
                                if (summary.account.balance >= 10) {
                                    console.log(`   🎲 Potential bet found: ${match.home_team} vs ${match.away_team}`);
                                    console.log(`      Highest odds: ${highestOdds} (${betOn})`);
                                }
                            }
                        }
                    }
                }
            }
            const pendingBets = await this.bettingDB.query(`
                SELECT COUNT(*) as count FROM bets WHERE status = 'PENDING'
            `);
            if (pendingBets[0].count > 0) {
                console.log(`   ⏳ ${pendingBets[0].count} pending bets awaiting results`);
            }
        } catch (error) {
            console.log('   ⚠️  Error checking betting triggers:', error.message);
        }
    }

    async placeAutoBet(matchId, betOn, amount) {
        try {
            console.log(`   🤖 Placing auto bet: $${amount} on ${betOn} for match ${matchId}`);
            const betData = {
                match_id: matchId,
                team_bet_on: betOn,
                amount: amount
            };
            const result = await this.bettingDB.placeBet(betData);
            console.log(`   ✅ Auto bet placed: Bet ID ${result.betId}`);
        } catch (error) {
            console.log('   ❌ Auto bet failed:', error.message);
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    setupShutdownHandlers() {
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Stopping scraper...');
            await this.shutdown();
        });
    }

    async shutdown() {
        this.isRunning = false;
        console.log('\n📊 FINAL SUMMARY:');
        console.log(`   Total matches: ${this.data.length}`);
        console.log(`   Login popups handled: ${this.loginPopupCount}`);
        console.log(`   Match JSON file: ${this.jsonFile}`);
        console.log(`   Odds JSON file: ${this.oddsDataFile}`);
        console.log(`   Current Matchday: ${this.currentMatchday}`);
        console.log(`   Bet placed: ${this.betPlaced ? 'Yes' : 'No'}`);

        console.log('\n💰 BETTING DATABASE SUMMARY:');
        try {
            const summary = await this.bettingDB.getAccountSummary();
            if (summary) {
                console.log(`   Current Balance: $${summary.account.balance.toFixed(2)}`);
                console.log(`   Total Wins: ${summary.account.total_wins}`);
                console.log(`   Total Losses: ${summary.account.total_losses}`);
                console.log(`   Win Rate: ${summary.winRate}%`);
                console.log(`   Total Profit/Loss: $${summary.account.total_profit_loss.toFixed(2)}`);
            }
        } catch (error) {
            console.log('   Could not retrieve betting summary');
        }

        try {
            const oddsContent = await fs.readFile(this.oddsDataFile, 'utf8');
            const oddsData = JSON.parse(oddsContent);
            console.log(`   Odds records in file: ${oddsData.length}`);
        } catch (error) {
            console.log('   No odds data file found');
        }

        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('❌ Error closing old database:', err.message);
                } else {
                    console.log('✅ Old database closed');
                }
            });
        }

        if (this.bettingDB) {
            await this.bettingDB.close();
            console.log('✅ Betting database closed');
        }

        if (this.browser) {
            await this.browser.close();
            console.log('✅ Browser closed');
        }

        console.log('\n👋 Goodbye!\n');
        process.exit(0);
    }

    async run() {
        try {
            this.setupShutdownHandlers();
            const initialized = await this.initialize();
            if (!initialized) return;
            await this.loginAndNavigate();
            await this.startScraping();
        } catch (error) {
            console.error('\n💥 Fatal error:', error.message);
            await this.shutdown();
        }
    }
}

// Check for user.js
try {
    require.resolve('./user');
} catch (error) {
    console.error('\n❌ ERROR: user.js file not found!');
    console.error(`
    Create a file called user.js with:

    module.exports = {
        username: 'YOUR_USERNAME',
        password: 'YOUR_PASSWORD'
    };
    `);
    process.exit(1);
}

// Run the scraper
(async () => {
    const scraper = new VirtualFootballScraper();
    await scraper.run();
})();