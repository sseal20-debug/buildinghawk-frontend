@echo off
echo ============================================================
echo Building Hawk - Data Pipeline
echo ============================================================
echo.

cd /d "C:\Users\User\industrial-tracker\backend"

echo Step 1: Creating GeoJSON from existing data...
call npm run create:geojson
if errorlevel 1 (
    echo ERROR: Failed to create GeoJSON
    pause
    exit /b 1
)
echo.

echo Step 2: Starting geocoding (this will take ~6 minutes for 2400 addresses)...
echo Press Ctrl+C to cancel if you want to skip geocoding
timeout /t 5
call npm run geocode
if errorlevel 1 (
    echo WARNING: Geocoding had errors, but continuing...
)
echo.

echo ============================================================
echo Data pipeline complete!
echo ============================================================
echo.
echo GeoJSON file created at:
echo   frontend\public\data\building_hawk_geo.geojson
echo.
echo Geocoded CSV at:
echo   backend\data\building_hawk_geocoded.csv
echo.
echo To start the app:
echo   cd frontend ^&^& npm run dev
echo.
pause
