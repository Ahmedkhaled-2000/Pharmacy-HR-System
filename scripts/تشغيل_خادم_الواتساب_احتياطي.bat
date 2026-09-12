@set "SCRIPT_DIR=%~dp0"
@findstr /v "^@set ^@findstr ^@exit" "%~f0" | powershell.exe -NoProfile -ExecutionPolicy Bypass -Command -
@exit /b
[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

# النافذة الرئيسية - تدعم اللغة العربية بالكامل واتجاه من اليمين لليسار (RTL)
$Form = New-Object System.Windows.Forms.Form
$Form.Text = "منظومة الموارد البشرية - أداة تشغيل خادم الواتساب الاحتياطي"
$Form.Size = New-Object System.Drawing.Size(560, 480)
$Form.StartPosition = "CenterScreen"
$Form.FormBorderStyle = "FixedDialog"
$Form.MaximizeBox = $false
$Form.RightToLeft = [System.Windows.Forms.RightToLeft]::Yes
$Form.RightToLeftLayout = $true
$Form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
$Form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Regular)

# العنوان الرئيسي
$Header = New-Object System.Windows.Forms.Label
$Header.Text = "منظومة إدارة الموارد البشرية والرواتب"
$Header.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$Header.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
$Header.Location = New-Object System.Drawing.Point(20, 16)
$Header.Size = New-Object System.Drawing.Size(500, 30)
$Form.Controls.Add($Header)

# الوصف التوضيحي
$SubHeader = New-Object System.Windows.Forms.Label
$SubHeader.Text = "أداة تشغيل خادم الواتساب الاحتياطي لربط الهواتف والمتصفحات 24/7"
$SubHeader.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$SubHeader.Location = New-Object System.Drawing.Point(20, 46)
$SubHeader.Size = New-Object System.Drawing.Size(500, 24)
$Form.Controls.Add($SubHeader)

# صندوق حالة الاتصال
$StatusPanel = New-Object System.Windows.Forms.Panel
$StatusPanel.Location = New-Object System.Drawing.Point(20, 76)
$StatusPanel.Size = New-Object System.Drawing.Size(500, 48)
$StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
$StatusPanel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$Form.Controls.Add($StatusPanel)

$StatusLabel = New-Object System.Windows.Forms.Label
$StatusLabel.Text = "⏳ جاري فحص حالة خادم الواتساب..."
$StatusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Bold)
$StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
$StatusLabel.Location = New-Object System.Drawing.Point(10, 12)
$StatusLabel.Size = New-Object System.Drawing.Size(480, 24)
$StatusPanel.Controls.Add($StatusLabel)

# مجموعة روابط الشبكة المحلية
$NetGroup = New-Object System.Windows.Forms.GroupBox
$NetGroup.Text = "📱 روابط اتصال الهواتف والشبكة المحلية (LAN)"
$NetGroup.Location = New-Object System.Drawing.Point(20, 136)
$NetGroup.Size = New-Object System.Drawing.Size(500, 140)
$NetGroup.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$Form.Controls.Add($NetGroup)

$NetText = New-Object System.Windows.Forms.TextBox
$NetText.Multiline = $true
$NetText.ReadOnly = $true
$NetText.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$NetText.Location = New-Object System.Drawing.Point(15, 25)
$NetText.Size = New-Object System.Drawing.Size(470, 68)
$NetText.Font = New-Object System.Drawing.Font("Consolas", 10, [System.Drawing.FontStyle]::Bold)
$NetText.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$NetText.ForeColor = [System.Drawing.Color]::FromArgb(3, 105, 161)
$NetGroup.Controls.Add($NetText)

# جلب عناوين الشبكة المحلية
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
$ipList = @()
foreach ($ip in $ips) {
    $ipList += "http://$($ip.IPAddress):3100"
}
if ($ipList.Count -eq 0) { $ipList += "http://127.0.0.1:3100" }
$NetText.Text = ($ipList -join "`r`n")

