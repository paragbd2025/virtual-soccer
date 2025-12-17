// database.js - Complete version with all required methods
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');

class BettingDatabase {
    constructor() {
        this.db = null;
        this.dbPath = './virtual_football_betting.db';
        this.initialBalance = 1000;
    }

    async initialize() {
        console.log('\n📊 INITIALIZING BETTING DATABASE...');
        console.log('='.repeat(70));

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err.message);
                    reject(err);
                    return;
                }
                console.log('✅ Connected to SQLite database');

                this.db.run('PRAGMA foreign_keys = ON', async (err) => {
                    if (err) {
                        console.error('❌ Failed to enable foreign keys:', err.message);
                        reject(err);
                        return;
                    }

                    await this.createTables();
                    await this.initializeAccount();
                    await this.showDatabaseInfo();

                    console.log('\n✅ Database initialization complete!\n');
                    resolve();
                });
            });
        });
    }

    async createTables() {
        console.log('\n📝 CREATING TABLES...');

        const tables = [
            `CREATE TABLE IF NOT EXISTS tournament_stages (
                                                              stage_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                              stage_name TEXT UNIQUE NOT NULL,
                                                              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             )`,

            `CREATE TABLE IF NOT EXISTS teams (
                                                  team_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  team_name TEXT UNIQUE NOT NULL,
                                                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             )`,

            `CREATE TABLE IF NOT EXISTS matches (
                                                    match_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                    match_number INTEGER,
                                                    stage_id INTEGER,
                                                    home_team_id INTEGER,
                                                    away_team_id INTEGER,
                                                    home_score INTEGER DEFAULT 0,
                                                    away_score INTEGER DEFAULT 0,
                                                    full_time_score TEXT,
                                                    match_date DATE,
                                                    match_time TIME,
                                                    status TEXT DEFAULT 'SCHEDULED',
                                                    result TEXT,
                                                    is_final BOOLEAN DEFAULT 0,
                                                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                    FOREIGN KEY (stage_id) REFERENCES tournament_stages(stage_id),
                FOREIGN KEY (home_team_id) REFERENCES teams(team_id),
                FOREIGN KEY (away_team_id) REFERENCES teams(team_id)
                )`,

            `CREATE TABLE IF NOT EXISTS betting_odds (
                                                         odds_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                         match_id INTEGER,
                                                         home_odds DECIMAL(5,2),
                draw_odds DECIMAL(5,2),
                away_odds DECIMAL(5,2),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (match_id) REFERENCES matches(match_id)
                )`,

            `CREATE TABLE IF NOT EXISTS account (
                                                    account_id INTEGER PRIMARY KEY CHECK (account_id = 1),
                balance DECIMAL(10,2) DEFAULT 1000.00,
                total_deposits DECIMAL(10,2) DEFAULT 0.00,
                total_withdrawals DECIMAL(10,2) DEFAULT 0.00,
                total_wins INTEGER DEFAULT 0,
                total_losses INTEGER DEFAULT 0,
                total_profit_loss DECIMAL(10,2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,

            `CREATE TABLE IF NOT EXISTS bets (
                                                 bet_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                 match_id INTEGER,
                                                 team_bet_on TEXT,
                                                 odds_taken DECIMAL(5,2),
                amount DECIMAL(10,2),
                potential_win DECIMAL(10,2),
                actual_win DECIMAL(10,2) DEFAULT 0.00,
                status TEXT DEFAULT 'PENDING',
                placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                settled_at TIMESTAMP,
                profit_loss DECIMAL(10,2) DEFAULT 0.00,
                FOREIGN KEY (match_id) REFERENCES matches(match_id)
                )`,

            `CREATE TABLE IF NOT EXISTS transactions (
                                                         transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                         bet_id INTEGER,
                                                         type TEXT,
                                                         amount DECIMAL(10,2),
                balance_before DECIMAL(10,2),
                balance_after DECIMAL(10,2),
                description TEXT,
                transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (bet_id) REFERENCES bets(bet_id)
                )`
        ];

        for (let i = 0; i < tables.length; i++) {
            await this.runQuery(tables[i]);
        }
        console.log('✅ All tables created/verified');
    }

    async runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('❌ Query error:', err.message);
                    console.error('SQL:', sql);
                    console.error('Params:', params);
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ Query error:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async initializeAccount() {
        try {
            const checkAccount = await this.query('SELECT * FROM account WHERE account_id = 1');

            if (checkAccount.length === 0) {
                await this.runQuery(
                    'INSERT INTO account (account_id, balance) VALUES (1, ?)',
                    [this.initialBalance]
                );

                await this.runQuery(
                    `INSERT INTO transactions (type, amount, balance_before, balance_after, description)
                     VALUES ('DEPOSIT', ?, 0, ?, 'Initial account setup')`,
                    [this.initialBalance, this.initialBalance]
                );
            }
        } catch (error) {
            console.error('❌ Error initializing account:', error.message);
        }
    }

    async getOrCreateStage(stageName) {
        try {
            const existing = await this.query(
                'SELECT stage_id FROM tournament_stages WHERE stage_name = ?',
                [stageName]
            );

            if (existing.length > 0) {
                return existing[0].stage_id;
            }

            const result = await this.runQuery(
                'INSERT INTO tournament_stages (stage_name) VALUES (?)',
                [stageName]
            );

            return result.lastID;

        } catch (error) {
            console.error('❌ Error getting/creating stage:', error.message);
            return null;
        }
    }

    async getOrCreateTeam(teamName) {
        try {
            const existing = await this.query(
                'SELECT team_id FROM teams WHERE team_name = ?',
                [teamName]
            );

            if (existing.length > 0) {
                return existing[0].team_id;
            }

            const result = await this.runQuery(
                'INSERT INTO teams (team_name) VALUES (?)',
                [teamName]
            );

            return result.lastID;

        } catch (error) {
            console.error('❌ Error getting/creating team:', error.message);
            return null;
        }
    }

    async saveMatch(matchData) {
        try {
            console.log(`   💾 Attempting to save match: ${matchData.homeTeam} vs ${matchData.awayTeam}`);

            // Get or create stage
            const stageId = await this.getOrCreateStage(matchData.tournament_stage);
            if (!stageId) throw new Error('Failed to get/create stage');

            // Get or create teams
            const homeTeamId = await this.getOrCreateTeam(matchData.homeTeam);
            const awayTeamId = await this.getOrCreateTeam(matchData.awayTeam);
            if (!homeTeamId || !awayTeamId) throw new Error('Failed to get/create teams');

            // Parse scores
            let homeScore = 0, awayScore = 0, result = null;
            if (matchData.fullTimeScore) {
                const scores = matchData.fullTimeScore.split(':').map(Number);
                homeScore = scores[0] || 0;
                awayScore = scores[1] || 0;

                if (homeScore > awayScore) {
                    result = 'HOME_WIN';
                } else if (awayScore > homeScore) {
                    result = 'AWAY_WIN';
                } else {
                    result = 'DRAW';
                }
            }

            const now = new Date();
            const matchDate = now.toISOString().split('T')[0];
            const matchTime = now.toTimeString().split(' ')[0];

            // Check if match already exists (by stage, teams, and date)
            const existingMatch = await this.query(`
                SELECT match_id FROM matches
                WHERE stage_id = ?
                  AND home_team_id = ?
                  AND away_team_id = ?
                  AND match_date = ?
            `, [stageId, homeTeamId, awayTeamId, matchDate]);

            if (existingMatch.length > 0) {
                // Update existing match
                await this.runQuery(`
                    UPDATE matches
                    SET home_score = ?, away_score = ?, full_time_score = ?,
                        status = 'COMPLETED', result = ?, is_final = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE match_id = ?
                `, [
                    homeScore,
                    awayScore,
                    matchData.fullTimeScore,
                    result,
                    matchData.is_final || 0,
                    existingMatch[0].match_id
                ]);

                console.log(`   ✅ Updated match in database: ${matchData.homeTeam} ${matchData.fullTimeScore} ${matchData.awayTeam}`);
                return existingMatch[0].match_id;
            } else {
                // Insert new match
                const queryResult = await this.runQuery(`
                    INSERT INTO matches
                    (match_number, stage_id, home_team_id, away_team_id,
                     home_score, away_score, full_time_score, match_date, match_time,
                     status, result, is_final)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    matchData.matchNo,
                    stageId,
                    homeTeamId,
                    awayTeamId,
                    homeScore,
                    awayScore,
                    matchData.fullTimeScore,
                    matchDate,
                    matchTime,
                    'COMPLETED',
                    result,
                    matchData.is_final || 0
                ]);

                console.log(`   ✅ Saved NEW match to database: ${matchData.homeTeam} ${matchData.fullTimeScore} ${matchData.awayTeam}`);
                return queryResult.lastID;
            }

        } catch (error) {
            console.error(`   ❌ Error saving match ${matchData.homeTeam} vs ${matchData.awayTeam}:`, error.message);
            console.error('   Match data:', matchData);
            return null;
        }
    }

    async saveOdds(oddsData) {
        try {
            console.log(`   💾 Attempting to save odds for: ${oddsData.home_team} vs ${oddsData.away_team}`);

            // First, get or create a scheduled match for these odds
            const stageId = await this.getOrCreateStage(oddsData.tournament_stage);
            const homeTeamId = await this.getOrCreateTeam(oddsData.home_team);
            const awayTeamId = await this.getOrCreateTeam(oddsData.away_team);

            const now = new Date();
            const matchDate = now.toISOString().split('T')[0];

            // Check for existing scheduled match
            let match = await this.query(`
                SELECT match_id FROM matches
                WHERE stage_id = ?
                  AND home_team_id = ?
                  AND away_team_id = ?
                  AND status = 'SCHEDULED'
                ORDER BY created_at DESC LIMIT 1
            `, [stageId, homeTeamId, awayTeamId]);

            let matchId;

            if (match.length === 0) {
                // Create a new scheduled match
                console.log(`   📅 Creating new scheduled match for odds`);

                const result = await this.runQuery(`
                    INSERT INTO matches
                        (stage_id, home_team_id, away_team_id, match_date, status)
                    VALUES (?, ?, ?, ?, 'SCHEDULED')
                `, [stageId, homeTeamId, awayTeamId, matchDate]);

                matchId = result.lastID;
            } else {
                matchId = match[0].match_id;
            }

            // Save the odds
            await this.runQuery(`
                INSERT INTO betting_odds (match_id, home_odds, draw_odds, away_odds)
                VALUES (?, ?, ?, ?)
            `, [matchId, oddsData.home_odds, oddsData.draw_odds, oddsData.away_odds]);

            console.log(`   ✅ Saved odds for match ${matchId}: ${oddsData.home_team} vs ${oddsData.away_team}`);
            return matchId;

        } catch (error) {
            console.error('   ❌ Error saving odds:', error.message);
            return null;
        }
    }

    async placeBet(matchId, teamToBetOn, amount, odds) {
        try {
            console.log(`   💰 Placing bet: $${amount} on ${teamToBetOn} at odds ${odds}`);

            // Get current account balance
            const account = await this.query('SELECT * FROM account WHERE account_id = 1');
            if (account.length === 0) {
                console.error('   ❌ Account not found');
                return false;
            }

            const currentBalance = parseFloat(account[0].balance);

            // Check if sufficient balance
            if (currentBalance < amount) {
                console.error(`   ❌ Insufficient balance: $${currentBalance.toFixed(2)} < $${amount}`);
                return false;
            }

            // Calculate potential win
            const potentialWin = amount * odds;

            // Insert bet
            const betResult = await this.runQuery(`
                INSERT INTO bets (match_id, team_bet_on, odds_taken, amount, potential_win)
                VALUES (?, ?, ?, ?, ?)
            `, [matchId, teamToBetOn, odds, amount, potentialWin]);

            // Update account balance
            const newBalance = currentBalance - amount;
            await this.runQuery(`
                UPDATE account SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = 1
            `, [newBalance]);

            // Record transaction
            await this.runQuery(`
                INSERT INTO transactions (bet_id, type, amount, balance_before, balance_after, description)
                VALUES (?, 'BET_PLACED', ?, ?, ?, ?)
            `, [betResult.lastID, amount, currentBalance, newBalance, `Bet placed on ${teamToBetOn}`]);

            console.log(`   ✅ Bet placed! ID: ${betResult.lastID}, New balance: $${newBalance.toFixed(2)}`);
            console.log(`   🎯 Potential win: $${potentialWin.toFixed(2)}`);

            return betResult.lastID;

        } catch (error) {
            console.error('   ❌ Error placing bet:', error.message);
            return false;
        }
    }

    async settleBet(matchId, result) {
        try {
            console.log(`   ⚖️ Settling bets for match ${matchId} with result: ${result}`);

            // Get all pending bets for this match
            const pendingBets = await this.query(`
                SELECT b.*, m.home_score, m.away_score, m.full_time_score,
                       ht.team_name as home_team, at.team_name as away_team
                FROM bets b
                JOIN matches m ON b.match_id = m.match_id
                JOIN teams ht ON m.home_team_id = ht.team_id
                JOIN teams at ON m.away_team_id = at.team_id
                WHERE b.match_id = ? AND b.status = 'PENDING'
            `, [matchId]);

            if (pendingBets.length === 0) {
                console.log(`   ℹ️ No pending bets to settle for match ${matchId}`);
                return;
            }

            console.log(`   📊 Found ${pendingBets.length} pending bet(s) to settle`);

            // Get current account balance
            const account = await this.query('SELECT * FROM account WHERE account_id = 1');
            if (account.length === 0) {
                console.error('   ❌ Account not found');
                return;
            }

            let currentBalance = parseFloat(account[0].balance);
            let totalWins = account[0].total_wins;
            let totalLosses = account[0].total_losses;
            let totalProfitLoss = parseFloat(account[0].total_profit_loss);

            // Settle each bet
            for (const bet of pendingBets) {
                let newStatus = 'LOST';
                let actualWin = 0;
                let profitLoss = -parseFloat(bet.amount);
                let description = '';

                // Determine bet outcome
                const betResult = this.determineBetResult(bet.team_bet_on, result, bet.home_score, bet.away_score);

                if (betResult === 'WIN') {
                    newStatus = 'WON';
                    actualWin = parseFloat(bet.potential_win);
                    profitLoss = actualWin - parseFloat(bet.amount);
                    description = `Bet won on ${bet.team_bet_on} (${bet.home_team} ${bet.full_time_score} ${bet.away_team})`;

                    totalWins++;
                } else if (betResult === 'LOSS') {
                    newStatus = 'LOST';
                    actualWin = 0;
                    profitLoss = -parseFloat(bet.amount);
                    description = `Bet lost on ${bet.team_bet_on} (${bet.home_team} ${bet.full_time_score} ${bet.away_team})`;

                    totalLosses++;
                } else {
                    // Push (draw when betting on draw)
                    newStatus = 'PUSH';
                    actualWin = parseFloat(bet.amount); // Return stake
                    profitLoss = 0;
                    description = `Bet pushed on ${bet.team_bet_on} (${bet.home_team} ${bet.full_time_score} ${bet.away_team})`;
                }

                // Update balance
                const balanceBefore = currentBalance;
                currentBalance += profitLoss;
                totalProfitLoss += profitLoss;

                // Update bet
                await this.runQuery(`
                    UPDATE bets 
                    SET status = ?, actual_win = ?, profit_loss = ?, settled_at = CURRENT_TIMESTAMP
                    WHERE bet_id = ?
                `, [newStatus, actualWin, profitLoss, bet.bet_id]);

                // Record transaction
                await this.runQuery(`
                    INSERT INTO transactions (bet_id, type, amount, balance_before, balance_after, description)
                    VALUES (?, 'BET_SETTLEMENT', ?, ?, ?, ?)
                `, [bet.bet_id, profitLoss, balanceBefore, currentBalance, description]);

                console.log(`   ${newStatus === 'WON' ? '✅' : newStatus === 'LOST' ? '❌' : '➖'} Bet ${bet.bet_id}: ${newStatus} (${profitLoss > 0 ? '+' : ''}$${profitLoss.toFixed(2)})`);
            }

            // Update account summary
            await this.runQuery(`
                UPDATE account 
                SET balance = ?, total_wins = ?, total_losses = ?, total_profit_loss = ?, updated_at = CURRENT_TIMESTAMP
                WHERE account_id = 1
            `, [currentBalance, totalWins, totalLosses, totalProfitLoss]);

            console.log(`   💰 New balance: $${currentBalance.toFixed(2)} (${totalProfitLoss > 0 ? '+' : ''}$${totalProfitLoss.toFixed(2)} total)`);

        } catch (error) {
            console.error('   ❌ Error settling bets:', error.message);
        }
    }

    determineBetResult(teamBetOn, matchResult, homeScore, awayScore) {
        // If match result is a draw
        if (matchResult === 'DRAW') {
            return teamBetOn === 'DRAW' ? 'WIN' : 'LOSS';
        }

        // If betting on home team
        if (teamBetOn === 'HOME') {
            return matchResult === 'HOME_WIN' ? 'WIN' : 'LOSS';
        }

        // If betting on away team
        if (teamBetOn === 'AWAY') {
            return matchResult === 'AWAY_WIN' ? 'WIN' : 'LOSS';
        }

        return 'LOSS'; // Default to loss
    }

    async getAccountSummary() {
        try {
            const account = await this.query('SELECT * FROM account WHERE account_id = 1');
            if (account.length === 0) return null;

            const stats = account[0];
            const recentBets = await this.query(`
                SELECT b.*, ht.team_name as home_team, at.team_name as away_team
                FROM bets b
                JOIN matches m ON b.match_id = m.match_id
                JOIN teams ht ON m.home_team_id = ht.team_id
                JOIN teams at ON m.away_team_id = at.team_id
                ORDER BY b.placed_at DESC LIMIT 10
            `);

            const totalBets = stats.total_wins + stats.total_losses;
            const winRate = totalBets > 0 ? (stats.total_wins / totalBets * 100).toFixed(1) : 0;

            return {
                account: stats,
                recentBets,
                winRate,
                totalBets
            };

        } catch (error) {
            console.error('❌ Error getting account summary:', error.message);
            return null;
        }
    }

    async getScheduledMatchesForBetting() {
        return await this.query(`
            SELECT m.match_id, ts.stage_name, ht.team_name as home_team,
                   at.team_name as away_team, bo.home_odds, bo.draw_odds, bo.away_odds,
                   bo.odds_id
            FROM matches m
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            JOIN betting_odds bo ON m.match_id = bo.match_id
            WHERE m.status = 'SCHEDULED'
            AND bo.is_active = 1
            ORDER BY m.created_at
        `);
    }

    async showDatabaseInfo() {
        try {
            console.log('\n📈 DATABASE TABLES INFORMATION:');
            console.log('='.repeat(70));

            const tables = [
                'tournament_stages',
                'teams',
                'matches',
                'betting_odds',
                'account',
                'bets',
                'transactions'
            ];

            for (const table of tables) {
                const count = await this.query(`SELECT COUNT(*) as count FROM ${table}`);
                console.log(`   ${table.padEnd(20)}: ${count[0].count} records`);
            }

            const account = await this.getAccountSummary();
            if (account) {
                console.log('\n💰 ACCOUNT SUMMARY:');
                console.log(`   Current Balance: $${account.account.balance.toFixed(2)}`);
                console.log(`   Total Wins: ${account.account.total_wins}`);
                console.log(`   Total Losses: ${account.account.total_losses}`);
                console.log(`   Win Rate: ${account.winRate}%`);
            }

            console.log('\n⚽ RECENT MATCHES IN DATABASE:');
            console.log('-'.repeat(70));

            const recentMatches = await this.query(`
                SELECT m.match_id, ts.stage_name, ht.team_name as home_team,
                       at.team_name as away_team, m.full_time_score, m.result
                FROM matches m
                         JOIN tournament_stages ts ON m.stage_id = ts.stage_id
                         JOIN teams ht ON m.home_team_id = ht.team_id
                         JOIN teams at ON m.away_team_id = at.team_id
                WHERE m.status = 'COMPLETED'
                ORDER BY m.created_at DESC
                    LIMIT 5
            `);

            if (recentMatches.length > 0) {
                recentMatches.forEach(match => {
                    console.log(`   ${match.stage_name}: ${match.home_team} ${match.full_time_score || 'vs'} ${match.away_team}`);
                    if (match.result) console.log(`      Result: ${match.result}`);
                });
            } else {
                console.log('   No matches found in database');
            }

        } catch (error) {
            console.error('❌ Error showing database info:', error.message);
        }
    }

    async getScheduledMatches() {
        return await this.query(`
            SELECT m.match_id, ts.stage_name, ht.team_name as home_team,
                   at.team_name as away_team, bo.home_odds, bo.draw_odds, bo.away_odds
            FROM matches m
                     JOIN tournament_stages ts ON m.stage_id = ts.stage_id
                     JOIN teams ht ON m.home_team_id = ht.team_id
                     JOIN teams at ON m.away_team_id = at.team_id
                LEFT JOIN betting_odds bo ON m.match_id = bo.match_id
            WHERE m.status = 'SCHEDULED'
            ORDER BY m.created_at
        `);
    }

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('✅ Database connection closed');
                    resolve();
                }
            });
        });
    }
}

module.exports = BettingDatabase;