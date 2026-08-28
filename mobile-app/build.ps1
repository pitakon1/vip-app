# VIP Rental App - 构建安装包脚本
# 支持 EAS 云端构建 + 本地构建两种方式

param(
    [Parameter(Position=0)]
    [string]$Command = "help",
    
    [string]$Platform = "android",
    [string]$Profile = "preview"
)

$ErrorActionPreference = "Stop"
$projectDir = $PSScriptRoot

function Show-Help {
    Write-Host @"
==========================================
  VIP Rental App - 构建安装包
==========================================

用法:
  .\build.ps1 <command> [options]

命令:
  install          安装依赖 + EAS CLI
  login            登录 Expo 账号
  configure        配置 EAS 项目 (首次使用)
  
  eas-android      EAS 云端构建 Android APK
  eas-ios          EAS 云端构建 iOS (需要 Apple Developer 账号)
  eas-all          EAS 云端构建双平台
  
  local-android    本地构建 Android APK (需要 Android SDK)
  local-ios        本地构建 iOS (需要 macOS + Xcode)
  
  prebuild         生成 native 项目 (android/ios 目录)
  clean            清理构建产物

选项:
  -Platform        android | ios | all (默认: android)
  -Profile         development | preview | production (默认: preview)

示例:
  .\build.ps1 install
  .\build.ps1 login
  .\build.ps1 configure
  .\build.ps1 eas-android -Profile preview
  .\build.ps1 eas-ios -Profile production
  .\build.ps1 local-android
  .\build.ps1 prebuild -Platform android

构建说明:
  development = 开发调试包 (连接本地服务器)
  preview     = 预览测试包 (APK, 可直接安装)
  production  = 生产发布包 (AAB/App Store)

==========================================
"@ -ForegroundColor Cyan
}

function Install-Deps {
    Write-Host "[1/3] 安装项目依赖..." -ForegroundColor Yellow
    npm install
    
    Write-Host "[2/3] 安装 EAS CLI..." -ForegroundColor Yellow
    npm install -g eas-cli
    
    Write-Host "[3/3] 安装 Expo CLI..." -ForegroundColor Yellow
    npm install -g expo-cli
    
    Write-Host "依赖安装完成!" -ForegroundColor Green
}

function Login-EAS {
    Write-Host "登录 Expo 账号..." -ForegroundColor Yellow
    eas login
}

function Configure-EAS {
    Write-Host "配置 EAS 项目..." -ForegroundColor Yellow
    eas init --id com.vip.rental
    Write-Host "EAS 项目配置完成!" -ForegroundColor Green
    Write-Host "请将 app.json 中的 projectId 更新为上面显示的值" -ForegroundColor Cyan
}

function Build-EAS {
    param([string]$plt, [string]$prof)
    
    Write-Host "开始 EAS 云端构建..." -ForegroundColor Yellow
    Write-Host "  平台: $plt" -ForegroundColor Cyan
    Write-Host "  配置: $prof" -ForegroundColor Cyan
    
    if ($plt -eq "all") {
        eas build --profile $prof --platform all --non-interactive
    } else {
        eas build --profile $prof --platform $plt --non-interactive
    }
    
    Write-Host ""
    Write-Host "构建已提交! 查看进度:" -ForegroundColor Green
    Write-Host "  https://expo.dev/accounts/[your-account]/projects/vip-rental/builds" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "构建完成后, 下载链接会显示在终端和网页上" -ForegroundColor Yellow
}

function Prebuild-Native {
    param([string]$plt)
    
    Write-Host "生成 Native 项目文件..." -ForegroundColor Yellow
    if ($plt -eq "all") {
        npx expo prebuild
    } else {
        npx expo prebuild --platform $plt
    }
    Write-Host "Native 项目已生成!" -ForegroundColor Green
}

