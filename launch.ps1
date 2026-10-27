# launch.ps1 — MobaXterm Keygen 本地网站启动/停止（PowerShell 版，推荐）
#
#   powershell -File launch.ps1 start      启动 + 自动开浏览器
#   powershell -File launch.ps1 stop       停止
#   powershell -File launch.ps1 status     查看状态
#   powershell -File launch.ps1 restart    重启
#   powershell -File launch.ps1 single     直接打开单文件版 MobaXtermKeygen.html
#
# 中文显示正常（PowerShell 原生 UTF-8）。start.bat / stop.bat 是它的薄包装。

param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'status', 'restart', 'single', 'help')]
    [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunDir = Join-Path $Root '.run'
$PidFile = Join-Path $RunDir 'server.pid'
$UrlFile = Join-Path $RunDir 'server.url'
$LogFile = Join-Path $RunDir 'server.log'
$JsonFile = Join-Path $RunDir 'runtime.json'
$BasePort = 8899
$Host_ = '127.0.0.1'

function Write-Banner($text) {
    Write-Host ''
    Write-Host '  ============================================' -ForegroundColor DarkCyan
    Write-Host "   $text" -ForegroundColor Cyan
    Write-Host '  ============================================' -ForegroundColor DarkCyan
    Write-Host ''
}
function Write-Step($n, $text) { Write-Host "  [$n] $text" -ForegroundColor Gray }
function Write-Ok($text)       { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn2($text)    { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Write-Err($text)      { Write-Host "  [X] $text" -ForegroundColor Red }

function Ensure-RunDir {
    if (-not (Test-Path $RunDir)) { New-Item -ItemType Directory -Path $RunDir | Out-Null }
}

function Get-RecordedPid {
    if (Test-Path $PidFile) {
        $p = (Get-Content $PidFile -Raw).Trim()
        if ($p -match '^\d+$') { return [int]$p }
    }
    return $null
}

function Get-RecordedUrl {
    if (Test-Path $UrlFile) { return (Get-Content $UrlFile -Raw).Trim() }
    return $null
}

function Test-Alive([int]$ProcessId) {
    $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $p) { return $false }
    # 必须还是我们的 node/python 服务，不是被复用的 PID
    return ($p.ProcessName -in @('node', 'python', 'pythonw'))
}

function Stop-Server {
    Ensure-RunDir
    $killed = $false

    # 1) 记录里的 PID
    $recPid = Get-RecordedPid
    if ($recPid -and (Test-Alive $recPid)) {
        try {
            Stop-Process -Id $recPid -Force -ErrorAction Stop
            Write-Ok "已结束进程 PID $recPid"
            $killed = $true
        } catch {
            Write-Warn2 "PID $recPid 结束失败：$($_.Exception.Message)"
        }
    } elseif ($recPid) {
        Write-Host "  [i] 记录的 PID $recPid 已不在运行" -ForegroundColor DarkGray
    }

    # 2) 端口回退：按记录的 URL 端口，再扫 8899-8919
    $ports = @()
    $recUrl = Get-RecordedUrl
    if ($recUrl -match ':(\d+)') { $ports += [int]$Matches[1] }
    $ports += $BasePort..($BasePort + 20) | Where-Object { $_ -ne $ports }

    foreach ($port in ($ports | Select-Object -Unique)) {
        $conns = @()
        try { $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue } catch {}
        foreach ($c in $conns) {
            if (-not $c.OwningProcess) { continue }
            $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if (-not $proc) { continue }
            if ($proc.ProcessName -notin @('node', 'python', 'pythonw')) { continue }
            try {
                Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                Write-Ok "已结束 $($proc.ProcessName) PID $($proc.Id)（端口 $port）"
                $killed = $true
            } catch {
                Write-Warn2 "端口 $port 上的 $($proc.ProcessName) PID $($proc.Id) 结束失败"
            }
        }
    }

    Remove-Item $PidFile, $UrlFile, $JsonFile -ErrorAction SilentlyContinue
    return $killed
}

function Show-Status {
    Ensure-RunDir
    $recPid = Get-RecordedPid
    $recUrl = Get-RecordedUrl
    if ($recPid -and (Test-Alive $recPid)) {
        $alive = $true
        try {
            $r = Invoke-WebRequest -Uri $recUrl -Method Head -TimeoutSec 3 -UseBasicParsing
            $alive = ($r.StatusCode -eq 200)
        } catch { $alive = $false }
        Write-Banner '运行中'
        Write-Host "   PID  : $recPid" -ForegroundColor White
        Write-Host "   地址 : $recUrl" -ForegroundColor White
        Write-Host "   HTTP : $(if($alive){'200 OK'}else{'无响应'})" -ForegroundColor $(if($alive){'Green'}else{'Red'})
        Write-Host ''
        Write-Host "   停止 : powershell -File launch.ps1 stop" -ForegroundColor DarkGray
    } else {
        Write-Banner '未运行'
        Write-Host "   启动 : powershell -File launch.ps1 start" -ForegroundColor DarkGray
    }
    Write-Host ''
}

function Start-Server {
    if (-not (Test-Path (Join-Path $Root 'index.html'))) {
        Write-Err "当前目录找不到 index.html：$Root"
        Write-Host '       请把 launch.ps1 放在项目根目录。' -ForegroundColor Gray
        return $false
    }
    Ensure-RunDir

    # 已在运行 → 直接开浏览器
    $recPid = Get-RecordedPid
    if ($recPid -and (Test-Alive $recPid)) {
        $recUrl = Get-RecordedUrl
        Write-Banner '服务已在运行'
        Write-Host "   PID  : $recPid" -ForegroundColor White
        Write-Host "   地址 : $recUrl" -ForegroundColor White
        Write-Host ''
        Write-Host '   正在打开浏览器...' -ForegroundColor DarkGray
        Start-Process $recUrl
        return $true
    }
    Remove-Item $PidFile, $UrlFile, $JsonFile -ErrorAction SilentlyContinue

    Write-Banner 'MobaXterm Keygen 本地网站 启动中'

    # 选择运行时。优先 python（launch.ps1 固定用 python -m http.server），
    # 因为 node.exe / python.exe 都是可直接执行的原生程序；
    # Node 若被 Electron 类运行时代替（argv[1] 语义不同）会带来不必要的差异。
    $py   = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
    $node = Get-Command node -ErrorAction SilentlyContinue

    if ($py) {
        $pyVer = (& $py.Source --version) 2>&1
        Write-Step '1/4' "运行时：$pyVer"
        $exe = $py.Source
        $argList = @('-m', 'http.server', "$BasePort", '--bind', $Host_)
        $launchWorkDir = $Root
    } elseif ($node) {
        Write-Step '1/4' "运行时：Node $((& node --version))"
        $exe = $node.Source
        $argList = @((Join-Path $Root 'server.mjs'), "$BasePort", $Host_)
        $launchWorkDir = $Root
    } else {
        Write-Err '没找到 Python 或 Node.js，无法启动本地服务。'
        Write-Host '       替代方案：直接双击 MobaXtermKeygen.html（单文件版，无需服务）' -ForegroundColor Gray
        return $false
    }

    $LogFile = Join-Path $RunDir 'server.log'
    Write-Step '2/4' "工作目录：$Root"
    Write-Step '3/4' '后台启动服务...'

    $proc = Start-Process -FilePath $exe -ArgumentList $argList -WorkingDirectory $launchWorkDir `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err"
    $startedAt = Get-Date

    # 轮询就绪
    # 判定标准：端口有响应 + 监听的 PID 属于本次启动的进程树。
    # 这样不会把「启动前就已存在的服务」误认成自己的。
    $ready = $false
    $url = $null
    $procIds = @($proc.Id)

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 400

        # 进程已退出 → 直接失败，不用等满 24 秒
        $mainAlive = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
        if (-not $mainAlive) { break }

        foreach ($p in $BasePort..($BasePort + 20)) {
            $owner = $null
            try {
                $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop | Select-Object -First 1
                $owner = $conn.OwningProcess
            } catch { continue }
            if (-not $owner) { continue }
            if ($owner -notin $procIds) { continue }   # 不是我们起的，跳过

            try {
                $probe = Invoke-WebRequest -Uri "http://${Host_}:$p/index.html" -Method Head -TimeoutSec 2 -UseBasicParsing
                if ($probe.StatusCode -eq 200) {
                    $url = "http://${Host_}:$p/index.html"
                    Set-Content -Path $PidFile -Value $owner -NoNewline -Encoding ascii
                    Set-Content -Path $UrlFile -Value $url -NoNewline -Encoding ascii
                    $ready = $true
                    break
                }
            } catch {}
        }
        if ($ready) { break }
    }

    if (-not $ready) {
        Write-Err '服务启动后 24 秒内没有响应。'
        if (Test-Path $LogFile) {
            Write-Host '       --- server.log ---' -ForegroundColor DarkGray
            Get-Content $LogFile -Tail 20 | ForEach-Object { Write-Host "       $_" -ForegroundColor DarkGray }
        }
        if (Test-Path "$LogFile.err") {
            Get-Content "$LogFile.err" -Tail 10 | ForEach-Object { Write-Host "       $_" -ForegroundColor DarkRed }
        }
        Write-Host ''
        Write-Host '       替代方案：直接双击 MobaXtermKeygen.html' -ForegroundColor Gray
        try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
        return $false
    }

    Write-Step '4/4' '服务已就绪'
    Write-Host ''
    Write-Host '  ============================================' -ForegroundColor DarkCyan
    Write-Host "   地址： $url" -ForegroundColor Green
    Write-Host "   目录： $Root" -ForegroundColor Gray
    Write-Host "   日志： .run\server.log" -ForegroundColor Gray
    Write-Host '   停止： powershell -File launch.ps1 stop' -ForegroundColor Gray
    Write-Host '  ============================================' -ForegroundColor DarkCyan
    Write-Host ''
    Write-Host '   正在打开浏览器...' -ForegroundColor DarkGray
    Start-Process $url
    return $true
}

switch ($Action) {
    'start'   { [void](Start-Server) }
    'stop'    { if (Stop-Server) { Write-Banner '服务已停止' } else { Write-Banner '没有正在运行的服务' } }
    'restart' { [void](Stop-Server); Start-Sleep -Milliseconds 600; [void](Start-Server) }
    'status'  { Show-Status }
    'single'  {
        $f = Join-Path $Root 'MobaXtermKeygen.html'
        if (Test-Path $f) { Write-Banner '打开单文件版'; Start-Process $f }
        else { Write-Err '找不到 MobaXtermKeygen.html，先运行：node build_single_file.mjs' }
    }
    default {
        Write-Banner 'MobaXterm Keygen 启动器'
        Write-Host '   start    启动本地网站并自动打开浏览器'
        Write-Host '   stop     停止后台服务'
        Write-Host '   restart  重启'
        Write-Host '   status   查看运行状态'
        Write-Host '   single   打开单文件版（无需服务）'
        Write-Host ''
    }
}
