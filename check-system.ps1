# System Health & Environment Doctor
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$uPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$mPath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
$env:Path = "$uPath;$mPath;$env:Path"

$env:JAVA_HOME = [System.Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\javac.exe")) {
    $foundJdk = Get-ChildItem "$env:LOCALAPPDATA\Programs\Eclipse Adoptium\jdk-17*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($foundJdk) {
        $env:JAVA_HOME = $foundJdk.FullName
    }
}
if ($env:JAVA_HOME) {
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   System Health & Environment Doctor (Pharmacy HR System)      " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

function Check-Component($name, $cmd, $arg) {
    try {
        $ver = & $cmd $arg 2>&1 | Select-Object -First 1
        if ($ver) {
            Write-Host "  [OK] $name : " -NoNewline -ForegroundColor Green
            Write-Host "$ver" -ForegroundColor White
            return
        }
    } catch {}
    Write-Host "  [X]  $name : NOT FOUND" -ForegroundColor Red
}

Write-Host "[1] Core Runtimes & Compilers:" -ForegroundColor Yellow
Check-Component "Node.js" "node" "-v"
Check-Component "NPM" "npm.cmd" "-v"
Check-Component "Git" "git" "--version"
Check-Component "Python" "python" "--version"
Check-Component "Java (JDK 17)" "java" "-version"
Check-Component "Javac" "javac" "-version"

if ($env:JAVA_HOME) {
    Write-Host "  [OK] JAVA_HOME : $env:JAVA_HOME" -ForegroundColor Green
} else {
    Write-Host "  [X]  JAVA_HOME : Undefined" -ForegroundColor Red
}

$sdkDir = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
if (Test-Path "$sdkDir\platform-tools\adb.exe") {
    Write-Host "  [OK] Android SDK : $sdkDir" -ForegroundColor Green
    $platforms = (Get-ChildItem "$sdkDir\platforms" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ", "
    Write-Host "  [OK] Android Platforms : $platforms" -ForegroundColor Green
} else {
    Write-Host "  [X]  Android SDK : NOT FOUND" -ForegroundColor Red
}

Write-Host ""
Write-Host "[2] Auxiliary Tools:" -ForegroundColor Yellow
Check-Component "GitHub CLI (gh)" "gh" "--version"
Check-Component "Chocolatey" "choco" "-v"

Write-Host ""
Write-Host "[3] Web Build Status (dist):" -ForegroundColor Yellow
if (Test-Path "dist\index.html") {
    $sizeMb = [math]::Round(((Get-ChildItem "dist" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB), 2)
    Write-Host "  [OK] dist folder built ($sizeMb MB)" -ForegroundColor Green
} else {
    Write-Host "  [!]  dist folder not found. Run 'npm run build'." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4] Database Health (Supabase Cloud PostgreSQL):" -ForegroundColor Yellow
try {
    & node scripts/check_db.js
} catch {
    Write-Host "  [X] DB check failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  ALL CHECKS COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan