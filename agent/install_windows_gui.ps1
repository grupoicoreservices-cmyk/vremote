# V-remote Client (GUI) — Instalador Windows
#
# Instala o cliente com interface gráfica (estilo RustDesk) que mostra o ID
# para o usuário compartilhar com o suporte.
#
# Uso:
#   .\install_windows_gui.ps1 -Server "https://meu-painel.exemplo.com"
#
# Cria atalho na Área de Trabalho e Menu Iniciar.
# O usuário cola o token na primeira execução, dentro da própria janela.

param(
    [Parameter(Mandatory=$true)][string]$Server
)

$ErrorActionPreference = "Stop"

Write-Host "=== V-remote Client (GUI) Installer ===" -ForegroundColor Green
Write-Host "Servidor: $Server"
Write-Host ""

$python = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $python) {
    Write-Host "Python NAO encontrado. Instale: winget install -e --id Python.Python.3.12" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Python: $($python.Source)" -ForegroundColor Green

$installDir = "$env:LOCALAPPDATA\V-remote"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$scriptPath = Join-Path $installDir "vremote_client.py"

Write-Host "Baixando cliente..."
Invoke-WebRequest -Uri "$Server/api/agent/client" -OutFile $scriptPath -UseBasicParsing
Write-Host "[OK] Cliente salvo em $scriptPath" -ForegroundColor Green

Write-Host "Instalando dependências..."
& python -m pip install --user --upgrade --quiet pip
& python -m pip install --user --upgrade --force-reinstall --quiet requests mss pillow pyautogui websocket-client
# Verifica que pyautogui realmente importa
$pyTest = & python -c "import pyautogui; print('OK')" 2>&1
if ($pyTest -notmatch "OK") {
    Write-Host "[AVISO] pyautogui falhou ao importar: $pyTest" -ForegroundColor Yellow
    Write-Host "Tentando instalar dependências de sistema..." -ForegroundColor Yellow
    & python -m pip install --user --upgrade --force-reinstall pyautogui pyscreeze pillow 2>&1 | Out-Null
}
Write-Host "[OK] Dependências instaladas" -ForegroundColor Green

# Use pythonw.exe para esconder o console
$pythonwExe = Join-Path (Split-Path $python.Source) "pythonw.exe"
$exe = if (Test-Path $pythonwExe) { $pythonwExe } else { $python.Source }
$arguments = "`"$scriptPath`" --server `"$Server`""

# Atalho Área de Trabalho
$ws = New-Object -ComObject WScript.Shell
$desktopLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "V-remote Client.lnk"
$shortcut = $ws.CreateShortcut($desktopLnk)
$shortcut.TargetPath = $exe
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $installDir
$shortcut.IconLocation = $exe
$shortcut.Description = "V-remote Remote Access Client"
$shortcut.Save()
Write-Host "[OK] Atalho na Area de Trabalho: $desktopLnk" -ForegroundColor Green

# Atalho Menu Iniciar
$startDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
$startLnk = Join-Path $startDir "V-remote Client.lnk"
$startShortcut = $ws.CreateShortcut($startLnk)
$startShortcut.TargetPath = $exe
$startShortcut.Arguments = $arguments
$startShortcut.WorkingDirectory = $installDir
$startShortcut.IconLocation = $exe
$startShortcut.Save()
Write-Host "[OK] Atalho no Menu Iniciar" -ForegroundColor Green

Write-Host ""
Write-Host "=== INSTALADO ===" -ForegroundColor Green
Write-Host "Abra 'V-remote Client' na Area de Trabalho." -ForegroundColor Cyan
Write-Host "Cole o token na primeira execucao e seu ID aparecera na tela." -ForegroundColor Cyan
Write-Host ""
Write-Host "Para desinstalar:" -ForegroundColor Yellow
Write-Host "  Remove-Item '$desktopLnk', '$startLnk', '$installDir' -Recurse -Force -ErrorAction SilentlyContinue" -ForegroundColor Yellow

# Inicia agora
Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $installDir
