// checkDb.js - Quick Database Status Check
const sqlite3 = require('sqlite3').verbose();

async function checkDatabase() {
    const db = new sqlite3.Database('./virtual_football_betting.db');

    console.log('\n📊 DATABASE QUICK CHECK');
    console.log('='.repeat(70));

    try {
        // Check all tables
        const tables = await query(db, `
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            ORDER BY name
        `);

        console.log('\n📋 DATABASE TABLES:');
        console.log('-'.repeat(40));

        for (const table of tables) {
            const count = await query(db, `SELECT COUNT(*) as count FROM ${table.name}`);
            console.log(`   ${table.name.padEnd(20)}: ${count[0].count} records`);
        }

        // Account info
        const account = await query(db, 'SELECT * FROM account WHERE account_id = 1');
        if (account[0]) {
            console.log('\n💰 ACCOUNT STATUS:');
            console.log(`   Balance: $${account[0].balance.toFixed(2)}`);
            console.log(`   Wins/Losses: ${account[0].total_wins}/${account[0].total_losses}`);
        }

        // Recent activity
        const recentMatches = await query(db, `
            SELECT COUNT(*) as today_matches
            FROM matches 
            WHERE match_date = date('now')
        `);

        console.log(`\n📅 TODAY'S ACTIVITY:`);
        console.log(`   Matches today: ${recentMatches[0].today_matches}`);

        const recentOdds = await query(db, `
            SELECT COUNT(*) as today_odds
            FROM betting_odds 
            WHERE date(timestamp) = date('now')
        `);

        console.log(`   Odds collected today: ${recentOdds[0].today_odds}`);

        // Database size
        const dbStats = await query(db, `
            SELECT page_count * page_size as size_bytes
            FROM pragma_page_count(), pragma_page_size()
        `);

        const sizeMB = (dbStats[0].size_bytes / (1024 * 1024)).toFixed(2);
        console.log(`\n💾 DATABASE SIZE: ${sizeMB} MB`);

        console.log('\n✅ Database is healthy and operational!\n');

    } catch (error) {
        console.error('❌ Database check failed:', error.message);
    } finally {
        db.close();
    }
}

function query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

checkDatabase();