@echo off
:: Batch file to open port 3100 in Windows Defender Firewall with auto-elevation
title فتح منفذ واتساب 3100 في جدار الحماية
chcp 65001 >nul

echo ========================================================
echo  جاري التحقق من صلاحيات المدير (Run as Administrator)...
echo ========================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] الصلاحيات غير كافية، جاري طلب صلاحيات المدير...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo [+] تم الحصول على صلاحيات المدير بنجاح.
echo [+] جاري فتح المنفذ 3100 (TCP Inbound) لخادم الواتساب...

netsh advfirewall firewall delete rule name="WhatsApp_Server_3100" >nul 2>&1
netsh advfirewall firewall add rule name="WhatsApp_Server_3100" dir=in action=allow protocol=TCP localport=3100 profile=any description="Allow incoming WhatsApp Gateway connections on port 3100"

if %errorLevel% equ 0 (
    echo ========================================================
    echo  [✓] تم فتح المنفذ 3100 بنجاح في جدار الحماية!
    echo  الآن يمكن للأجهزة الأخرى والموبايلات على نفس الشبكة
    echo  الاتصال بسيرفر الواتساب دون أي حظر من الويندوز.
    echo ========================================================
) else (
    echo [-] حدث خطأ أثناء إضافة القاعدة في جدار الحماية.
)

pause
