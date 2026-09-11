' =========================================================================
' WhatsApp Gateway Silent Background Starter (24/7 Daemon)
' Starts Node.js WhatsApp Server silently without opening any CMD console
' =========================================================================

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

Dim ScriptDir, ProjectDir, ServerScript

If WScript.Arguments.Count > 0 Then
    ProjectDir = WScript.Arguments(0)
Else
    ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
    ProjectDir = FSO.GetParentFolderName(ScriptDir)
    If Not FSO.FileExists(ProjectDir & "\server\whatsapp-server.js") Then
        ProjectDir = "d:\Project\HR last\HR New"
    End If
End If

ServerScript = ProjectDir & "\server\whatsapp-server.js"

If FSO.FileExists(ServerScript) Then
    WshShell.CurrentDirectory = ProjectDir
    ' Run silently (0 = hidden window, False = don't wait for completion)
    WshShell.Run "node """ & ServerScript & """", 0, False
End If
