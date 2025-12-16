// index.js - COMPLETE FIXED VERSION WITH PROPER LOGIN
const { chromium } = require('playwright');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const { username, password } = require('./user');

class VirtualFootballScraper {
    constructor() {
        this.db = null;
        this.browser = null;
        this.page = null;
        this.isRunning = false;
        this.data = [];
        this.savedKeys = new Set();
        this.jsonFile = 'leap_results_with_odds.json';
        this.jsonFileOds = 'Odds_Data.json';
        this.oddsDataFile = 'Odds_Data.json';
        this.currentStage = 'Unknown Stage';
        this.loginPopupCount = 0;
    }

    async initialize() {
        try {
            console.log('='.repeat(60));
            console.log('🏆 VIRTUAL FOOTBALL SCRAPER');
            console.log('='.repeat(60));

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

    // Method to save odds data to the database
    async saveOddsToDatabase(oddsData) {
        return new Promise((resolve, reject) => {
            this.db.run(`
            INSERT INTO match_odds
            (match_reference, home_team, away_team, home_odds, draw_odds, away_odds, bet_type, bet_value, timestamp, tournament_stage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                oddsData.match_reference,
                oddsData.home_team,
                oddsData.away_team,
                oddsData.home_odds,
                oddsData.draw_odds,
                oddsData.away_odds,
                oddsData.bet_type,
                oddsData.bet_value,
                oddsData.timestamp,
                oddsData.tournament_stage
            ], function(err) {
                if (err) {
                    console.error('❌ Error saving odds to database:', err.message);
                    reject(err);
                } else {
                    console.log('   💾 Odds record saved to database');
                    resolve();
                }
            });
        });
    }


    async extractNextMatchdayOdds(frame, tournamentStage) {
        try {
            // Get all popular-event-groups
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
                        // Extract team names
                        const homeTeamEl = el.querySelector('.teams-vs__left-asset .team-name');
                        const awayTeamEl = el.querySelector('.teams-vs__right-asset .team-name');

                        const homeTeam = homeTeamEl ? homeTeamEl.textContent.trim().toUpperCase() : '';
                        const awayTeam = awayTeamEl ? awayTeamEl.textContent.trim().toUpperCase() : '';

                        // Extract odds values
                        const betElements = el.querySelectorAll('.bet');
                        let homeOdds = null, drawOdds = null, awayOdds = null;

                        if (betElements.length >= 3) {
                            // First element is home win
                            const homeOddsEl = betElements[0].querySelector('.bet-odd');
                            homeOdds = homeOddsEl ? parseFloat(homeOddsEl.getAttribute('data-decimal')) : null;

                            // Second element is draw
                            const drawOddsEl = betElements[1].querySelector('.bet-odd');
                            drawOdds = drawOddsEl ? parseFloat(drawOddsEl.getAttribute('data-decimal')) : null;

                            // Third element is away win
                            const awayOddsEl = betElements[2].querySelector('.bet-odd');
                            awayOdds = awayOddsEl ? parseFloat(awayOddsEl.getAttribute('data-decimal')) : null;
                        }

                        return {
                            homeTeam,
                            awayTeam,
                            homeOdds,
                            drawOdds,
                            awayOdds
                        };
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
                            bet_value: matchOdds.homeOdds, // Default to home odds
                            timestamp: timestamp,
                            tournament_stage: tournamentStage
                        };

                        oddsData.push(oddsEntry);

                        // Display in console
                        console.log(`   📈 ${matchOdds.homeTeam} vs ${matchOdds.awayTeam}:`);
                        console.log(`      Home: ${matchOdds.homeOdds || 'N/A'}, Draw: ${matchOdds.drawOdds || 'N/A'}, Away: ${matchOdds.awayOdds || 'N/A'}`);
                    }

                } catch (error) {
                    console.log(`   ⚠️  Could not extract odds for match ${i + 1}:`, error.message);
                }
            }

            // Save odds data
            if (oddsData.length > 0) {
                await this.saveOddsData(oddsData);
                console.log(`   💾 Saved ${oddsData.length} odds record(s) to file`);
            }

        } catch (error) {
            console.log('   ⚠️  Error extracting Next Matchday odds:', error.message);
        }
    }

    async saveOddsData(oddsData) {
        try {
            // Load existing odds data from the JSON file
            let existingOdds = [];
            try {
                const oddsContent = await fs.readFile(this.oddsDataFile, 'utf8');
                existingOdds = JSON.parse(oddsContent);
            } catch (error) {
                existingOdds = [];
            }

            // Add new odds data (avoid duplicates)
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
                }
            }

            // Save to JSON file
            await fs.writeFile(this.oddsDataFile, JSON.stringify(existingOdds, null, 2));

            if (newCount > 0) {
                console.log(`   💾 Added ${newCount} new odds record(s) to JSON file`);
            }

            // Now insert the odds data into the database
            for (const odds of oddsData) {
                await this.saveOddsToDatabase(odds);
            }

        } catch (error) {
            console.error('❌ Error saving odds data:', error.message);
        }
    }

    async extractEventGroupOdds(frame, tournamentStage) {
        try {
            // Get all popular-event-groups directly
            const eventGroups = await frame.$$('.popular-event-groups');

            const oddsData = [];
            const timestamp = new Date().toISOString();

            for (const group of eventGroups) {
                try {
                    const matchData = await frame.evaluate(el => {
                        // Try to find team names
                        const teamNames = el.querySelectorAll('.team-name');
                        let homeTeam = '', awayTeam = '';

                        if (teamNames.length >= 2) {
                            homeTeam = teamNames[0]?.textContent.trim().toUpperCase() || '';
                            awayTeam = teamNames[1]?.textContent.trim().toUpperCase() || '';
                        }

                        // Try to find odds
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

                        // Display
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

    async extractBetOddElements(frame, tournamentStage) {
        try {
            // Get all .bet-odd elements
            const betOdds = await frame.$$('.bet-odd');

            const oddsData = [];
            const timestamp = new Date().toISOString();

            // Group by parent elements to find matches
            const groupedOdds = new Map();

            for (const betOdd of betOdds) {
                try {
                    // Get parent element that might contain team names
                    const parent = await betOdd.evaluateHandle(el => el.closest('.popular-event-groups, .teams-vs, [class*="event"]'));
                    const parentKey = await parent.evaluate(el => el.outerHTML.substring(0, 100));

                    if (!groupedOdds.has(parentKey)) {
                        groupedOdds.set(parentKey, []);
                    }
                    groupedOdds.get(parentKey).push(betOdd);
                } catch (error) {
                    // Skip this element
                }
            }

            // Process each group
            for (const [parentKey, oddElements] of groupedOdds) {
                if (oddElements.length >= 3) {
                    try {
                        // Get team names from the first element's context
                        const firstOdd = oddElements[0];
                        const context = await firstOdd.evaluateHandle(el => el.closest('.popular-event-groups, .teams-vs'));

                        const teamData = await context.evaluate(el => {
                            const homeTeamEl = el.querySelector('.teams-vs__left-asset .team-name, .team:first-child .team-name');
                            const awayTeamEl = el.querySelector('.teams-vs__right-asset .team-name, .team:last-child .team-name');

                            return {
                                homeTeam: homeTeamEl ? homeTeamEl.textContent.trim().toUpperCase() : '',
                                awayTeam: awayTeamEl ? awayTeamEl.textContent.trim().toUpperCase() : ''
                            };
                        });

                        if (teamData.homeTeam && teamData.awayTeam) {
                            // Get odds values
                            const oddsValues = [];
                            for (const oddEl of oddElements.slice(0, 3)) {
                                const oddsValue = await oddEl.evaluate(el => {
                                    const decimal = el.getAttribute('data-decimal');
                                    return decimal ? parseFloat(decimal) : null;
                                });
                                oddsValues.push(oddsValue);
                            }

                            if (oddsValues[0] || oddsValues[1] || oddsValues[2]) {
                                const oddsEntry = {
                                    match_reference: `${tournamentStage}-${teamData.homeTeam}-${teamData.awayTeam}`,
                                    home_team: teamData.homeTeam,
                                    away_team: teamData.awayTeam,
                                    home_odds: oddsValues[0],
                                    draw_odds: oddsValues[1],
                                    away_odds: oddsValues[2],
                                    bet_type: '1X2',
                                    bet_value: oddsValues[0],
                                    timestamp: timestamp,
                                    tournament_stage: tournamentStage
                                };

                                oddsData.push(oddsEntry);
                                console.log(`   💰 ${teamData.homeTeam} vs ${teamData.awayTeam}: ${oddsValues[0]}/${oddsValues[1]}/${oddsValues[2]}`);
                            }
                        }
                    } catch (error) {
                        // Skip this group
                    }
                }
            }

            if (oddsData.length > 0) {
                await this.saveOddsData(oddsData);
            }

        } catch (error) {
            console.log('   ⚠️  Error extracting bet-odd elements:', error.message);
        }
    }


    async extractOddsData(frame, tournamentStage) {
        try {
            // Method 1: Look for "Next Matchday" section in the iframe
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

            // Method 3: Look for bet-odd elements anywhere in the frame
            const betOddElements = await frame.$$('.bet-odd').catch(() => []);
            if (betOddElements.length > 0) {
                console.log(`   Found ${betOddElements.length} bet-odd element(s), extracting odds...`);
                await this.extractBetOddElements(frame, tournamentStage);
                return;
            }

            console.log('   ⚠️  No odds data found in this cycle');

        } catch (error) {
            console.log('   ⚠️  Error extracting odds data:', error.message);
        }
    }

    async saveOddsToDatabase(matchData) {
        return new Promise((resolve, reject) => {
            this.db.run(`
            INSERT INTO match_odds 
            (homeTeam, awayTeam, homeOdds, drawOdds, awayOdds)
            VALUES (?, ?, ?, ?, ?)
        `, [
                matchData.homeTeam,
                matchData.awayTeam,
                matchData.odds.home,
                matchData.odds.draw,
                matchData.odds.away
            ], function (err) {
                if (err) {
                    console.error('   ❌ Error saving odds to database:', err.message);
                    reject(err);
                } else {
                    console.log('   💾 Odds saved to database');
                    resolve();
                }
            });
        });
    }

    async setupDatabase() {
        console.log('\n📦 Setting up database...');

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database('./matches.db', (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err.message);
                    reject(err);
                    return;
                }
                console.log('✅ Connected to database');

                // Create match_results table
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
                        console.error('❌ Table creation failed:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('✅ match_results table ready');
                });

                // Create match_odds table
                this.db.run(`
                CREATE TABLE IF NOT EXISTS match_odds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    homeTeam TEXT NOT NULL,
                    awayTeam TEXT NOT NULL,
                    homeOdds REAL NOT NULL,
                    drawOdds REAL NOT NULL,
                    awayOdds REAL NOT NULL
                )
            `, (err) => {
                    if (err) {
                        console.error('❌ Table creation for odds failed:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('✅ match_odds table ready');
                    resolve();
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
        await this.page.setViewportSize({ width: 1366, height: 768 });

        // Enable console logging for debugging
        this.page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

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

        } catch (error) {
            console.log('⚠️  No existing data found, starting fresh');
            this.data = [];
            await fs.writeFile(this.jsonFile, JSON.stringify([], null, 2));
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
                        console.log('ℹ️  Database is empty');
                    } else {
                        console.log(`\n📋 Recent matches:`);
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
            // Step 1: Go to Linebet homepage
            console.log('   Opening Linebet homepage...');
            await this.page.goto('https://linebet.com/en/', {
                waitUntil: 'domcontentloaded',
                timeout: 90000
            });

            // Wait for page to load
            await this.page.waitForTimeout(3000);

            // Step 2: Click login button
            console.log('   Clicking login button...');
            await this.clickLoginButton();

            // Step 3: Wait for login form and fill credentials
            console.log('   Filling login credentials...');
            await this.fillLoginCredentials();

            // Step 4: Navigate to virtual football
            console.log('   Navigating to virtual football...');
            await this.page.goto('https://linebet.com/en/virtualsports?product=266&game=123472', {
                waitUntil: 'domcontentloaded',
                timeout: 120000
            });

            // Wait for game to load
            await this.waitForGame();

            console.log('✅ Ready to start scraping!\n');

        } catch (error) {
            console.error('❌ Navigation failed:', error.message);
            throw error;
        }
    }

    async clickLoginButton() {
        // Try multiple selectors for the login button
        const loginSelectors = [
            // Exact selector from the HTML you provided
            'button.auth-dropdown-trigger.ui-button.ui-button--size-m.ui-button--theme-primary.ui-button--uppercase.ui-button--rounded',
            // Text-based selector
            'button:has-text("Log in")',
            'button:has-text("Login")',
            // Partial class match
            '[class*="auth-dropdown-trigger"]',
            '[class*="ui-button--theme-primary"]',
            // Any button with text containing "log in"
            'button:contains("log in")'
        ];

        for (const selector of loginSelectors) {
            try {
                console.log(`   Trying selector: ${selector}`);
                await this.page.waitForSelector(selector, { timeout: 5000 });

                const button = await this.page.$(selector);
                if (button) {
                    const isVisible = await button.isVisible();
                    if (isVisible) {
                        console.log(`   ✓ Found login button with selector: ${selector}`);
                        await button.click();
                        await this.page.waitForTimeout(2000);
                        return true;
                    }
                }
            } catch (error) {
                // Try next selector
                console.log(`   ✗ Selector failed: ${selector}`);
            }
        }

        // If no selector works, try to find by text content
        try {
            const buttonByText = await this.page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                for (const button of buttons) {
                    const text = button.textContent?.toLowerCase() || '';
                    if (text.includes('log in')) {
                        return button;
                    }
                }
                return null;
            });

            if (buttonByText) {
                await this.page.evaluate(button => button.click(), buttonByText);
                await this.page.waitForTimeout(2000);
                return true;
            }
        } catch (error) {
            // Continue to manual login
        }

        console.log('   ⚠️  Could not find login button automatically');
        return false;
    }

    async fillLoginCredentials() {
        try {
            // Wait for login form
            console.log('   Waiting for login form...');
            await this.page.waitForSelector('input#username', { timeout: 10000 });

            // Fill username
            console.log('   Entering username...');
            await this.page.fill('input#username', username);

            // Fill password
            console.log('   Entering password...');
            await this.page.fill('input#username-password', password);

            // Submit form
            console.log('   Submitting login...');
            await this.page.press('input#username-password', 'Enter');

            // Wait for login to complete
            await this.page.waitForTimeout(5000);

            // Check if login was successful by looking for user info
            try {
                await this.page.waitForSelector('.user-info, .profile, .account', { timeout: 5000 });
                console.log('✅ Login successful!');
            } catch (error) {
                console.log('   ⚠️  Could not verify login, but continuing...');
            }

        } catch (error) {
            console.error('   ❌ Error during login:', error.message);
            console.log('💡 Please login manually in the browser window');
            console.log('💡 Then press Enter here to continue...');

            await this.waitForManualLogin();
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

        for (let i = 0; i < 15; i++) {
            try {
                // Wait for iframe
                await this.page.waitForSelector('iframe', { timeout: 10000 });

                // Check if iframe has content
                const iframe = await this.page.$('iframe');
                const frame = await iframe.contentFrame();

                if (frame) {
                    // Wait for game elements
                    await frame.waitForSelector('.teams-vs-btn, .scoreboard', { timeout: 5000 });
                    console.log('✅ Game loaded successfully!');
                    return;
                }

            } catch (error) {
                console.log(`   Waiting for game... (${i + 1}/15)`);
                await this.page.waitForTimeout(3000);
            }
        }

        console.log('⚠️  Game loading timeout, but continuing...');
    }

// Other existing methods...

    async startScraping() {
        console.log('🎯 Starting to scrape matches...');
        console.log('   Monitoring every 20 seconds');
        console.log('   Will handle login popups automatically');
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
            } catch (error) {
                console.error('⚠️  Error in scrape cycle:', error.message);
            }

            await this.sleep(20000);
        }
    }

    // Replace extractOdds method with the new extractOddsData method inside your scraping logic
    async scrapeCycle() {
        try {
            // STEP 1: Check for and handle login popup
            await this.handleLoginPopup();

            // STEP 2: Check for inactivity popup
            await this.handleInactivityPopup();

            // STEP 3: Get iframe
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

            // STEP 4: Extract tournament stage
            const tournamentStage = await this.extractStage(frame);
            this.currentStage = tournamentStage;

            // STEP 5: Try to get live match
            await this.getLiveMatch(frame);

            // STEP 6: Extract and process matches
            const matches = await this.extractMatches(frame);
            console.log(`   📊 Found ${matches.length} match(es) in ${tournamentStage}`);

            // STEP 7: Extract odds data (replace old extractOdds call with this)
            await this.extractOddsData(frame, tournamentStage);

            for (const match of matches) {
                await this.processMatch(match, tournamentStage);
            }

        } catch (error) {
            console.log('   ⚠️  Error in scrape cycle:', error.message);
        }
    }

    // Rest of the methods...

    async handleInactivityPopup() {
        const inactivityPopupSelector = '.overlay-content h1:has-text("Notification of inactivity time") + button';

        try {
            const inactivityPopupButton = await this.page.$(inactivityPopupSelector);
            if (inactivityPopupButton) {
                const isVisible = await inactivityPopupButton.isVisible();
                if (isVisible) {
                    console.log('   Found inactivity popup, clicking "Click to initiate gameplay"...');
                    await inactivityPopupButton.click();
                    await this.page.waitForTimeout(3000);
                    console.log('   Inactivity popup handled successfully.');
                }
            }
        } catch (error) {
            // No inactivity popup found, that's okay
        }
    }

    async handleLoginPopup() {
        // Handle the popup login button that appears during gameplay
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
                    // Wait for popup to close
                    await this.page.waitForTimeout(3000);
                }
            }
        } catch (error) {
            // No popup found, that's okay
        }
    }

    async extractStage(frame) {
        try {
            // Try to get stage from h1
            const stage = await frame.$eval('.component-head.day-toggle h1', el => el.textContent.trim());
            if (stage) {
                return this.cleanStage(stage);
            }
        } catch (error) {
            // Try alternative
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
            // No live match, that's normal
        }
    }

    async extractMatches(frame) {
        const matches = [];

        try {
            // Get all match elements
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
                    // Skip this element
                }
            }
        } catch (error) {
            console.log('   ⚠️  Error extracting matches:', error.message);
        }

        return matches;
    }

    async processMatch(matchData, tournamentStage) {
        try {
            // Clean score
            const cleanScore = matchData.score.replace(/[^\d:]/g, '');
            if (!cleanScore.includes(':')) return;

            const [homeScore, awayScore] = cleanScore.split(':').map(Number);

            // Create unique key
            const key = `${tournamentStage}-${matchData.home}-${matchData.away}-${cleanScore}`;

            if (!this.savedKeys.has(key)) {
                // Determine result
                let result = 'DRAW';
                if (homeScore > awayScore) result = `${matchData.home} WIN`;
                else if (awayScore > homeScore) result = `${matchData.away} WIN`;

                // Create entry
                const newEntry = {
                    matchNo: this.data.length + 1,
                    tournament_stage: tournamentStage,
                    homeTeam: matchData.home,
                    awayTeam: matchData.away,
                    fullTimeScore: cleanScore,
                    result: result,
                    savedAt: new Date().toISOString(),
                    is_final: 1
                };

                // Add to memory
                this.data.push(newEntry);
                this.savedKeys.add(key);

                // Save to JSON
                await fs.writeFile(this.jsonFile, JSON.stringify(this.data, null, 2));

                // Save to database
                await this.saveToDatabase(newEntry);

                // Display
                console.log(`   🎯 NEW MATCH SAVED!`);
                console.log(`       🏆 ${tournamentStage}`);
                console.log(`       ⚽ ${matchData.home} ${cleanScore} ${matchData.away}`);
                console.log(`       📊 ${result}`);
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
                    console.log('   💾 Saved to database');
                    resolve();
                }
            });
        });
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
        console.log(`   JSON file: ${this.jsonFile}`);

        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('❌ Error closing database:', err.message);
                } else {
                    console.log('✅ Database closed');
                }
            });
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