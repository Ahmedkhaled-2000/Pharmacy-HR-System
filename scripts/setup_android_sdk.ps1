# Setup Android SDK Tools
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$sdkDir = "$env:LOCALAPPDATA\Android\Sdk"
$zipUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$tempZip = "$env:TEMP\cmdline-tools.zip"

Write-Host "Target SDK Directory: $sdkDir" -ForegroundColor Cyan

if (-not (Test-Path $sdkDir)) {
    New-Item -ItemType Directory -Path $sdkDir -Force | Out-Null
}

$cmdlineLatest = "$sdkDir\cmdline-tools\latest"
if (-not (Test-Path "$cmdlineLatest\bin\sdkmanager.bat")) {
    Write-Host "Downloading Android Command Line Tools..." -ForegroundColor Yellow
    curl.exe -L -o $tempZip $zipUrl
    if (-not (Test-Path $tempZip)) {
        Write-Host "Failed to download $zipUrl" -ForegroundColor Red
        exit 1
    }

    Write-Host "Extracting Command Line Tools..." -ForegroundColor Yellow
    $extractDir = "$env:TEMP\cmdline-tools-extracted"
    if (Test-Path $extractDir) { Remove-Item -Path $extractDir -Recurse -Force }
    Expand-Archive -Path $tempZip -DestinationPath $extractDir -Force

    $destParent = "$sdkDir\cmdline-tools"
    if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
    if (Test-Path $cmdlineLatest) { Remove-Item -Path $cmdlineLatest -Recurse -Force }

    Move-Item -Path "$extractDir\cmdline-tools" -Destination $cmdlineLatest -Force
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Command Line Tools installed to $cmdlineLatest" -ForegroundColor Green
}

# Set Environment Variables
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkDir, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdkDir, 'User')
$env:ANDROID_HOME = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir

# Update Path for current session and user
$sdkBins = "$cmdlineLatest\bin;$sdkDir\platform-tools;$sdkDir\build-tools"
$uPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($uPath -notlike "*$cmdlineLatest\bin*") {
    [Environment]::SetEnvironmentVariable('Path', "$sdkBins;$uPath", 'User')
}
$env:Path = "$sdkBins;$env:Path"

# Accept licenses
Write-Host "Accepting Android SDK licenses..." -ForegroundColor Yellow
$sdkmanager = "$cmdlineLatest\bin\sdkmanager.bat"

# Set JAVA_HOME if not already set
if (-not $env:JAVA_HOME) {
    $jdk = Get-ChildItem "$env:LOCALAPPDATA\Programs\Eclipse Adoptium\jdk-17*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}

$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c echo y | `"$sdkmanager`" --licenses" -NoNewWindow -Wait -PassThru

Write-Host "Installing platform-tools and build-tools..." -ForegroundColor Yellow
& cmd.exe /c "echo y | `"$sdkmanager`" `"platform-tools`" `"build-tools;34.0.0`" `"platforms;android-34`""

Write-Host "Android SDK setup complete!" -ForegroundColor Green
