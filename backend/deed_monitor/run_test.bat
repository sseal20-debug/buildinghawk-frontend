@echo off
cd /d D:\BuildingHawk_Master\app\app\backend\deed_monitor
C:\Python314\python.exe --version > output.txt 2>&1
C:\Python314\python.exe -c "print('Hello from Python')" >> output.txt 2>&1
C:\Python314\python.exe -c "import sys; print(sys.executable)" >> output.txt 2>&1
