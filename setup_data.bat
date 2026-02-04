@echo off
echo Building Hawk - Data Setup
echo ==========================
echo.

set "BACKEND_DATA=C:\Users\User\industrial-tracker\backend\data"
set "FRONTEND_DATA=C:\Users\User\industrial-tracker\frontend\public\data"

echo Creating frontend data directory...
if not exist "%FRONTEND_DATA%" mkdir "%FRONTEND_DATA%"

echo.
echo Copying data files to frontend...

if exist "%BACKEND_DATA%\building_hawk_geo.geojson" (
    copy "%BACKEND_DATA%\building_hawk_geo.geojson" "%FRONTEND_DATA%\" /Y
    echo   ✓ building_hawk_geo.geojson
) else (
    echo   ⚠ building_hawk_geo.geojson not found
)

if exist "%BACKEND_DATA%\building_hawk_all.json" (
    copy "%BACKEND_DATA%\building_hawk_all.json" "%FRONTEND_DATA%\" /Y
    echo   ✓ building_hawk_all.json
)

if exist "%BACKEND_DATA%\building_hawk_geocoded.geojson" (
    copy "%BACKEND_DATA%\building_hawk_geocoded.geojson" "%FRONTEND_DATA%\" /Y
    echo   ✓ building_hawk_geocoded.geojson
)

echo.
echo ===============================
echo Data files are now available at:
echo   %FRONTEND_DATA%
echo.
echo Start the frontend server and visit:
echo   http://localhost:5173/map-preview
echo ===============================
pause
