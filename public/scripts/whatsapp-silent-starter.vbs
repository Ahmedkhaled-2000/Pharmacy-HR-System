' =========================================================================
' WhatsApp Gateway Silent Background Starter
' Used by Browser Protocol (hr-whatsapp://start) and local auto-launchers.
' Checks if server is already running, and if not, starts it silently.
' =========================================================================

Option Explicit

Dim WshShell, FSO, ScriptDir, ServerScript, NodeExe, WorkingDir, NodePath, UseElectronNode

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' 1. Check if Server is Already Responding on Port 3100
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

' 2. Resolve Server Script & Executable
Sub ResolvePaths()
    ServerScript = ""
    NodeExe = ""
    WorkingDir = ""
    NodePath = ""
    UseElectronNode = False

    ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

    ' Check relative paths first
    Dim relCandidates(4)
    relCandidates(0) = ScriptDir & "\..\server\whatsapp-server.js"
    relCandidates(1) = ScriptDir & "\server\whatsapp-server.js"
    relCandidates(2) = ScriptDir & "\whatsapp-server.js"
    relCandidates(3) = ScriptDir & "\resources\app.asar.unpacked\server\whatsapp-server.js"

    Dim i, p
    For i = 0 To 3
        If FSO.FileExists(relCandidates(i)) Then
            ServerScript = FSO.GetAbsolutePathName(relCandidates(i))
            Exit For
        End If
    Next

    ' Check Registry
    If ServerScript = "" Then
        On Error Resume Next
        Dim regLoc
        regLoc = WshShell.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.pharmacy.hr.system\InstallLocation")
        If regLoc = "" Then
            regLoc = WshShell.RegRead("HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.pharmacy.hr.system\InstallLocation")
        End If
        If regLoc <> "" Then
            p = regLoc & "\resources\app.asar.unpacked\server\whatsapp-server.js"
            If FSO.FileExists(p) Then ServerScript = p
        End If
        On Error GoTo 0
    End If

    ' Check Standard Install Locations
    If ServerScript = "" Then
        Dim progFiles, progFilesX86, localApp
        progFiles = WshShell.ExpandEnvironmentStrings("%ProgramFiles%")
        progFilesX86 = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%")
        localApp = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")

        Dim candidates(6)
        candidates(0) = progFiles & "\pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js"
        candidates(1) = progFilesX86 & "\pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js"
        candidates(2) = localApp & "\Programs\pharmacy-hr-system\resources\app.asar.unpacked\server\whatsapp-server.js"
        candidates(3) = progFiles & "\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js"
        candidates(4) = progFilesX86 & "\منظومة الموارد البشرية\resources\app.asar.unpacked\server\whatsapp-server.js"
        candidates(5) = "d:\Project\HR last\HR New\server\whatsapp-server.js"

        For i = 0 To 5
            If FSO.FileExists(candidates(i)) Then
                ServerScript = candidates(i)
                Exit For
            End If
        Next
    End If

    If ServerScript <> "" Then
        WorkingDir = FSO.GetParentFolderName(ServerScript)
        Dim parentDir
        parentDir = FSO.GetParentFolderName(WorkingDir)
        If FSO.FolderExists(parentDir & "\node_modules") Then
            NodePath = parentDir & "\node_modules"
        End If

        ' Find Node / Electron executable
        Dim searchDir
        searchDir = parentDir
        For i = 0 To 3
            If searchDir = "" Then Exit For
            If FSO.FileExists(searchDir & "\منظومة الموارد البشرية.exe") Then
                NodeExe = searchDir & "\منظومة الموارد البشرية.exe"
                UseElectronNode = True
                Exit For
            ElseIf FSO.FileExists(searchDir & "\pharmacy-hr-system.exe") Then
                NodeExe = searchDir & "\pharmacy-hr-system.exe"
                UseElectronNode = True
                Exit For
            End If
            searchDir = FSO.GetParentFolderName(searchDir)
        Next
    End If

    ' Fallback to system node
    If NodeExe = "" Then
        If FSO.FileExists("C:\Program Files\nodejs\node.exe") Then
            NodeExe = "C:\Program Files\nodejs\node.exe"
        ElseIf FSO.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
            NodeExe = "C:\Program Files (x86)\nodejs\node.exe"
        Else
            NodeExe = "node"
        End If
    End If
End Sub

' 3. Launch Silently if not already healthy
If Not IsServerHealthy() Then
    ResolvePaths()

    If ServerScript <> "" And FSO.FileExists(ServerScript) Then
        Dim ExecCmd
        ExecCmd = "cmd.exe /c "
        If WorkingDir <> "" Then
            ExecCmd = ExecCmd & "cd /d """ & WorkingDir & """ && "
        End If
        If NodePath <> "" Then
            ExecCmd = ExecCmd & "set NODE_PATH=""" & NodePath & """ && "
        End If
        If UseElectronNode Then
            ExecCmd = ExecCmd & "set ELECTRON_RUN_AS_NODE=1 && "
        End If
        ExecCmd = ExecCmd & "set PORT=3100 && set NODE_ENV=production && """ & NodeExe & """ """ & ServerScript & """"

        WshShell.Run ExecCmd, 0, False
    End If
End If
