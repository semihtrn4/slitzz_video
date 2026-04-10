@echo off
SET INPUT=C:\Users\User\Desktop\1322155sdasd.mp4
SET FFMPEG=ffmpeg
SET OUT_DIR=C:\Users\User\Desktop\ffmpeg_tests

mkdir %OUT_DIR% 2>nul

echo ============================================
echo TEST 1: Temel export (trim yok, speed yok, muzik yok)
echo ============================================
echo [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:0:0,setsar=1[v0];[0:a]asetpts=PTS-STARTPTS[a0];[a0]volume=1.0000[outa] > %OUT_DIR%\fc1.txt
%FFMPEG% -i "%INPUT%" -filter_complex_script %OUT_DIR%\fc1.txt -map [v0] -map [outa] -c:v libx264 -preset fast -b:v 5M -c:a aac -b:a 128k -movflags +faststart -shortest -t 5 -y %OUT_DIR%\test1_basic.mp4
IF %ERRORLEVEL%==0 (echo [PASS] TEST 1 BASARILI) ELSE (echo [FAIL] TEST 1 BASARISIZ - kod: %ERRORLEVEL%)

echo.
echo ============================================
echo TEST 2: Trim (2-7 saniye)
echo ============================================
echo [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:0:0,setsar=1[v0];[0:a]asetpts=PTS-STARTPTS[a0];[v0]trim=start=2.000:end=7.000,setpts=PTS-STARTPTS[v1];[a0]atrim=start=2.000:end=7.000,asetpts=PTS-STARTPTS[a1];[a1]volume=1.0000[outa] > %OUT_DIR%\fc2.txt
%FFMPEG% -i "%INPUT%" -filter_complex_script %OUT_DIR%\fc2.txt -map [v1] -map [outa] -c:v libx264 -preset fast -b:v 5M -c:a aac -b:a 128k -movflags +faststart -shortest -y %OUT_DIR%\test2_trim.mp4
IF %ERRORLEVEL%==0 (echo [PASS] TEST 2 BASARILI) ELSE (echo [FAIL] TEST 2 BASARISIZ - kod: %ERRORLEVEL%)

echo.
echo ============================================
echo TEST 3: Speed 1.5x
echo ============================================
echo [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:0:0,setsar=1[v0];[0:a]asetpts=PTS-STARTPTS[a0];[v0]setpts=0.666667*PTS[v1];[a0]atempo=1.500000[a1];[a1]volume=1.0000[outa] > %OUT_DIR%\fc3.txt
%FFMPEG% -i "%INPUT%" -filter_complex_script %OUT_DIR%\fc3.txt -map [v1] -map [outa] -c:v libx264 -preset fast -b:v 5M -c:a aac -b:a 128k -movflags +faststart -shortest -t 5 -y %OUT_DIR%\test3_speed.mp4
IF %ERRORLEVEL%==0 (echo [PASS] TEST 3 BASARILI) ELSE (echo [FAIL] TEST 3 BASARISIZ - kod: %ERRORLEVEL%)

echo.
echo ============================================
echo TEST 4: Ses yok (anullsrc)
echo ============================================
echo [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:0:0,setsar=1[v0];anullsrc=channel_layout=stereo:sample_rate=44100:d=5.000[a0];[a0]volume=1.0000[outa] > %OUT_DIR%\fc4.txt
%FFMPEG% -i "%INPUT%" -filter_complex_script %OUT_DIR%\fc4.txt -map [v0] -map [outa] -c:v libx264 -preset fast -b:v 5M -c:a aac -b:a 128k -movflags +faststart -t 5 -y %OUT_DIR%\test4_noaudio.mp4
IF %ERRORLEVEL%==0 (echo [PASS] TEST 4 BASARILI) ELSE (echo [FAIL] TEST 4 BASARISIZ - kod: %ERRORLEVEL%)

echo.
echo ============================================
echo TEST 5: 16:9 aspect ratio
echo ============================================
echo [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:0:0,setsar=1[v0];[0:a]asetpts=PTS-STARTPTS[a0];[a0]volume=1.0000[outa] > %OUT_DIR%\fc5.txt
%FFMPEG% -i "%INPUT%" -filter_complex_script %OUT_DIR%\fc5.txt -map [v0] -map [outa] -c:v libx264 -preset fast -b:v 5M -c:a aac -b:a 128k -movflags +faststart -shortest -t 5 -y %OUT_DIR%\test5_169.mp4
IF %ERRORLEVEL%==0 (echo [PASS] TEST 5 BASARILI) ELSE (echo [FAIL] TEST 5 BASARISIZ - kod: %ERRORLEVEL%)

echo.
echo ============================================
echo SONUCLAR: %OUT_DIR% klasorune bak
echo ============================================
pause
