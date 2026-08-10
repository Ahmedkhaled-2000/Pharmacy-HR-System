Set WshShell = CreateObject("WScript.Shell")
ScriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
ScriptPath = ScriptDir & "\WhatsApp-Server-Control.hta"
WshShell.Run "mshta.exe """ & ScriptPath & """", 0, False
