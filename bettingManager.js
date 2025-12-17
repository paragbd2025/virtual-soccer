// bettingManager.js - Handles betting operations
const readline = require('readline');
const BettingDatabase = require('./database');

class BettingManager {
    constructor() {
        this.db = new BettingDatabase();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async initialize() {
        await this.db.initialize();
    }

    async showMenu() {
        console.log('\n🎰 BETTING MANAGEMENT SYSTEM');
        console.log('='.repeat(70));
        console.log('1. View Account Summary');
        console.log('2. View Upcoming Matches & Odds');
        console.log('3. Place a Bet');
        console.log('4. View Bet History');
        console.log('5. View Match Results');
        console.log('6. Add Funds (Deposit)');
        console.log('7. Withdraw Funds');
        console.log('8. View Transaction History');
        console.log('9. Exit\n');
    }

    async handleChoice(choice) {
        switch (choice) {
            case '1':
                await this.viewAccountSummary();
                break;
            case '2':
                await this.viewUpcomingMatches();
                break;
            case '3':
                await this.placeBet();
                break;
            case '4':
                await this.viewBetHistory();
                break;
            case '5':
                await this.viewMatchResults();
                break;
            case '6':
                await this.addFunds();
                break;
            case '7':
                await this.withdrawFunds();
                break;
            case '8':
                await this.viewTransactionHistory();
                break;
            case '9':
                console.log('\n👋 Goodbye!');
                await this.db.close();
                this.rl.close();
                process.exit(0);
                break;
            default:
                console.log('❌ Invalid choice. Please try again.');
        }
    }

    async viewAccountSummary() {
        const summary = await this.db.getAccountSummary();

        if (summary) {
            console.log('\n💰 ACCOUNT SUMMARY');
            console.log('='.repeat(70));
            console.log(`Current Balance: $${summary.account.balance.toFixed(2)}`);
            console.log(`Total Bets: ${summary.totalBets}`);
            console.log(`Wins: ${summary.account.total_wins}`);
            console.log(`Losses: ${summary.account.total_losses}`);
            console.log(`Win Rate: ${summary.winRate}%`);
            console.log(`Total Profit/Loss: $${summary.account.total_profit_loss.toFixed(2)}`);

            if (summary.recentBets.length > 0) {
                console.log('\n📊 RECENT BETS:');
                console.log('-'.repeat(70));
                summary.recentBets.forEach(bet => {
                    const status = bet.status === 'WON' ? '✅' : bet.status === 'LOST' ? '❌' : '⏳';
                    console.log(`${status} Bet #${bet.bet_id}: ${bet.home_team} vs ${bet.away_team}`);
                    console.log(`   Bet on: ${bet.team_bet_on} | Amount: $${bet.amount}`);
                    console.log(`   Odds: ${bet.odds_taken} | Status: ${bet.status}`);
                    console.log(`   Profit/Loss: $${bet.profit_loss.toFixed(2)}\n`);
                });
            }
        }

        await this.pressEnterToContinue();
    }

    async viewUpcomingMatches() {
        const matches = await this.db.getScheduledMatches();

        console.log('\n⚽ UPCOMING MATCHES');
        console.log('='.repeat(70));

        if (matches.length === 0) {
            console.log('No upcoming matches found');
        } else {
            matches.forEach((match, index) => {
                console.log(`${index + 1}. ${match.stage_name}: ${match.home_team} vs ${match.away_team}`);
                console.log(`   Match ID: ${match.match_id}`);
                console.log(`   Odds: Home ${match.home_odds || 'N/A'} | Draw ${match.draw_odds || 'N/A'} | Away ${match.away_odds || 'N/A'}\n`);
            });
        }

        await this.pressEnterToContinue();
    }

    async placeBet() {
        try {
            console.log('\n💰 PLACE A BET');
            console.log('='.repeat(70));

            // Show available matches
            const matches = await this.db.getScheduledMatches();

            if (matches.length === 0) {
                console.log('No matches available for betting');
                return;
            }

            matches.forEach((match, index) => {
                console.log(`${index + 1}. ${match.home_team} vs ${match.away_team}`);
                console.log(`   Match ID: ${match.match_id}`);
                console.log(`   Odds: H ${match.home_odds || 'N/A'} | D ${match.draw_odds || 'N/A'} | A ${match.away_odds || 'N/A'}\n`);
            });

            // Get match choice
            const matchChoice = await this.question('Select match number: ');
            const matchIndex = parseInt(matchChoice) - 1;

            if (matchIndex < 0 || matchIndex >= matches.length) {
                console.log('❌ Invalid match selection');
                return;
            }

            const selectedMatch = matches[matchIndex];

            // Get bet selection
            console.log('\nSelect bet type:');
            console.log('1. Home Win');
            console.log('2. Draw');
            console.log('3. Away Win');

            const betChoice = await this.question('Choice (1-3): ');
            let teamBetOn;

            switch (betChoice) {
                case '1':
                    teamBetOn = 'HOME';
                    break;
                case '2':
                    teamBetOn = 'DRAW';
                    break;
                case '3':
                    teamBetOn = 'AWAY';
                    break;
                default:
                    console.log('❌ Invalid bet type');
                    return;
            }

            // Get amount
            const amountStr = await this.question('Bet amount: $');
            const amount = parseFloat(amountStr);

            if (isNaN(amount) || amount <= 0) {
                console.log('❌ Invalid amount');
                return;
            }

            // Confirm bet
            console.log('\n📋 BET CONFIRMATION:');
            console.log(`Match: ${selectedMatch.home_team} vs ${selectedMatch.away_team}`);
            console.log(`Bet on: ${teamBetOn}`);
            console.log(`Amount: $${amount}`);

            const confirm = await this.question('Confirm bet? (yes/no): ');

            if (confirm.toLowerCase() === 'yes') {
                const betData = {
                    match_id: selectedMatch.match_id,
                    team_bet_on: teamBetOn,
                    amount: amount
                };

                await this.db.placeBet(betData);
            } else {
                console.log('Bet cancelled');
            }

        } catch (error) {
            console.error('❌ Error placing bet:', error.message);
        }

        await this.pressEnterToContinue();
    }

    async viewBetHistory() {
        const bets = await this.db.query(`
            SELECT b.*, ht.team_name as home_team, at.team_name as away_team,
                   ts.stage_name
            FROM bets b
            JOIN matches m ON b.match_id = m.match_id
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            ORDER BY b.placed_at DESC
        `);

        console.log('\n📋 BET HISTORY');
        console.log('='.repeat(70));

        if (bets.length === 0) {
            console.log('No bets found');
        } else {
            let totalProfitLoss = 0;

            bets.forEach(bet => {
                const statusIcon = bet.status === 'WON' ? '✅' :
                    bet.status === 'LOST' ? '❌' : '⏳';

                console.log(`${statusIcon} Bet #${bet.bet_id}`);
                console.log(`   Match: ${bet.home_team} vs ${bet.away_team} (${bet.stage_name})`);
                console.log(`   Bet on: ${bet.team_bet_on} | Odds: ${bet.odds_taken}`);
                console.log(`   Amount: $${bet.amount} | Potential Win: $${bet.potential_win.toFixed(2)}`);
                console.log(`   Status: ${bet.status} | Placed: ${bet.placed_at}`);

                if (bet.status !== 'PENDING') {
                    console.log(`   Actual Win: $${bet.actual_win.toFixed(2)} | Profit/Loss: $${bet.profit_loss.toFixed(2)}`);
                    totalProfitLoss += bet.profit_loss;
                }
                console.log('');
            });

            console.log(`📊 TOTAL PROFIT/LOSS: $${totalProfitLoss.toFixed(2)}`);
        }

        await this.pressEnterToContinue();
    }

    async viewMatchResults() {
        const results = await this.db.query(`
            SELECT m.match_id, ts.stage_name, ht.team_name as home_team, 
                   at.team_name as away_team, m.home_score, m.away_score,
                   m.full_time_score, m.result, m.match_date, m.match_time
            FROM matches m
            JOIN tournament_stages ts ON m.stage_id = ts.stage_id
            JOIN teams ht ON m.home_team_id = ht.team_id
            JOIN teams at ON m.away_team_id = at.team_id
            WHERE m.status = 'COMPLETED'
            ORDER BY m.match_date DESC, m.match_time DESC
            LIMIT 20
        `);

        console.log('\n🏆 MATCH RESULTS');
        console.log('='.repeat(70));

        if (results.length === 0) {
            console.log('No completed matches found');
        } else {
            // Group by stage
            const grouped = {};
            results.forEach(match => {
                if (!grouped[match.stage_name]) {
                    grouped[match.stage_name] = [];
                }
                grouped[match.stage_name].push(match);
            });

            Object.entries(grouped).forEach(([stage, matches]) => {
                console.log(`\n📊 ${stage}:`);
                console.log('-'.repeat(50));
                matches.forEach(match => {
                    console.log(`   ${match.home_team} ${match.full_time_score} ${match.away_team}`);
                    console.log(`   Result: ${match.result} | Date: ${match.match_date}\n`);
                });
            });
        }

        await this.pressEnterToContinue();
    }

    async addFunds() {
        console.log('\n💵 ADD FUNDS');
        console.log('='.repeat(70));

        const amountStr = await this.question('Deposit amount: $');
        const amount = parseFloat(amountStr);

        if (isNaN(amount) || amount <= 0) {
            console.log('❌ Invalid amount');
            return;
        }

        // Get current balance
        const account = await this.db.query('SELECT balance FROM account WHERE account_id = 1');
        const currentBalance = account[0].balance;
        const newBalance = currentBalance + amount;

        // Update account
        await this.db.runQuery(
            'UPDATE account SET balance = ?, total_deposits = total_deposits + ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = 1',
            [newBalance, amount]
        );

        // Record transaction
        await this.db.runQuery(
            `INSERT INTO transactions (type, amount, balance_before, balance_after, description) 
             VALUES ('DEPOSIT', ?, ?, ?, ?)`,
            [amount, currentBalance, newBalance, 'Manual deposit']
        );

        console.log(`\n✅ Deposit successful!`);
        console.log(`   Deposited: $${amount.toFixed(2)}`);
        console.log(`   Previous Balance: $${currentBalance.toFixed(2)}`);
        console.log(`   New Balance: $${newBalance.toFixed(2)}`);

        await this.pressEnterToContinue();
    }

    async withdrawFunds() {
        console.log('\n🏧 WITHDRAW FUNDS');
        console.log('='.repeat(70));

        const amountStr = await this.question('Withdrawal amount: $');
        const amount = parseFloat(amountStr);

        if (isNaN(amount) || amount <= 0) {
            console.log('❌ Invalid amount');
            return;
        }

        // Get current balance
        const account = await this.db.query('SELECT balance FROM account WHERE account_id = 1');
        const currentBalance = account[0].balance;

        if (currentBalance < amount) {
            console.log(`❌ Insufficient balance. Current: $${currentBalance.toFixed(2)}`);
            return;
        }

        const newBalance = currentBalance - amount;

        // Update account
        await this.db.runQuery(
            'UPDATE account SET balance = ?, total_withdrawals = total_withdrawals + ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = 1',
            [newBalance, amount]
        );

        // Record transaction
        await this.db.runQuery(
            `INSERT INTO transactions (type, amount, balance_before, balance_after, description) 
             VALUES ('WITHDRAWAL', ?, ?, ?, ?)`,
            [amount, currentBalance, newBalance, 'Manual withdrawal']
        );

        console.log(`\n✅ Withdrawal successful!`);
        console.log(`   Withdrawn: $${amount.toFixed(2)}`);
        console.log(`   Previous Balance: $${currentBalance.toFixed(2)}`);
        console.log(`   New Balance: $${newBalance.toFixed(2)}`);

        await this.pressEnterToContinue();
    }

    async viewTransactionHistory() {
        const transactions = await this.db.query(`
            SELECT t.*, b.team_bet_on, ht.team_name as home_team, at.team_name as away_team
            FROM transactions t
            LEFT JOIN bets b ON t.bet_id = b.bet_id
            LEFT JOIN matches m ON b.match_id = m.match_id
            LEFT JOIN teams ht ON m.home_team_id = ht.team_id
            LEFT JOIN teams at ON m.away_team_id = at.team_id
            ORDER BY t.transaction_date DESC
            LIMIT 20
        `);

        console.log('\n📋 TRANSACTION HISTORY');
        console.log('='.repeat(70));

        if (transactions.length === 0) {
            console.log('No transactions found');
        } else {
            transactions.forEach(trans => {
                const sign = trans.type.includes('WON') || trans.type === 'DEPOSIT' ? '+' : '-';
                console.log(`[${trans.transaction_date}] ${trans.type}`);
                console.log(`   Amount: ${sign}$${Math.abs(trans.amount).toFixed(2)}`);
                console.log(`   Balance: $${trans.balance_before.toFixed(2)} → $${trans.balance_after.toFixed(2)}`);

                if (trans.bet_id && trans.home_team) {
                    console.log(`   Match: ${trans.home_team} vs ${trans.away_team} (Bet on: ${trans.team_bet_on})`);
                }

                console.log(`   Description: ${trans.description}\n`);
            });
        }

        await this.pressEnterToContinue();
    }

    question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }

    pressEnterToContinue() {
        return new Promise((resolve) => {
            this.rl.question('\nPress Enter to continue...', () => {
                resolve();
            });
        });
    }

    async start() {
        console.clear();
        await this.initialize();

        while (true) {
            console.clear();
            await this.showMenu();

            const choice = await this.question('Enter your choice (1-9): ');
            await this.handleChoice(choice);
        }
    }
}

module.exports = BettingManager;