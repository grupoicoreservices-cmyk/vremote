# V-remote Agent — Windows Installer
#
# Uso:
#   .\install_windows.ps1 -Server "https://meu-painel.exemplo.com" -Token "rdpro_xxx"
#
# O que faz:
#   1. Garante Python instalado (avisa caso não esteja)
#   2. Baixa vremote_agent.py do servidor para %LOCALAPPDATA%\V-remote
#   3. Instala dependências Python (requests, mss, pillow, pyautogui)
#   4. Registra uma Tarefa Agendada que executa o agente ao logar (oculto)
#   5. Inicia a tarefa imediatamente
#
# Para desinstalar:
#   Unregister-ScheduledTask -TaskName "V-remoteAgent" -Confirm:$false
#   Remove-Item "$env:LOCALAPPDATA\V-remote" -Recurse -Force

param(
    [Parameter(Mandatory=$true)][string]$Server,
    [Parameter(Mandatory=$true)][string]$Token
)

$ErrorActionPreference = "Stop"

Write-Host "=== V-remote Agent Installer ===" -ForegroundColor Green
Write-Host "Servidor: $Server"
Write-Host ""

# 1) Verifica Python
$python = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $python) {
    Write-Host "Python NAO encontrado. Instale Python 3.10+ em https://www.python.org/downloads/" -ForegroundColor Red
    Write-Host "Ou rode: winget install -e --id Python.Python.3.12" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Python: $($python.Source)" -ForegroundColor Green

# 2) Diretório de instalação
$installDir = "$env:LOCALAPPDATA\V-remote"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$scriptPath = Join-Path $installDir "vremote_agent.py"

# 3) Download do agente
Write-Host "Baixando agente de $Server/api/agent/script ..."
try {
    Invoke-WebRequest -Uri "$Server/api/agent/script" -OutFile $scriptPath -UseBasicParsing
    Write-Host "[OK] Agente salvo em $scriptPath" -ForegroundColor Green
} catch {
    Write-Host "Falha no download: $_" -ForegroundColor Red
    exit 1
}

# 4) Instala dependências
Write-Host "Instalando dependências Python (requests, mss, pillow, pyautogui)..."
& python -m pip install --user --upgrade --quiet pip
& python -m pip install --user --quiet requests mss pillow pyautogui
Write-Host "[OK] Dependências instaladas" -ForegroundColor Green

# 5) Tarefa Agendada
$taskName = "V-remoteAgent"
$pythonExe = $python.Source
$pythonwExe = Join-Path (Split-Path $pythonExe) "pythonw.exe"
if (Test-Path $pythonwExe) { $exe = $pythonwExe } else { $exe = $pythonExe }

$arguments = "`"$scriptPath`" --server `"$Server`" --token `"$Token`""

Write-Host "Registrando Tarefa Agendada '$taskName' ..."

# Remove tarefa anterior se existir
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $exe -Argument $arguments -WorkingDirectory $installDir
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action `
    -Trigger @($triggerLogon, $triggerStartup) `
    -Settings $settings -Principal $principal `
    -Description "V-remote Remote Agent" | Out-Null

Write-Host "[OK] Tarefa registrada" -ForegroundColor Green

# 6) Inicia agora
Write-Host "Iniciando agente..."
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "=== INSTALACAO CONCLUIDA ===" -ForegroundColor Green
Write-Host ""
Write-Host "O agente esta rodando em segundo plano e ira iniciar automaticamente ao logar." -ForegroundColor Cyan
Write-Host "Em alguns segundos, este computador deve aparecer no painel: $Server/devices" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para parar:   Stop-ScheduledTask -TaskName $taskName" -ForegroundColor Yellow
Write-Host "Para desinstalar:" -ForegroundColor Yellow
Write-Host "  Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false" -ForegroundColor Yellow
Write-Host "  Remove-Item `"$installDir`" -Recurse -Force" -ForegroundColor Yellow
