@echo off
echo ============================================================
echo BUILDINGHAWK CRM SERVER
echo ============================================================
echo.
echo Installing dependencies...
pip install flask flask-cors requests
echo.
echo Starting server...
echo Open http://localhost:5000 in your browser
echo Press Ctrl+C to stop
echo.
python server.py
pause
