@ECHO OFF
node app.js 
IF %ERRORLEVEL% == 0 GOTO QUIT
pause
:QUIT