# زر نسخ أول رابط للهاتف
$BtnCopy = New-Object System.Windows.Forms.Button
$BtnCopy.Text = "📋 نسخ أول رابط للهاتف"
$BtnCopy.Location = New-Object System.Drawing.Point(15, 100)
$BtnCopy.Size = New-Object System.Drawing.Size(180, 28)
$BtnCopy.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
$BtnCopy.BackColor = [System.Drawing.Color]::FromArgb(224, 231, 255)
$BtnCopy.ForeColor = [System.Drawing.Color]::FromArgb(67, 56, 202)
$BtnCopy.Add_Click({
    [System.Windows.Forms.Clipboard]::SetText($ipList[0])
    [System.Windows.Forms.MessageBox]::Show("تم نسخ الرابط بنجاح: " + $ipList[0], "نسخ الرابط", "OK", "Information")
})
$NetGroup.Controls.Add($BtnCopy)

# صف أزرار التحكم
$BtnStart = New-Object System.Windows.Forms.Button
$BtnStart.Text = "⚡ تشغيل الخادم"
$BtnStart.Location = New-Object System.Drawing.Point(370, 290)
$BtnStart.Size = New-Object System.Drawing.Size(150, 40)
$BtnStart.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$BtnStart.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
$BtnStart.ForeColor = [System.Drawing.Color]::White

$BtnFirewall = New-Object System.Windows.Forms.Button
$BtnFirewall.Text = "🛡️ فتح جدار الحماية"
$BtnFirewall.Location = New-Object System.Drawing.Point(210, 290)
$BtnFirewall.Size = New-Object System.Drawing.Size(150, 40)
$BtnFirewall.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$BtnFirewall.BackColor = [System.Drawing.Color]::FromArgb(59, 130, 246)
$BtnFirewall.ForeColor = [System.Drawing.Color]::White

$BtnStop = New-Object System.Windows.Forms.Button
$BtnStop.Text = "⏹️ إيقاف الخادم"
$BtnStop.Location = New-Object System.Drawing.Point(20, 290)
$BtnStop.Size = New-Object System.Drawing.Size(180, 40)
$BtnStop.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$BtnStop.BackColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
$BtnStop.ForeColor = [System.Drawing.Color]::White

$Form.Controls.Add($BtnStart)
$Form.Controls.Add($BtnFirewall)
$Form.Controls.Add($BtnStop)

# زر إغلاق
$BtnClose = New-Object System.Windows.Forms.Button
$BtnClose.Text = "✕ إغلاق النافذة"
$BtnClose.Location = New-Object System.Drawing.Point(20, 345)
$BtnClose.Size = New-Object System.Drawing.Size(500, 36)
$BtnClose.BackColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
$BtnClose.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$BtnClose.Add_Click({ $Form.Close() })
$Form.Controls.Add($BtnClose)

# دالة فحص حالة الخادم
function Check-Health {
    try {
        $req = [System.Net.WebRequest]::Create("http://127.0.0.1:3100/health")
        $req.Timeout = 1200
        $res = $req.GetResponse()
        if ($res.StatusCode -eq "OK") {
            $StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(209, 250, 229)
            $StatusLabel.Text = "🟢 خادم الواتساب متصل ويعمل بنجاح (المنفذ 3100)"
            $StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(4, 120, 87)
        }
        $res.Close()
    } catch {
        $StatusPanel.BackColor = [System.Drawing.Color]::FromArgb(254, 226, 226)
        $StatusLabel.Text = "🔴 خادم الواتساب متوقف حالياً"
        $StatusLabel.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
    }
}

