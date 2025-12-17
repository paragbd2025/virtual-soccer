@echo off
echo ========================================
echo   VIRTUAL FOOTBALL BETTING SYSTEM
echo ========================================
echo.
echo   1. Start Scraper (Collects matches & odds)
echo   2. Database Viewer (View collected data)
echo   3. Betting Manager (Place bets)
echo   4. Quick Database Check
echo   5. Exit
echo.
set /p choice=Select option (1-5):

if %choice%==1 (
    echo Starting scraper...
    node index.js
) else if %choice%==2 (
    echo Starting database viewer...
    node dbViewer.js
) else if %choice%==3 (
    echo Starting betting manager...
    node runBetting.js
) else if %choice%==4 (
    echo Running quick database check...
    node checkDb.js
    pause
) else if %choice%==5 (
    echo Goodbye!
    timeout /t 2 /nobreak > nul
) else (
    echo Invalid choice
    pause
)