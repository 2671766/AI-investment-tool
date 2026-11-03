@echo off
REM One-command start (Windows): installs what is missing, builds the front end once,
REM and serves the whole app at http://localhost:8000
cd /d "%~dp0"
if not exist backend\.venv ( py -3 -m venv backend\.venv || python -m venv backend\.venv )
call backend\.venv\Scripts\activate.bat
pip install -q -r backend\requirements.txt
if not exist frontend\node_modules ( pushd frontend & call npm install & popd )
if not exist frontend\dist ( pushd frontend & call npm run build & popd )
if "%1"=="--rebuild" ( pushd frontend & call npm run build & popd )
echo.
echo   AI Investment Decision Support is running at http://localhost:8000  (Ctrl+C to stop)
echo.
cd backend
python -m uvicorn app.main:app --port 8000
