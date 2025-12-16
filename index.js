// index.js - SIMPLIFIED VERSION WITHOUT CREDENTIALS AFTER POPUP
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
                    console.log('✅ Database table ready');
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
            // Go directly to virtual football page
            console.log('   Opening virtual football page...');

            await this.page.goto('https://linebet.com/en/virtualsports?product=266&game=123472', {
                waitUntil: 'domcontentloaded',
                timeout: 120000
            });

            // Wait for page to load
            await this.page.waitForTimeout(3000);

            // Check if login is needed
            const needsLogin = await this.checkIfLoginNeeded();

            if (needsLogin) {
                console.log('   Login required, attempting to login...');
                await this.performInitialLogin();
            } else {
                console.log('✅ Already logged in!');
            }

            // Wait for game to load
            await this.waitForGame();

            console.log('✅ Ready to start scraping!\n');

        } catch (error) {
            console.error('❌ Navigation failed:', error.message);
            throw error;
        }
    }

    async checkIfLoginNeeded() {
        try {
            // Check for login button or login form
            const loginButton = await this.page.$('button:has-text("Log in"), button:has-text("Login")');
            const loginForm = await this.page.$('input#username, input[name="username"]');

            return !!(loginButton || loginForm);
        } catch (error) {
            return false;
        }
    }

    async performInitialLogin() {
        try {
            // Look for login button
            const loginButton = await this.page.$('button:has-text("Log in"), button:has-text("Login")');
            if (loginButton) {
                console.log('   Clicking login button...');
                await loginButton.click();
                await this.page.waitForTimeout(2000);
            }

            // Check if login form appears
            const usernameField = await this.page.$('input#username, input[name="username"]').catch(() => null);
            if (usernameField) {
                console.log('   Filling credentials...');
                await usernameField.fill(username);

                const passwordField = await this.page.$('input#username-password, input[name="password"]');
                if (passwordField) {
                    await passwordField.fill(password);
                    await passwordField.press('Enter');
                    await this.page.waitForTimeout(5000);
                    console.log('✅ Login submitted');
                }
            }

        } catch (error) {
            console.log('⚠️  Could not perform initial login:', error.message);
            console.log('💡 Please login manually and press Enter...');
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

        for (let i = 0; i < 20; i++) {
            try {
                await this.page.waitForSelector('iframe', { timeout: 5000 });

                // Check if iframe has content
                const iframe = await this.page.$('iframe');
                const frame = await iframe.contentFrame();

                // Wait for game elements
                await frame.waitForSelector('.teams-vs-btn, .scoreboard', { timeout: 5000 });

                console.log('✅ Game loaded successfully!');
                return;

            } catch (error) {
                console.log(`   Waiting... (${i + 1}/20)`);
                await this.page.waitForTimeout(3000);
            }
        }

        console.log('⚠️  Game loading timeout, but continuing...');
    }

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

    async scrapeCycle() {
        try {
            // STEP 1: Check for and handle login popup (JUST CLICK, NO CREDENTIALS)
            await this.handleLoginPopup();

            // STEP 2: Get iframe
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

            // STEP 3: Extract tournament stage
            const tournamentStage = await this.extractStage(frame);
            this.currentStage = tournamentStage;

            // STEP 4: Try to get live match
            await this.getLiveMatch(frame);

            // STEP 5: Extract and process matches
            const matches = await this.extractMatches(frame);
            console.log(`   📊 Found ${matches.length} match(es) in ${tournamentStage}`);

            for (const match of matches) {
                await this.processMatch(match, tournamentStage);
            }

        } catch (error) {
            console.log('   ⚠️  Error in scrape cycle:', error.message);
        }
    }

    async handleLoginPopup() {
        // Only handle the popup login button, no credentials needed
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

        if (this.db) {
            this.db.close();
            console.log('✅ Database closed');
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