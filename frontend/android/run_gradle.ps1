$env:JAVA_HOME = "C:\Users\Rasool\AppData\Local\JetBrains\PyCharm2026.1\tmp\patch-update\jre"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
Set-Location "D:\project\school app\school app\frontend\android"
& ".\gradlew.bat" assembleDebug
