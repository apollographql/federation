#Requires -Version 5

# This file is listed as a .sh file because cloudflare workers
# won't serve a ps1 file for some unknown reason?!
# 
# To install, run:
#   iwr 'http://install.apollographql.com/windows.sh' | iex
$old_erroractionpreference = $erroractionpreference
$erroractionpreference = 'stop' # quit if anything goes wrong

function info($msg) {  write-host "> $msg" -f white }
function warn($msg) {  write-host "! $msg" -f darkyellow }
function err($msg) { write-host "x $msg" -f darkred }
function complete($msg) { write-host "✓ $msg" -f darkgreen }

function mktemp {
    $parent = [System.IO.Path]::GetTempPath()
    [string] $name = [System.Guid]::NewGuid()
    New-Item -ItemType Directory -Path (Join-Path $parent $name)
}

function is_directory([String] $path) {
    return (Test-Path $path) -and (Get-Item $path) -is [System.IO.DirectoryInfo]
}

function installed($app) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try {if(Get-Command $command){RETURN $true}}
    Catch {RETURN $false}
    Finally {$ErrorActionPreference=$oldPreference}
}

function Get-UserAgent() {
    return "Apollo CLI/0.1 PowerShell/$($PSVersionTable.PSVersion.Major).$($PSVersionTable.PSVersion.Minor) (Windows NT $([System.Environment]::OSVersion.Version.Major).$([System.Environment]::OSVersion.Version.Minor); $(if($env:PROCESSOR_ARCHITECTURE -eq 'AMD64'){'Win64; x64; '})$(if($env:PROCESSOR_ARCHITEW6432 -eq 'AMD64'){'WOW64; '})$PSEdition)"
}
function dl($url,$to) {
    $wc = New-Object Net.Webclient
    $wc.Headers.Add('User-Agent', (Get-UserAgent))
    $wc.downloadFile($url,$to)
}

$_tmp = mktemp 
$apollo = "$HOME\.apollo\bin"

function check_environment_readiness() {

    if (($PSVersionTable.PSVersion.Major) -lt 5) {
        err "PowerShell 5 or later is required to run the Apollo CLI."
        err "Upgrade PowerShell: https://docs.microsoft.com/en-us/powershell/scripting/setup/installing-windows-powershell"
        break
    }

    # show notification to change execution policy:
    $allowedExecutionPolicy = @('Unrestricted', 'RemoteSigned', 'ByPass')
    if ((Get-ExecutionPolicy).ToString() -notin $allowedExecutionPolicy) {
        err "PowerShell requires an execution policy in [$($allowedExecutionPolicy -join ", ")] to run the Apollo CLI."
        err "For example, to set the execution policy to 'RemoteSigned' please run :"
        err "'Set-ExecutionPolicy RemoteSigned -scope CurrentUser'"
        break
    }

    # GitHub requires TLS 1.2
    if ([System.Enum]::GetNames([System.Net.SecurityProtocolType]) -notcontains 'Tls12') {
        err "Installing the Apollo CLI requires at least .NET Framework 4.5"
        err "Please download and install it first:"
        err "https://www.microsoft.com/net/download"
        break
    }

    # XXX check curl + tar installations
    # error "The curl command is not installed on this machine. Please install curl before installing the Apollo CLI"
    # error "The tar command is not installed on this machine. Please install tar before installing the Apollo CLI"

    if (installed 'ap') {
        err "The Apollo CLI is already installed. Please remove it before installing a new version." -f red
        # don't abort if invoked with iex that would close the PS session
        if ($myinvocation.mycommand.commandtype -eq 'Script') { return } else { exit 1 }
    }
}

function download_and_install() {
    mkdir "$apollo" -ea 0

    download_from_proxy

    Copy-Item "$_tmp\dist\ap.exe" "$apollo" -Recurse -Force
    Remove-Item "$_tmp" -Recurse -Force

    "$apollo\ap.exe setup" | Invoke-Expression
}

function download_from_proxy() {
    # download CLI tarball
    $tar_url = 'https://install.apollographql.com/cli/windows'
    $tar_file = "$_tmp\ap.tar.gz"
    dl $tar_url $tar_file

    tar -xkf $tar_file -C "$_tmp"
}

function run_main() {
    info "Installing Apollo CLI...`n"

    Write-Output "  `e[4mConfiguration`e[24m"
    info "Bin directory:  $apollo"
    info "Platform:       windows"
    info "Version:        latest"

    check_environment_readiness

    Write-Output "`n"

    info "Installing the Apollo CLI to $apollo...`n"

    download_and_install

    complete "Apollo CLI was successfully installed!"
}

run_main

$erroractionpreference = $old_erroractionpreference # Reset $erroractionpreference to original value