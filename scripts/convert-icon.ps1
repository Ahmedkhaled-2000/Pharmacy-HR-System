Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\Ahmed Khaled\.gemini\antigravity-ide\brain\42f9cb75-fe16-445a-bc52-0dedae8f6de1\.user_uploaded\media_1788903851090.jpg"
$destPng = "d:\Project\HR last\HR New\assets\icon.png"
$splashPng = "d:\Project\HR last\HR New\assets\splash.png"
$publicLogoPng = "d:\Project\HR last\HR New\public\icons\logo_512x512.png"

Write-Host "Loading source image from: $sourcePath"
$sourceImg = [System.Drawing.Image]::FromFile($sourcePath)
Write-Host "Source dimensions: $($sourceImg.Width) x $($sourceImg.Height)"

# Create high-res 512x512 bitmap
$targetSize = 512
$destBmp = New-Object System.Drawing.Bitmap($targetSize, $targetSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($destBmp)
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$graphics.Clear([System.Drawing.Color]::Transparent)

# Draw image to fit 512x512 perfectly
$graphics.DrawImage($sourceImg, 0, 0, $targetSize, $targetSize)

$destBmp.Save($destPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved: $destPng"

$destBmp.Save($splashPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved: $splashPng"

$destBmp.Save($publicLogoPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved: $publicLogoPng"

$graphics.Dispose()
$destBmp.Dispose()
$sourceImg.Dispose()

Write-Host "Icon image processing complete."
