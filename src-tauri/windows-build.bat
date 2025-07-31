@echo off
echo Setting up environment variables...

set VCPKG_ROOT=D:\Code\Auto-Evaluate-App\depends\vcpkg-master
set VCPKGRS_DYNAMIC=0
set OPENCV_MSVC_CRT=static
set VCPKGRS_TRIPLET=x64-windows-static
set OPENCV_LINK_PATH=%VCPKG_ROOT%\installed\x64-windows-static\x64-windows-static\lib
set OPENCV_INCLUDE_PATH=%VCPKG_ROOT%\installed\x64-windows-static\include
set OPENCV_LINK_LIBS=opencv_core4,opencv_imgproc4,opencv_imgcodecs4

REM 设置 libclang 路径 - 确保在 PATH 的最前面
set LIBCLANG_PATH=D:\Code\Auto-Evaluate-App\depends\clang+llvm-18.1.8-x86_64-pc-windows-msvc\bin
set PATH=%LIBCLANG_PATH%;%PATH%

REM 设置额外的环境变量来帮助 libclang 加载
set LIBCLANG_STATIC=1
set LIBCLANG_DISABLE_CRASH_RECOVERY=1

REM 验证 libclang 文件
echo Checking libclang files...
if exist "%LIBCLANG_PATH%\libclang.dll" (
    echo libclang.dll found at %LIBCLANG_PATH%\libclang.dll
) else (
    echo ERROR: libclang.dll not found
    pause
    exit /b 1
)

REM 检查 clang.exe 或 clang.dll
if exist "%LIBCLANG_PATH%\clang.exe" (
    echo clang.exe found at %LIBCLANG_PATH%\clang.exe
) else if exist "%LIBCLANG_PATH%\clang.dll" (
    echo clang.dll found at %LIBCLANG_PATH%\clang.dll
) else (
    echo WARNING: Neither clang.exe nor clang.dll found
    echo This might cause issues with OpenCV binding generation
)

echo Environment variables:
echo VCPKG_ROOT=%VCPKG_ROOT%
echo LIBCLANG_PATH=%LIBCLANG_PATH%
echo VCPKGRS_DYNAMIC=%VCPKGRS_DYNAMIC%

echo Cleaning previous build...
cargo clean

echo Building with static OpenCV...
cargo build --release

npm run tauri build

echo Build completed!
pause
