@echo off
echo.
echo Building Hawk - Export Data from Supabase
echo ==========================================
echo.

cd /d C:\Users\User\industrial-tracker\backend

echo Running export script...
call node src/scripts/export-from-supabase.js

echo.
echo Done! Press any key to close...
pause > nul
