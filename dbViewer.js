// dbViewer.js - Interactive Database Viewer
const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');

class DatabaseViewer {
    constructor() {
        this.dbPath = './virtual_football_betting.db';
        this.db = null;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Cannot connect to database:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Connected to database:', this.dbPath);
                    resolve();
                }
            });
        });
    }

    query(sql, params = []) {
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

    async showMainMenu() {
        console.clear();
        console.log('='.repeat(70));
        console.log('📊 VIRTUAL FOOTBALL DATABASE VIEWER');
        console.log('='.repeat(70));

        const summary = await this.getDatabaseSummary();

        console.log('\n📈 DATABASE SUMMARY:');
        console.log(`   Account Balance: $${summary.account?.balance?.toFixed(2) || '0.00'}`);
        console.log(`   Total Matches: ${summary.matchCount}`);
        console.log(`   Total Teams: ${summary.teamCount}`);
        console.log(`   Tournament Stages: ${summary.stageCount}`);
        console.log(`   Odds Records: ${summary.oddsCount}`);
        console.log(`   Bets Placed: ${summary.betCount}`);
        console.log(`   Transactions: ${summary.transactionCount}`);

        console.log('\n📋 MAIN MENU:');
        console.log('1. 🔍 View Account & Bets');
        console.log('2. ⚽ View Matches & Results');
        console.log('3. 💰 View Betting Odds');
        console.log('4. 🏆 View Tournament Stages');
        console.log('5. 🏅 View Teams');
        console.log('6. 💳 View Transactions');
        console.log('7. 📊 View Statistics & Reports');
        console.log('8. 📤 Export Data');
        console.log('9. 🔄 Run SQL Query');
        console.log('0. 🚪 Exit\n');
    }

    async getDatabaseSummary() {
        try {
            const [
                account,
                stages,
                teams,
                matches,
                odds,
                bets,
                transactions
            ] = await Promise.all([
                this.query("SELECT * FROM account WHERE account_id = 1"),
                this.query("SELECT COUNT(*) as count FROM tournament_stages"),
                this.query("SELECT COUNT(*) as count FROM teams"),
                this.query("SELECT COUNT(*) as count FROM matches"),
                this.query("SELECT COUNT(*) as count FROM betting_odds"),
                this.query("SELECT COUNT(*) as count FROM bets"),
                this.query("SELECT COUNT(*) as count FROM transactions")
            ]);

            return {
                account: account[0],
                stageCount: stages[0].count,
                teamCount: teams[0].count,
                matchCount: matches[0].count,
                oddsCount: odds[0].count,
                betCount: bets[0].count,
                transactionCount: transactions[0].count
            };
        } catch (error) {
            console.log('Error getting summary:', error.message);
            return {};
        }
    }

    async viewAccountAndBets() {
        console.clear();
        console.log('💰 ACCOUNT & BETS');
        console.log('='.repeat(70));

        // Account info
        const account = await this.query("SELECT * FROM account WHERE account_id = 1");
        if (account[0]) {
            console.log('\n📈 ACCOUNT SUMMARY:');
            console.log(`   Balance: $${account[0].balance.toFixed(2)}`);
            console.log(`   Total Wins: ${account[0].total_wins}`);
            console.log(`   Total Losses: ${account[0].total_losses}`);
            console.log(`   Total Deposits: $${account[0].total_deposits.toFixed(2)}`);
            console.log(`   Total Withdrawals: $${account[0].total_withdrawals.toFixed(2)}`);
            console.log(`   Total Profit/Loss: $${account[0].total_profit_loss.toFixed(2)}`);

            const totalBets = account[0].total_wins + account[0].total_losses;
            const winRate = totalBets > 0 ? (account[0].total_wins / totalBets * 100).toFixed(1) : 0;
            console.log(`   Win Rate: ${winRate}%`);
        }

        // Recent bets
        console.log('\n🎰 RECENT BETS:');
        const bets = await this.query(`
            SELECT b.*, ht.team_name as home_team, at.team_name as away_team,
                   ts.stage_name, m.full_time_score, m.result as match_result
            FROM bets b
            JOIN matches m ON b.match_id = m.match_id
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            ORDER BY b.placed_at DESC
            LIMIT 10
        `);

        if (bets.length > 0) {
            bets.forEach(bet => {
                const statusIcon = bet.status === 'WON' ? '✅' :
                    bet.status === 'LOST' ? '❌' : '⏳';
                console.log(`\n${statusIcon} Bet #${bet.bet_id}: ${bet.home_team} vs ${bet.away_team}`);
                console.log(`   ${bet.stage_name} | Bet on: ${bet.team_bet_on} | Odds: ${bet.odds_taken}`);
                console.log(`   Amount: $${bet.amount} | Potential: $${bet.potential_win.toFixed(2)}`);
                console.log(`   Status: ${bet.status} | Placed: ${bet.placed_at}`);
                if (bet.status !== 'PENDING') {
                    console.log(`   Actual: $${bet.actual_win.toFixed(2)} | P/L: $${bet.profit_loss.toFixed(2)}`);
                    if (bet.full_time_score) {
                        console.log(`   Result: ${bet.full_time_score} (${bet.match_result})`);
                    }
                }
            });
        } else {
            console.log('   No bets placed yet.');
        }

        await this.waitForInput();
    }

    async viewMatchesAndResults() {
        console.clear();
        console.log('⚽ MATCHES & RESULTS');
        console.log('='.repeat(70));

        console.log('\n1. Recent Completed Matches');
        console.log('2. Upcoming Scheduled Matches');
        console.log('3. Search Matches by Team');
        console.log('4. View by Tournament Stage');
        console.log('5. Back to Main Menu\n');

        const choice = await this.askQuestion('Select option (1-5): ');

        switch (choice) {
            case '1':
                await this.viewRecentMatches();
                break;
            case '2':
                await this.viewScheduledMatches();
                break;
            case '3':
                await this.searchMatchesByTeam();
                break;
            case '4':
                await this.viewMatchesByStage();
                break;
            case '5':
                return;
            default:
                console.log('Invalid choice');
        }
    }

    async viewRecentMatches() {
        const matches = await this.query(`
            SELECT m.match_id, ts.stage_name, 
                   ht.team_name as home_team, at.team_name as away_team,
                   m.home_score, m.away_score, m.full_time_score,
                   m.result, m.match_date, m.match_time
            FROM matches m
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            WHERE m.status = 'COMPLETED'
            ORDER BY m.match_date DESC, m.match_time DESC
            LIMIT 20
        `);

        console.clear();
        console.log('✅ RECENT COMPLETED MATCHES');
        console.log('='.repeat(70));

        if (matches.length === 0) {
            console.log('No completed matches found.');
        } else {
            // Group by stage
            const grouped = {};
            matches.forEach(match => {
                if (!grouped[match.stage_name]) {
                    grouped[match.stage_name] = [];
                }
                grouped[match.stage_name].push(match);
            });

            Object.entries(grouped).forEach(([stage, stageMatches]) => {
                console.log(`\n🏆 ${stage}:`);
                console.log('-'.repeat(50));
                stageMatches.forEach(match => {
                    console.log(`   ${match.home_team} ${match.full_time_score} ${match.away_team}`);
                    console.log(`   Result: ${match.result} | Date: ${match.match_date} ${match.match_time}`);
                    console.log(`   Match ID: ${match.match_id}\n`);
                });
            });
        }

        await this.waitForInput();
    }

    async viewScheduledMatches() {
        const matches = await this.query(`
            SELECT m.match_id, ts.stage_name, 
                   ht.team_name as home_team, at.team_name as away_team,
                   m.match_date, m.match_time, m.status,
                   bo.home_odds, bo.draw_odds, bo.away_odds
            FROM matches m
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            LEFT JOIN betting_odds bo ON m.match_id = bo.match_id
            WHERE m.status = 'SCHEDULED'
            ORDER BY m.match_date, m.match_time
        `);

        console.clear();
        console.log('📅 UPCOMING SCHEDULED MATCHES');
        console.log('='.repeat(70));

        if (matches.length === 0) {
            console.log('No scheduled matches found.');
        } else {
            console.log(`Found ${matches.length} scheduled match(es):\n`);

            matches.forEach(match => {
                console.log(`⚽ ${match.stage_name}: ${match.home_team} vs ${match.away_team}`);
                console.log(`   Date: ${match.match_date} ${match.match_time}`);
                console.log(`   Match ID: ${match.match_id}`);
                if (match.home_odds && match.draw_odds && match.away_odds) {
                    console.log(`   Odds: H ${match.home_odds} | D ${match.draw_odds} | A ${match.away_odds}`);
                } else {
                    console.log(`   Odds: Not available yet`);
                }
                console.log('');
            });
        }

        await this.waitForInput();
    }

    async viewBettingOdds() {
        console.clear();
        console.log('💰 BETTING ODDS');
        console.log('='.repeat(70));

        const odds = await this.query(`
            SELECT bo.*, ts.stage_name, 
                   ht.team_name as home_team, at.team_name as away_team,
                   m.status as match_status, m.match_date
            FROM betting_odds bo
            JOIN matches m ON bo.match_id = m.match_id
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            ORDER BY bo.timestamp DESC
            LIMIT 50
        `);

        if (odds.length === 0) {
            console.log('No odds data found.');
        } else {
            console.log(`Found ${odds.length} odds records:\n`);

            // Group by match for better display
            const groupedOdds = {};
            odds.forEach(odd => {
                const key = `${odd.home_team} vs ${odd.away_team} (${odd.stage_name})`;
                if (!groupedOdds[key]) {
                    groupedOdds[key] = {
                        match_status: odd.match_status,
                        match_date: odd.match_date,
                        odds: []
                    };
                }
                groupedOdds[key].odds.push(odd);
            });

            Object.entries(groupedOdds).forEach(([match, data]) => {
                console.log(`⚽ ${match}`);
                console.log(`   Status: ${data.match_status} | Date: ${data.match_date}`);

                // Show latest 3 odds
                data.odds.slice(0, 3).forEach(odd => {
                    const time = new Date(odd.timestamp).toLocaleTimeString();
                    console.log(`   📊 ${time}: H=${odd.home_odds} | D=${odd.draw_odds} | A=${odd.away_odds}`);
                });

                if (data.odds.length > 3) {
                    console.log(`   ... and ${data.odds.length - 3} more odds records`);
                }
                console.log('');
            });
        }

        await this.waitForInput();
    }

    async viewStatistics() {
        console.clear();
        console.log('📊 STATISTICS & REPORTS');
        console.log('='.repeat(70));

        // Team performance
        const teamStats = await this.query(`
            SELECT 
                t.team_name,
                COUNT(*) as total_matches,
                SUM(CASE WHEN m.result = 'HOME_WIN' AND m.home_team_id = t.team_id THEN 1 
                         WHEN m.result = 'AWAY_WIN' AND m.away_team_id = t.team_id THEN 1 
                         ELSE 0 END) as wins,
                SUM(CASE WHEN m.result = 'DRAW' THEN 1 ELSE 0 END) as draws,
                SUM(CASE WHEN m.result = 'HOME_WIN' AND m.away_team_id = t.team_id THEN 1 
                         WHEN m.result = 'AWAY_WIN' AND m.home_team_id = t.team_id THEN 1 
                         ELSE 0 END) as losses,
                SUM(CASE WHEN m.home_team_id = t.team_id THEN m.home_score ELSE m.away_score END) as goals_scored,
                SUM(CASE WHEN m.home_team_id = t.team_id THEN m.away_score ELSE m.home_score END) as goals_conceded
            FROM teams t
            JOIN matches m ON t.team_id IN (m.home_team_id, m.away_team_id)
            WHERE m.status = 'COMPLETED'
            GROUP BY t.team_id
            HAVING total_matches > 0
            ORDER BY wins DESC, draws DESC
        `);

        console.log('\n🏆 TEAM PERFORMANCE STATISTICS:');
        console.log('-'.repeat(80));
        console.log('Team'.padEnd(15) + 'Matches'.padEnd(10) + 'W-D-L'.padEnd(10) + 'Goals'.padEnd(15) + 'Win %'.padEnd(10) + 'Points');
        console.log('-'.repeat(80));

        teamStats.forEach(team => {
            const winRate = ((team.wins / team.total_matches) * 100).toFixed(1);
            const goals = `${team.goals_scored}-${team.goals_conceded}`;
            const record = `${team.wins}-${team.draws}-${team.losses}`;
            const points = (team.wins * 3) + (team.draws * 1);

            console.log(
                team.team_name.padEnd(15) +
                team.total_matches.toString().padEnd(10) +
                record.padEnd(10) +
                goals.padEnd(15) +
                winRate.padEnd(10) + '%' +
                points.toString().padEnd(10)
            );
        });

        // Match result distribution
        const resultStats = await this.query(`
            SELECT result, COUNT(*) as count
            FROM matches
            WHERE result IS NOT NULL AND status = 'COMPLETED'
            GROUP BY result
            ORDER BY count DESC
        `);

        console.log('\n📈 MATCH RESULT DISTRIBUTION:');
        resultStats.forEach(stat => {
            const percentage = ((stat.count / teamStats.reduce((sum, t) => sum + t.total_matches, 0)) * 100).toFixed(1);
            console.log(`   ${stat.result}: ${stat.count} matches (${percentage}%)`);
        });

        // Tournament stage stats
        const stageStats = await this.query(`
            SELECT ts.stage_name, COUNT(*) as match_count
            FROM matches m
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            WHERE m.status = 'COMPLETED'
            GROUP BY ts.stage_id
            ORDER BY match_count DESC
        `);

        console.log('\n🎯 MATCHES BY TOURNAMENT STAGE:');
        stageStats.forEach(stage => {
            console.log(`   ${stage.stage_name}: ${stage.match_count} matches`);
        });

        await this.waitForInput();
    }

    async runCustomQuery() {
        console.clear();
        console.log('🔍 CUSTOM SQL QUERY');
        console.log('='.repeat(70));
        console.log('\nAvailable tables:');
        console.log('  • tournament_stages');
        console.log('  • teams');
        console.log('  • matches');
        console.log('  • betting_odds');
        console.log('  • account');
        console.log('  • bets');
        console.log('  • transactions');
        console.log('\nExample: SELECT * FROM matches LIMIT 5\n');

        const query = await this.askQuestion('Enter SQL query (or "back" to return): ');

        if (query.toLowerCase() === 'back') {
            return;
        }

        try {
            const rows = await this.query(query);

            if (rows.length === 0) {
                console.log('\n⚠️  No results found.');
            } else {
                console.log(`\n✅ Found ${rows.length} row(s):\n`);

                // Show column headers
                const columns = Object.keys(rows[0]);
                console.log(columns.join(' | '));
                console.log('-'.repeat(columns.length * 15));

                // Show data (limit to 20 rows for display)
                rows.slice(0, 20).forEach(row => {
                    const values = columns.map(col => {
                        const value = row[col];
                        if (value === null || value === undefined) return 'NULL';
                        if (typeof value === 'number' && !Number.isInteger(value)) {
                            return value.toFixed(2);
                        }
                        return String(value);
                    });
                    console.log(values.join(' | '));
                });

                if (rows.length > 20) {
                    console.log(`\n... and ${rows.length - 20} more rows`);
                }
            }
        } catch (error) {
            console.error('\n❌ Query error:', error.message);
        }

        await this.waitForInput();
    }

    async searchMatchesByTeam() {
        const teamName = await this.askQuestion('Enter team name to search: ');

        const matches = await this.query(`
            SELECT m.match_id, ts.stage_name, 
                   ht.team_name as home_team, at.team_name as away_team,
                   m.home_score, m.away_score, m.full_time_score,
                   m.result, m.match_date, m.match_time, m.status
            FROM matches m
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            WHERE (ht.team_name LIKE ? OR at.team_name LIKE ?)
            ORDER BY m.match_date DESC, m.match_time DESC
            LIMIT 20
        `, [`%${teamName}%`, `%${teamName}%`]);

        console.clear();
        console.log(`🔍 SEARCH RESULTS FOR "${teamName.toUpperCase()}"`);
        console.log('='.repeat(70));

        if (matches.length === 0) {
            console.log(`No matches found for team "${teamName}".`);
        } else {
            console.log(`Found ${matches.length} match(es):\n`);

            matches.forEach(match => {
                const statusIcon = match.status === 'COMPLETED' ? '✅' :
                    match.status === 'SCHEDULED' ? '📅' : '🔴';
                console.log(`${statusIcon} ${match.stage_name}: ${match.home_team} vs ${match.away_team}`);
                if (match.full_time_score) {
                    console.log(`   Score: ${match.full_time_score} | Result: ${match.result}`);
                }
                console.log(`   Date: ${match.match_date} ${match.match_time} | Status: ${match.status}\n`);
            });
        }

        await this.waitForInput();
    }

    async viewMatchesByStage() {
        // Get all tournament stages
        const stages = await this.query(`
            SELECT stage_name FROM tournament_stages 
            ORDER BY stage_name
        `);

        console.clear();
        console.log('🏆 SELECT TOURNAMENT STAGE');
        console.log('='.repeat(70));
        console.log('\nAvailable stages:');

        stages.forEach((stage, index) => {
            console.log(`${index + 1}. ${stage.stage_name}`);
        });

        const choice = await this.askQuestion('\nSelect stage number (or 0 to go back): ');
        const choiceNum = parseInt(choice);

        if (choiceNum === 0 || isNaN(choiceNum) || choiceNum < 1 || choiceNum > stages.length) {
            return;
        }

        const selectedStage = stages[choiceNum - 1].stage_name;

        const matches = await this.query(`
            SELECT m.match_id, 
                   ht.team_name as home_team, at.team_name as away_team,
                   m.home_score, m.away_score, m.full_time_score,
                   m.result, m.match_date, m.match_time, m.status
            FROM matches m
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            WHERE ts.stage_name = ?
            ORDER BY m.match_date DESC, m.match_time DESC
        `, [selectedStage]);

        console.clear();
        console.log(`🏆 ${selectedStage.toUpperCase()} - ALL MATCHES`);
        console.log('='.repeat(70));

        if (matches.length === 0) {
            console.log(`No matches found for ${selectedStage}.`);
        } else {
            console.log(`Found ${matches.length} match(es):\n`);

            matches.forEach(match => {
                const statusIcon = match.status === 'COMPLETED' ? '✅' :
                    match.status === 'SCHEDULED' ? '📅' : '🔴';
                console.log(`${statusIcon} ${match.home_team} vs ${match.away_team}`);
                if (match.full_time_score) {
                    console.log(`   Score: ${match.full_time_score} | Result: ${match.result}`);
                }
                console.log(`   Date: ${match.match_date} ${match.match_time} | Status: ${match.status}\n`);
            });
        }

        await this.waitForInput();
    }

    async viewTournamentStages() {
        const stages = await this.query(`
            SELECT ts.*, 
                   COUNT(m.match_id) as total_matches,
                   SUM(CASE WHEN m.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_matches,
                   SUM(CASE WHEN m.status = 'SCHEDULED' THEN 1 ELSE 0 END) as scheduled_matches
            FROM tournament_stages ts
            LEFT JOIN matches m ON ts.stage_id = m.stage_id
            GROUP BY ts.stage_id
            ORDER BY ts.stage_name
        `);

        console.clear();
        console.log('🏆 TOURNAMENT STAGES');
        console.log('='.repeat(70));

        if (stages.length === 0) {
            console.log('No tournament stages found.');
        } else {
            console.log(`Found ${stages.length} tournament stage(s):\n`);

            stages.forEach(stage => {
                console.log(`📊 ${stage.stage_name}`);
                console.log(`   ID: ${stage.stage_id}`);
                console.log(`   Matches: ${stage.total_matches} (${stage.completed_matches} completed, ${stage.scheduled_matches} scheduled)`);
                console.log(`   Created: ${stage.created_at}\n`);
            });
        }

        await this.waitForInput();
    }

    async viewTeams() {
        const teams = await this.query(`
            SELECT t.*, 
                   COUNT(CASE WHEN m.home_team_id = t.team_id THEN 1 END) as home_matches,
                   COUNT(CASE WHEN m.away_team_id = t.team_id THEN 1 END) as away_matches,
                   SUM(CASE WHEN m.result = 'HOME_WIN' AND m.home_team_id = t.team_id THEN 1 
                            WHEN m.result = 'AWAY_WIN' AND m.away_team_id = t.team_id THEN 1 
                            ELSE 0 END) as wins,
                   SUM(CASE WHEN m.result = 'DRAW' THEN 1 ELSE 0 END) as draws
            FROM teams t
            LEFT JOIN matches m ON t.team_id IN (m.home_team_id, m.away_team_id)
            GROUP BY t.team_id
            ORDER BY t.team_name
        `);

        console.clear();
        console.log('🏅 TEAMS DATABASE');
        console.log('='.repeat(70));

        if (teams.length === 0) {
            console.log('No teams found.');
        } else {
            console.log(`Found ${teams.length} team(s):\n`);

            teams.forEach(team => {
                const totalMatches = parseInt(team.home_matches) + parseInt(team.away_matches);
                const winRate = totalMatches > 0 ? ((team.wins / totalMatches) * 100).toFixed(1) : 0;

                console.log(`${team.team_name}`);
                console.log(`   ID: ${team.team_id}`);
                console.log(`   Total Matches: ${totalMatches}`);
                console.log(`   Home: ${team.home_matches}, Away: ${team.away_matches}`);
                console.log(`   Record: ${team.wins || 0}W-${team.draws || 0}D-${totalMatches - (team.wins || 0) - (team.draws || 0)}L`);
                console.log(`   Win Rate: ${winRate}%`);
                console.log(`   Created: ${team.created_at}\n`);
            });
        }

        await this.waitForInput();
    }

    async viewTransactions() {
        const transactions = await this.query(`
            SELECT t.*, b.team_bet_on, 
                   ht.team_name as home_team, at.team_name as away_team
            FROM transactions t
            LEFT JOIN bets b ON t.bet_id = b.bet_id
            LEFT JOIN matches m ON b.match_id = m.match_id
            LEFT JOIN teams ht ON m.home_team_id = ht.team_id
            LEFT JOIN teams at ON m.away_team_id = at.team_id
            ORDER BY t.transaction_date DESC
            LIMIT 20
        `);

        console.clear();
        console.log('💳 TRANSACTION HISTORY');
        console.log('='.repeat(70));

        if (transactions.length === 0) {
            console.log('No transactions found.');
        } else {
            let totalDeposits = 0;
            let totalWithdrawals = 0;
            let totalBets = 0;
            let totalWins = 0;

            transactions.forEach(trans => {
                if (trans.type === 'DEPOSIT') totalDeposits += trans.amount;
                if (trans.type === 'WITHDRAWAL') totalWithdrawals += trans.amount;
                if (trans.type === 'BET_PLACED') totalBets += trans.amount;
                if (trans.type === 'BET_WON') totalWins += trans.amount;
            });

            console.log('\n📊 TRANSACTION SUMMARY:');
            console.log(`   Total Deposits: $${totalDeposits.toFixed(2)}`);
            console.log(`   Total Withdrawals: $${totalWithdrawals.toFixed(2)}`);
            console.log(`   Total Bets Placed: $${totalBets.toFixed(2)}`);
            console.log(`   Total Bets Won: $${totalWins.toFixed(2)}`);
            console.log(`   Net Cash Flow: $${(totalDeposits - totalWithdrawals + totalWins - totalBets).toFixed(2)}\n`);

            console.log('📋 RECENT TRANSACTIONS:');
            console.log('-'.repeat(70));

            transactions.forEach(trans => {
                const date = new Date(trans.transaction_date).toLocaleString();
                const sign = trans.type.includes('WON') || trans.type === 'DEPOSIT' ? '+' : '-';
                const color = sign === '+' ? '\x1b[32m' : '\x1b[31m';

                console.log(`[${date}] ${trans.type}`);
                console.log(`   Amount: ${color}${sign}$${Math.abs(trans.amount).toFixed(2)}\x1b[0m`);
                console.log(`   Balance: $${trans.balance_before.toFixed(2)} → $${trans.balance_after.toFixed(2)}`);

                if (trans.bet_id && trans.home_team) {
                    console.log(`   Match: ${trans.home_team} vs ${trans.away_team} (Bet on: ${trans.team_bet_on})`);
                }

                console.log(`   Description: ${trans.description}\n`);
            });
        }

        await this.waitForInput();
    }

    async exportData() {
        console.clear();
        console.log('📤 EXPORT DATA');
        console.log('='.repeat(70));
        console.log('\nThis feature allows you to export data to CSV format.');
        console.log('Available exports:');
        console.log('1. Matches Data');
        console.log('2. Betting Odds');
        console.log('3. Betting History');
        console.log('4. Transaction History');
        console.log('5. Back to Main Menu\n');

        const choice = await this.askQuestion('Select option (1-5): ');

        if (choice === '5') return;

        let query, filename;

        switch (choice) {
            case '1':
                query = `
                    SELECT m.match_id, ts.stage_name, 
                           ht.team_name as home_team, at.team_name as away_team,
                           m.home_score, m.away_score, m.full_time_score,
                           m.result, m.match_date, m.match_time, m.status,
                           m.is_final
                    FROM matches m
                    JOIN tournament_stages ts ON m.stage_id = ts.stage_id
                    JOIN teams ht ON m.home_team_id = ht.team_id
                    JOIN teams at ON m.away_team_id = at.team_id
                    ORDER BY m.match_date, m.match_time
                `;
                filename = 'matches_export.csv';
                break;
            case '2':
                query = `
                    SELECT bo.odds_id, ts.stage_name, 
                           ht.team_name as home_team, at.team_name as away_team,
                           bo.home_odds, bo.draw_odds, bo.away_odds,
                           bo.timestamp, m.match_date
                    FROM betting_odds bo
                    JOIN matches m ON bo.match_id = m.match_id
                    JOIN tournament_stages ts ON m.stage_id = ts.stage_id
                    JOIN teams ht ON m.home_team_id = ht.team_id
                    JOIN teams at ON m.away_team_id = at.team_id
                    ORDER BY bo.timestamp DESC
                `;
                filename = 'odds_export.csv';
                break;
            case '3':
                query = `
                    SELECT b.bet_id, ts.stage_name, 
                           ht.team_name as home_team, at.team_name as away_team,
                           b.team_bet_on, b.odds_taken, b.amount,
                           b.potential_win, b.actual_win, b.status,
                           b.profit_loss, b.placed_at, b.settled_at,
                           m.full_time_score, m.result as match_result
                    FROM bets b
                    JOIN matches m ON b.match_id = m.match_id
                    JOIN tournament_stages ts ON m.stage_id = ts.stage_id
                    JOIN teams ht ON m.home_team_id = ht.team_id
                    JOIN teams at ON m.away_team_id = at.team_id
                    ORDER BY b.placed_at DESC
                `;
                filename = 'bets_export.csv';
                break;
            case '4':
                query = `
                    SELECT t.transaction_id, t.type, t.amount,
                           t.balance_before, t.balance_after,
                           t.description, t.transaction_date,
                           b.team_bet_on, ht.team_name as home_team, 
                           at.team_name as away_team
                    FROM transactions t
                    LEFT JOIN bets b ON t.bet_id = b.bet_id
                    LEFT JOIN matches m ON b.match_id = m.match_id
                    LEFT JOIN teams ht ON m.home_team_id = ht.team_id
                    LEFT JOIN teams at ON m.away_team_id = at.team_id
                    ORDER BY t.transaction_date DESC
                `;
                filename = 'transactions_export.csv';
                break;
            default:
                console.log('Invalid choice.');
                return;
        }

        try {
            const rows = await this.query(query);

            if (rows.length === 0) {
                console.log('\n⚠️  No data to export.');
                await this.waitForInput();
                return;
            }

            // Convert to CSV
            const columns = Object.keys(rows[0]);
            let csv = columns.join(',') + '\n';

            rows.forEach(row => {
                const values = columns.map(col => {
                    const value = row[col];
                    if (value === null || value === undefined) return '';
                    // Escape quotes and wrap in quotes if contains comma
                    const stringValue = String(value).replace(/"/g, '""');
                    return stringValue.includes(',') ? `"${stringValue}"` : stringValue;
                });
                csv += values.join(',') + '\n';
            });

            // Write to file
            const fs = require('fs');
            fs.writeFileSync(filename, csv);

            console.log(`\n✅ Data exported successfully to ${filename}`);
            console.log(`   Total rows: ${rows.length}`);
            console.log(`   File size: ${(csv.length / 1024).toFixed(2)} KB`);

        } catch (error) {
            console.error('\n❌ Export failed:', error.message);
        }

        await this.waitForInput();
    }

    askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    waitForInput() {
        return new Promise((resolve) => {
            this.rl.question('\nPress Enter to continue...', () => {
                resolve();
            });
        });
    }

    async start() {
        try {
            await this.connect();

            while (true) {
                await this.showMainMenu();
                const choice = await this.askQuestion('Select option (0-9): ');

                switch (choice) {
                    case '1':
                        await this.viewAccountAndBets();
                        break;
                    case '2':
                        await this.viewMatchesAndResults();
                        break;
                    case '3':
                        await this.viewBettingOdds();
                        break;
                    case '4':
                        await this.viewTournamentStages();
                        break;
                    case '5':
                        await this.viewTeams();
                        break;
                    case '6':
                        await this.viewTransactions();
                        break;
                    case '7':
                        await this.viewStatistics();
                        break;
                    case '8':
                        await this.exportData();
                        break;
                    case '9':
                        await this.runCustomQuery();
                        break;
                    case '0':
                        console.log('\n👋 Goodbye!');
                        this.db.close();
                        this.rl.close();
                        return;
                    default:
                        console.log('Invalid choice. Please try again.');
                        await this.waitForInput();
                }
            }
        } catch (error) {
            console.error('Error:', error.message);
            this.rl.close();
        }
    }
}

// Start the viewer
(async () => {
    const viewer = new DatabaseViewer();
    await viewer.start();
})();