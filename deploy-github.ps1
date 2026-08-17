# ============================================================
# 智刷星 · GitHub Pages 一键部署脚本
# 用法:运行后按提示粘贴 GitHub 用户名和 Token(创建方法见下)
# Token 创建: https://github.com/settings/tokens/new
#   -> 勾选 repo(或 public_repo)权限,有效期随意,创建后复制 sk- 开头的值
# ============================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  智刷星 GitHub Pages 一键部署" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 收集 GitHub 用户名与 Token
$ghUser = Read-Host "GitHub 用户名"
$ghToken = Read-Host "GitHub Token(粘贴后回车,不会显示)"
if ([string]::IsNullOrWhiteSpace($ghUser) -or [string]::IsNullOrWhiteSpace($ghToken)) {
  Write-Error "用户名或 Token 不能为空"; exit 1
}

# 2. 仓库名(默认 zhishuxing,可改成自己的)
$repo = Read-Host "仓库名(直接回车用默认 zhishuxing)"
if ([string]::IsNullOrWhiteSpace($repo)) { $repo = "zhishuxing" }

$api = "https://api.github.com"
$authHeader = @{ Authorization = "Bearer $ghToken"; "User-Agent" = "zhishuxing-deploy"; Accept = "application/vnd.github+json" }

# 3. 检查仓库是否存在,不存在则创建(Public)
Write-Host "`n[1/4] 检查仓库 $ghUser/$repo ..." -ForegroundColor Yellow
$repoUrl = "$api/repos/$ghUser/$repo"
try {
  Invoke-RestMethod -Uri $repoUrl -Headers $authHeader -Method Get | Out-Null
  Write-Host "  -> 仓库已存在,直接使用" -ForegroundColor Green
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 404) {
    Write-Host "  -> 仓库不存在,正在创建..." -ForegroundColor Yellow
    $body = @{ name = $repo; description = "智刷星 - AI 专业课智能刷题平台"; private = $false; auto_init = $true } | ConvertTo-Json
    Invoke-RestMethod -Uri "$api/user/repos" -Headers $authHeader -Method Post -Body $body -ContentType "application/json" | Out-Null
    Write-Host "  -> 创建成功" -ForegroundColor Green
  } else {
    Write-Error "检查仓库失败: $($_.Exception.Message)"; exit 1
  }
}

# 4. 配置远端并推送
Write-Host "[2/4] 配置 git 并推送代码..." -ForegroundColor Yellow
& $git -C $root remote remove origin 2>$null
& $git -C $root remote add origin "https://x-access-token:$ghToken@github.com/$ghUser/$repo.git"
& $git -C $root add -A
& $git -C $root -c user.name="$ghUser" -c user.email="$ghUser@users.noreply.github.com" commit -m "智刷星:AI专业课智能刷题平台" 2>$null
& $git -C $root push -u origin main 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "推送失败(退出码 $LASTEXITCODE)。常见原因:Token 权限不足或网络问题。"; exit 1
}
Write-Host "  -> 代码推送成功" -ForegroundColor Green

# 5. 配置 GitHub Pages 使用 GitHub Actions 部署
Write-Host "[3/4] 配置 GitHub Pages(GitHub Actions 源)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
$pagesBody = @{ source = @{ branch = "main"; path = "/" }; build_type = "workflow" } | ConvertTo-Json -Depth 3
try {
  Invoke-RestMethod -Uri "$repoUrl/pages" -Headers $authHeader -Method Post -Body $pagesBody -ContentType "application/json" | Out-Null
  Write-Host "  -> Pages 已配置为 GitHub Actions 部署" -ForegroundColor Green
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "  -> Pages 已启用,无需重复配置" -ForegroundColor Green
  } elseif ($_.Exception.Response.StatusCode.value__ -eq 422) {
    Write-Host "  -> Pages 源已存在,忽略(不影响 Actions 自动部署)" -ForegroundColor Green
  } else {
    Write-Host "  -> Pages 配置返回: $($_.Exception.Message)(可稍后手动在 Settings 确认)" -ForegroundColor Yellow
  }
}

# 6. 输出结果
Write-Host "[4/4] 完成!" -ForegroundColor Yellow
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  你的网站将在这里(1-3 分钟后生效):" -ForegroundColor Green
Write-Host "  https://$ghUser.github.io/$repo/" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "部署状态: https://github.com/$ghUser/$repo/actions" -ForegroundColor Cyan
Write-Host "若 Actions 显示绿色 ✓,网站即已上线。" -ForegroundColor Cyan
