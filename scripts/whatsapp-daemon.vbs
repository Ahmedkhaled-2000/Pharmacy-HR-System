' =========================================================================
' 24/7 WhatsApp Gateway Silent Background Daemon & Watchdog
' Starts WhatsApp server completely silently and monitors it continuously.
' Restarts automatically if closed or crashed.
' =========================================================================

Option Explicit

Dim WshShell, FSO, ScriptDir, ProjectDir, ServerScript, ExecCmd

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' 1. Resolve Project Root Directory
If WScript.Arguments.Count > 0 Then
    ProjectDir = WScript.Arguments(0)
Else
    ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
    ProjectDir = FSO.GetParentFolderName(ScriptDir)
End If

If Not FSO.FileExists(ProjectDir & "\server\whatsapp-server.js") Then
    ProjectDir = "d:\Project\HR last\HR New"
End If

ServerScript = ProjectDir & "\server\whatsapp-server.js"

' 2. Function to Check if Server is Healthy on Port 3100
Function IsServerHealthy()
    IsServerHealthy = False
    On Error Resume Next
    Dim xmlhttp
    Set xmlhttp = CreateObject("MSXML2.XMLHTTP")
    xmlhttp.Open "GET", "http://127.0.0.1:3100/health", False
    xmlhttp.Send
    If Err.Number = 0 Then
        If xmlhttp.Status = 200 Then
            IsServerHealthy = True
        End If
    End If
    On Error GoTo 0
End Function

' 3. Function to Start the Server Process Silently
Sub StartServerProcess()
    If Not FSO.FileExists(ServerScript) Then Exit Sub
    WshShell.CurrentDirectory = ProjectDir
    ExecCmd = "cmd.exe /c cd /d """ & ProjectDir & """ && node server\whatsapp-server.js > server.log 2>&1"
    WshShell.Run ExecCmd, 0, False
End Sub

' 4. Initial Startup Check
If Not IsServerHealthy() Then
    StartServerProcess
    WScript.Sleep 4000
End If

' 5. 24/7 Watchdog Supervisor Loop (Checks every 25 seconds)
Do
    WScript.Sleep 25000
    If Not IsServerHealthy() Then
        StartServerProcess
        WScript.Sleep 5000
    End If
Loop