# دالة تشغيل الخادم
function Start-WaServer {
    Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

    $baseDir = $env:SCRIPT_DIR
    $candidates = @(
        "$baseDir\server\whatsapp-server.js",
        "$baseDir\whatsapp-server.js",
        "$baseDir\..\server\whatsapp-server.js",
        "d:\Project\HR last\HR New\server\whatsapp-server.js",
        "$env:ProgramFiles\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js",
        "$env:LOCALAPPDATA\Programs\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js"
    )
    $serverJs = $null
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { $serverJs = $c; break }
    }
    if (-not $serverJs) {
        foreach ($drive in @("C:", "D:", "E:", "F:")) {
            $p = "$drive\Project\HR last\HR New\server\whatsapp-server.js"
            if (Test-Path $p) { $serverJs = $p; break }
        }
    }

    $nodeExe = "node"
    if (Test-Path "C:\Program Files\nodejs\node.exe") { 
        $nodeExe = "C:\Program Files\nodejs\node.exe" 
    } elseif (Test-Path "C:\Program Files (x86)\nodejs\node.exe") {
        $nodeExe = "C:\Program Files (x86)\nodejs\node.exe"
    } elseif (Test-Path "$env:LOCALAPPDATA\Programs\node\node.exe") {
        $nodeExe = "$env:LOCALAPPDATA\Programs\node\node.exe"
    } elseif (Test-Path "$env:ProgramFiles\منظومة الموارد البشرية\منظومة الموارد البشرية.exe") {
        $nodeExe = "$env:ProgramFiles\منظومة الموارد البشرية\منظومة الموارد البشرية.exe"
        $env:ELECTRON_RUN_AS_NODE = "1"
    } elseif (Test-Path "$env:LOCALAPPDATA\Programs\منظومة الموارد البشرية\منظومة الموارد البشرية.exe") {
        $nodeExe = "$env:LOCALAPPDATA\Programs\منظومة الموارد البشرية\منظومة الموارد البشرية.exe"
        $env:ELECTRON_RUN_AS_NODE = "1"
    }

    if ($serverJs) {
        $appDir = Split-Path (Split-Path $serverJs)
        Start-Process -FilePath $nodeExe -ArgumentList "`"$serverJs`"" -WorkingDirectory $appDir -WindowStyle Hidden
        Start-Sleep -Seconds 2
        Check-Health
    } else {
        [System.Windows.Forms.MessageBox]::Show("تعذر العثور على ملف whatsapp-server.js تلقائياً على هذا الجهاز.", "تنبيه", "OK", "Warning")
    }
}

# مؤقت فحص دوري كل 3 ثوانٍ
$Timer = New-Object System.Windows.Forms.Timer
$Timer.Interval = 3000
$Timer.Add_Tick({ Check-Health })
$Timer.Start()

# زر فتح جدار الحماية
$BtnFirewall.Add_Click({
    try {
        Start-Process powershell -ArgumentList "-NoProfile -Command `"netsh advfirewall firewall delete rule name='WhatsApp_Server_3100'; netsh advfirewall firewall add rule name='WhatsApp_Server_3100' dir=in action=allow protocol=TCP localport=3100 profile=any description='Allow incoming WhatsApp Gateway connections on port 3100'`"" -Verb RunAs -Wait
        [System.Windows.Forms.MessageBox]::Show("تم السماح للمنفذ 3100 في جدار الحماية بنجاح! 🛡️", "جدار الحماية", "OK", "Information")
    } catch {
        [System.Windows.Forms.MessageBox]::Show("تعذر تعديل جدار الحماية أو تم رفض طلب الصلاحيات.", "تنبيه", "OK", "Warning")
    }
})

# زر إيقاف الخادم
$BtnStop.Add_Click({
    Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 600
    Check-Health
})

# زر تشغيل الخادم
$BtnStart.Add_Click({
    Start-WaServer
})

Check-Health

# محاولة التشغيل التلقائي عند الفتح إن كان متوقفاً
try {
    $initialCheck = [System.Net.WebRequest]::Create("http://127.0.0.1:3100/health")
    $initialCheck.Timeout = 1000
    $res = $initialCheck.GetResponse()
    $res.Close()
} catch {
    Start-WaServer
}

$Form.Add_Shown({ Check-Health })
$Form.ShowDialog() | Out-Null
