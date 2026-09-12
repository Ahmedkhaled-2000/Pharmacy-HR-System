' =========================================================================
' WhatsApp Gateway Silent Background Starter
' Used by Browser Protocol (hr-whatsapp://start) and local auto-launchers.
' Checks if server is already running, and if not, starts it silently.
' =========================================================================

Option Explicit

Dim WshShell, FSO, ScriptDir, ProjectDir, ServerScript, ExecCmd

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' 1. Resolve Project Root Directory
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
ProjectDir = FSO.GetParentFolderName(ScriptDir)

If Not FSO.FileExists(ProjectDir & "\server\whatsapp-server.js") Then
    ProjectDir = "d:\Project\HR last\HR New"
End If

ServerScript = ProjectDir & "\server\whatsapp-server.js"

' 2. Check if Server is Already Responding on Port 3100
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

' 3. Launch Silently if not already healthy
If Not IsServerHealthy() Then
    WshShell.CurrentDirectory = ProjectDir
    Dim NodeExe
    If FSO.FileExists("C:\Program Files\nodejs\node.exe") Then
        NodeExe = """C:\Program Files\nodejs\node.exe"""
    ElseIf FSO.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
        NodeExe = """C:\Program Files (x86)\nodejs\node.exe"""
    Else
        NodeExe = "node"
    End If
    ExecCmd = "cmd.exe /c cd /d """ & ProjectDir & """ && " & NodeExe & " server\whatsapp-server.js > server.log 2>&1"
    WshShell.Run ExecCmd, 0, False
End If