function Build-Local-Android {
    Write-Host "本地构建 Android APK..." -ForegroundColor Yellow
    
    # 检查 android 目录是否存在
    if (-not (Test-Path "$projectDir\android")) {
        Write-Host "未找到 android 目录, 先执行 prebuild..." -ForegroundColor Yellow
        npx expo prebuild --platform android
    }
    
    # 检查 JAVA_HOME
    if (-not $env:JAVA_HOME) {
        Write-Host "错误: 未设置 JAVA_HOME, 请安装 JDK 17" -ForegroundColor Red
        Write-Host "下载: https://adoptium.net/temurin/releases/?version=17" -ForegroundColor Cyan
        return
    }
    
    # 检查 ANDROID_HOME
    if (-not $env:ANDROID_HOME) {
        Write-Host "错误: 未设置 ANDROID_HOME, 请安装 Android SDK" -ForegroundColor Red
        Write-Host "下载: https://developer.android.com/studio" -ForegroundColor Cyan
        return
    }
    
    Write-Host "开始 Gradle 构建..." -ForegroundColor Yellow
    Push-Location "$projectDir\android"
    
    # Windows 用 gradlew.bat
    if (Test-Path "gradlew.bat") {
        .\gradlew.bat assembleRelease
    } else {
        Write-Host "错误: 未找到 gradlew.bat" -ForegroundColor Red
    }
    
    Pop-Location
    
    $apkPath = "$projectDir\android\app\build\outputs\apk\release\app-release.apk"
    if (Test-Path $apkPath) {
        Write-Host ""
        Write-Host "构建成功! APK 路径:" -ForegroundColor Green
        Write-Host "  $apkPath" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "安装到设备:" -ForegroundColor Yellow
        Write-Host "  adb install `"$apkPath`"" -ForegroundColor Cyan
    } else {
        Write-Host "构建可能失败, 请检查上方日志" -ForegroundColor Red
    }
}

function Build-Local-iOS {
    Write-Host "iOS 本地构建需要在 macOS 上执行" -ForegroundColor Red
    Write-Host ""
    Write-Host "在 Mac 上执行以下步骤:" -ForegroundColor Yellow
    Write-Host @"
    1. cd mobile-app
    2. npx expo prebuild --platform ios
    3. cd ios && pod install
    4. open VIPRental.xcworkspace
    5. 在 Xcode 中选择设备, 点击 Archive
    6. Window -> Organizer -> Distribute App
"@ -ForegroundColor Cyan
    Write-Host ""
    Write-Host "或使用 EAS 云端构建 (推荐):" -ForegroundColor Yellow
    Write-Host "  .\build.ps1 eas-ios -Profile preview" -ForegroundColor Cyan
}

function Clean-Build {
    Write-Host "清理构建产物..." -ForegroundColor Yellow
    
    $dirsToClean = @(
        "$projectDir\android",
        "$projectDir\ios",
        "$projectDir\node_modules\.cache"
    )
    
    foreach ($dir in $dirsToClean) {
        if (Test-Path $dir) {
            Remove-Item -Recurse -Force $dir
            Write-Host "  已删除: $dir" -ForegroundColor Gray
        }
    }
    
    Write-Host "清理完成!" -ForegroundColor Green
}

# ==================== 主逻辑 ====================

switch ($Command.ToLower()) {
    "help" { Show-Help }
    "install" { Install-Deps }
    "login" { Login-EAS }
    "configure" { Configure-EAS }
    "eas-android" { Build-EAS -plt $Platform -prof $Profile }
    "eas-ios" { Build-EAS -plt "ios" -prof $Profile }
    "eas-all" { Build-EAS -plt "all" -prof $Profile }
    "local-android" { Build-Local-Android }
    "local-ios" { Build-Local-iOS }
    "prebuild" { Prebuild-Native -plt $Platform }
    "clean" { Clean-Build }
    default { 
        Write-Host "未知命令: $Command" -ForegroundColor Red
        Show-Help
    }
}
