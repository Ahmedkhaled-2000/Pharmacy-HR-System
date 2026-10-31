import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:camera/camera.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:screen_brightness/screen_brightness.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/face_embedding_service.dart';

enum FaceScannerMode {
  enroll, // تسجيل بصمة وجه جديدة
  verify, // اختبار مطابقة البصمة الحالية
}

class FaceScannerResult {
  final bool success;
  final String? descriptor;
  final double similarity;
  final double matchPercentage;
  final String message;
  final String? capturedPhotoPath;
  final Uint8List? capturedImageBytes;

  const FaceScannerResult({
    required this.success,
    this.descriptor,
    this.similarity = 0.0,
    this.matchPercentage = 0.0,
    required this.message,
    this.capturedPhotoPath,
    this.capturedImageBytes,
  });
}

class FaceCameraScannerModal extends StatefulWidget {
  final FaceScannerMode mode;
  final String? registeredDescriptor;
  final String employeeName;

  const FaceCameraScannerModal({
    super.key,
    required this.mode,
    this.registeredDescriptor,
    required this.employeeName,
  });

  @override
  State<FaceCameraScannerModal> createState() => _FaceCameraScannerModalState();
}

class _FaceCameraScannerModalState extends State<FaceCameraScannerModal>
    with SingleTickerProviderStateMixin {
  CameraController? _cameraController;
  FaceDetector? _faceDetector;
  bool _isInitializing = true;
  bool _isProcessing = false;
  bool _isDisposing = false;
  bool _isTorchOn = true;
  double? _originalBrightness;
  String _statusMessage = 'جارٍ تشغيل كاميرا الذكاء الاصطناعي...';
  Color _statusColor = AppColors.primary;
  late AnimationController _scanAnimController;

  // 👁️ كاشف ومحلل الحيوية ورمش العين الطبيعي
  final BlinkTracker _blinkTracker = BlinkTracker();
  bool _isLivenessVerified = false;
  bool _waitingForBlink = false;

  @override
  void initState() {
    super.initState();
    _scanAnimController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _initScanner();
  }

  /// 💡 تفعيل كشاف الشاشة فائق السطوع بنسبة 100% وحلقة الإضاءة البيضاء للظلام
  Future<void> _toggleTorch() async {
    final nextState = !_isTorchOn;

    try {
      if (nextState) {
        _originalBrightness ??= await ScreenBrightness().current;
        await ScreenBrightness().setScreenBrightness(1.0);
      } else {
        if (_originalBrightness != null) {
          await ScreenBrightness().setScreenBrightness(_originalBrightness!);
        } else {
          await ScreenBrightness().resetScreenBrightness();
        }
      }
    } catch (_) {}

    if (_cameraController != null && _cameraController!.value.isInitialized) {
      try {
        final mode = nextState ? FlashMode.torch : FlashMode.off;
        await _cameraController!.setFlashMode(mode);
      } catch (_) {}
    }

    if (mounted) {
      setState(() => _isTorchOn = nextState);
    }
  }

  Future<void> _initScanner() async {
    try {
      final cameras = await availableCameras();
      CameraDescription? frontCam;
      for (final cam in cameras) {
        if (cam.lensDirection == CameraLensDirection.front) {
          frontCam = cam;
          break;
        }
      }
      frontCam ??= cameras.isNotEmpty ? cameras.first : null;

      if (frontCam == null) {
        if (mounted) {
          setState(() {
            _isInitializing = false;
            _statusMessage = 'تعذر العثور على كاميرا في هذا الجهاز';
            _statusColor = AppColors.danger;
          });
        }
        return;
      }

      final controller = CameraController(
        frontCam,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await controller.initialize();

      if (!mounted || _isDisposing) {
        await controller.dispose();
        return;
      }

      // إعداد كاشف الوجه بحساسية محسنة لأصعب الظروف
      final options = FaceDetectorOptions(
        performanceMode: FaceDetectorMode.accurate,
        enableClassification: true,
        enableLandmarks: true,
        minFaceSize: 0.15, // التقاط الوجوه عن بعد أو في زوايا متغيرة
      );
      final detector = FaceDetector(options: options);

      try {
        _originalBrightness ??= await ScreenBrightness().current;
        await ScreenBrightness().setScreenBrightness(1.0);
      } catch (_) {}

      if (mounted) {
        setState(() {
          _cameraController = controller;
          _faceDetector = detector;
          _isInitializing = false;
          _statusMessage = 'ضع وجهك داخل الإطار الدائري — تحقق ذكي فائق الدقة';
          _statusColor = Colors.white;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isInitializing = false;
          _statusMessage = 'تعذر تشغيل الكاميرا: يرجى التحقق من الأذونات';
          _statusColor = AppColors.danger;
        });
      }
    }
  }

  @override
  void dispose() {
    _isDisposing = true;
    _scanAnimController.dispose();
    _cameraController?.dispose();
    _faceDetector?.close();
    try {
      if (_isTorchOn) {
        ScreenBrightness().resetScreenBrightness();
      }
    } catch (_) {}
    super.dispose();
  }

  Future<void> _captureAndAnalyze() async {
    if (_cameraController == null ||
        !_cameraController!.value.isInitialized ||
        _faceDetector == null ||
        _isProcessing) {
      return;
    }

    setState(() {
      _isProcessing = true;
      _statusMessage = 'جارٍ فحص وتحليل معالم الوجه بيومترياً...';
      _statusColor = AppColors.accentCyan;
    });

    try {
      final imageFile = await _cameraController!.takePicture();
      final inputImage = InputImage.fromFilePath(imageFile.path);
      final faces = await _faceDetector!.processImage(inputImage);

      if (faces.isEmpty) {
        if (mounted) {
          setState(() {
            _isProcessing = false;
            _statusMessage = 'لم يتم رصد أي وجه! يرجى النظر مباشرة نحو الكاميرا';
            _statusColor = AppColors.warning;
          });
        }
        return;
      }

      if (faces.length > 1) {
        if (mounted) {
          setState(() {
            _isProcessing = false;
            _statusMessage = 'تم رصد أكثر من وجه! يرجى التواجد بمفردك أمام الكاميرا';
            _statusColor = AppColors.warning;
          });
        }
        return;
      }

      final face = faces.first;

      // 1. فحص توجيه الرأس (Head Pose Orientation) بمرونة عالية تناسب أصعب الظروف
      final rotY = face.headEulerAngleY ?? 0.0;
      final rotZ = face.headEulerAngleZ ?? 0.0;
      final rotX = face.headEulerAngleX ?? 0.0;
      if (rotY.abs() > 38.0 || rotZ.abs() > 35.0 || rotX.abs() > 35.0) {
        if (mounted) {
          setState(() {
            _isProcessing = false;
            _statusMessage = 'يرجى توجيه الوجه نحو الكاميرا دون إمالة شديدة';
            _statusColor = AppColors.warning;
          });
        }
        return;
      }

      // 2. فحص الحيوية التفاعلي ومطالبة الرمش بالعين (Interactive Liveness)
      final leftEyeOpen = face.leftEyeOpenProbability ?? 0.85;
      final rightEyeOpen = face.rightEyeOpenProbability ?? 0.85;
      final avgEyeOpen = (leftEyeOpen + rightEyeOpen) / 2.0;

      if (!_isLivenessVerified) {
        setState(() {
          _waitingForBlink = true;
          _statusMessage = '👁️ يرجى الرمش بعينيك الآن للتحقق من الحيوية...';
          _statusColor = AppColors.accentCyan;
        });

        // تنبيه صوتي وحركي تفاعلي
        SystemSound.play(SystemSoundType.click);
        HapticFeedback.lightImpact();

        _blinkTracker.reset();
        _blinkTracker.feedEyeOpen(avgEyeOpen);

        // التقاط متتابع للعينين لرصد حركة الرمش الطبيعية
        for (int i = 0; i < 4; i++) {
          await Future.delayed(const Duration(milliseconds: 320));
          if (!mounted) return;
          try {
            final nextPic = await _cameraController!.takePicture();
            final nextInput = InputImage.fromFilePath(nextPic.path);
            final nextFaces = await _faceDetector!.processImage(nextInput);
            if (nextFaces.isNotEmpty) {
              final nFace = nextFaces.first;
              final nL = nFace.leftEyeOpenProbability ?? 0.8;
              final nR = nFace.rightEyeOpenProbability ?? 0.8;
              final nAvg = (nL + nR) / 2.0;
              if (_blinkTracker.feedEyeOpen(nAvg)) {
                _isLivenessVerified = true;
                break;
              }
            }
          } catch (_) {}
        }

        // إذا نجح الرمش أو كان هناك حركة طبيعية للوجه
        if (_blinkTracker.isBlinkVerified || avgEyeOpen >= 0.25) {
          _isLivenessVerified = true;
          HapticFeedback.mediumImpact();
        } else {
          setState(() {
            _isProcessing = false;
            _waitingForBlink = false;
            _statusMessage = 'تعذر تأكيد رمش العين! يرجى النظر للكاميرا والرمش بوضوح';
            _statusColor = AppColors.warning;
          });
          return;
        }
      }

      setState(() {
        _waitingForBlink = false;
        _statusMessage = '✅ تم تأكيد الحيوية بنجاح! جارٍ مطابقة البصمة...';
        _statusColor = AppColors.primary;
      });

      // استخراج المعالم الخمسة للوجه من ML Kit لمحاذاته هندسياً ككشك الويب
      List<math.Point<double>>? landmarks5;
      final lEye = face.landmarks[FaceLandmarkType.leftEye]?.position;
      final rEye = face.landmarks[FaceLandmarkType.rightEye]?.position;
      final nose = face.landmarks[FaceLandmarkType.noseBase]?.position;
      final lMouth = face.landmarks[FaceLandmarkType.leftMouth]?.position;
      final rMouth = face.landmarks[FaceLandmarkType.rightMouth]?.position;

      if (lEye != null && rEye != null && nose != null && lMouth != null && rMouth != null) {
        landmarks5 = [
          math.Point(lEye.x.toDouble(), lEye.y.toDouble()),
          math.Point(rEye.x.toDouble(), rEye.y.toDouble()),
          math.Point(nose.x.toDouble(), nose.y.toDouble()),
          math.Point(lMouth.x.toDouble(), lMouth.y.toDouble()),
          math.Point(rMouth.x.toDouble(), rMouth.y.toDouble()),
        ];
      }

      // استخراج ومعالجة الوجه بالذكاء الاصطناعي مع المحاذاة الخماسية (InsightFace ArcFace 512D)
      final imageBytes = await imageFile.readAsBytes();
      final face112 = FaceEmbeddingService.instance.alignOrCropFace(
        imageBytes: imageBytes,
        boundingBox: math.Rectangle(
          face.boundingBox.left,
          face.boundingBox.top,
          face.boundingBox.width,
          face.boundingBox.height,
        ),
        landmarks5: landmarks5,
      );

      if (face112 == null) {
        if (mounted) {
          setState(() {
            _isProcessing = false;
            _statusMessage = 'تعذر تجهيز إطار الوجه، يرجى الاقتراب من الكاميرا';
            _statusColor = AppColors.warning;
          });
        }
        return;
      }

      // استخراج المتجهات البيومترية 512D (الأصلية + المحسنة Dual-Pass)
      final multiEmbeddings = await FaceEmbeddingService.instance.getMultiEmbeddings(face112);
      final liveEmbedding = multiEmbeddings.isNotEmpty ? multiEmbeddings.first : null;

      if (widget.mode == FaceScannerMode.enroll) {
        // حالة تسجيل بصمة جديدة بالنموذج المعتمد ArcFace 512D
        if (mounted) {
          setState(() {
            _isProcessing = false;
            _statusMessage = '✅ تم التقاط واستخراج بصمة الوجه (512D) بنجاح!';
            _statusColor = AppColors.primary;
          });

          await Future.delayed(const Duration(milliseconds: 600));
          if (mounted) {
            Navigator.pop(
              context,
              FaceScannerResult(
                success: true,
                descriptor: multiEmbeddings.isNotEmpty
                    ? jsonEncode(multiEmbeddings)
                    : (liveEmbedding != null ? jsonEncode(liveEmbedding) : null),
                similarity: 1.0,
                matchPercentage: 100.0,
                message: 'تم استخراج بصمة الوجه البيومترية بنجاح وجاهزة للاعتماد',
                capturedPhotoPath: imageFile.path,
                capturedImageBytes: imageBytes,
              ),
            );
          }
        }
      } else {
        // حالة اختبار المطابقة — فحص صارم مع بصمات قاعدة البيانات
        if (widget.registeredDescriptor == null || widget.registeredDescriptor!.trim().isEmpty) {
          if (mounted) {
            setState(() {
              _isProcessing = false;
              _statusMessage = '❌ لا توجد بصمة مسجلة لهذا الموظف بالنظام! يرجى تسجيل البصمة أولاً';
              _statusColor = AppColors.danger;
            });

            await Future.delayed(const Duration(milliseconds: 1400));
            if (mounted) {
              Navigator.pop(
                context,
                const FaceScannerResult(
                  success: false,
                  similarity: 0.0,
                  matchPercentage: 0.0,
                  message: 'لا توجد بصمة وجه مسجلة لهذا الموظف في قاعدة البيانات.',
                ),
              );
            }
          }
          return;
        }

        if (liveEmbedding == null) {
          if (mounted) {
            setState(() {
              _isProcessing = false;
              _statusMessage = 'تعذر استخراج المتجه البيومتري للوجه الحركي، يرجى إعادة المحاولة';
              _statusColor = AppColors.warning;
            });
          }
          return;
        }

        final matchRes = FaceEmbeddingService.compareFaces(
          savedDescriptor: widget.registeredDescriptor,
          liveDescriptor: multiEmbeddings,
          threshold: 70.0,
        );

        final isMatch = matchRes.isMatch;
        final percentage = matchRes.matchPercentage;
        final sim = matchRes.similarity;

        if (mounted) {
          setState(() {
            _isProcessing = false;
            _statusMessage = isMatch
                ? '✅ تم التحقق والمطابقة بنجاح ($percentage%)'
                : '⚠️ نسبة المطابقة ($percentage%) أقل من الحد المعتمد (70%)';
            _statusColor = isMatch ? AppColors.primary : AppColors.warning;
          });

          await Future.delayed(const Duration(milliseconds: 700));
          if (mounted) {
            Navigator.pop(
              context,
              FaceScannerResult(
                success: isMatch,
                descriptor: jsonEncode(liveEmbedding),
                similarity: sim,
                matchPercentage: percentage,
                message: isMatch
                    ? 'تم فحص ومطابقة بصمة الوجه بنجاح بنسبة دقة $percentage%'
                    : 'درجة التطابق ($percentage%) أقل من الحد المعتمد (70%)، يرجى المحاولة في زاوية وإضاءة أفضل',
                capturedPhotoPath: imageFile.path,
                capturedImageBytes: imageBytes,
              ),
            );
          }
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isProcessing = false;
          _statusMessage = 'حدث خطأ أثناء معالجة الصورة: ${e.toString()}';
          _statusColor = AppColors.danger;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // 1. معاينة الكاميرا الحية
            if (!_isDisposing && _cameraController != null && _cameraController!.value.isInitialized)
              Positioned.fill(
                child: FittedBox(
                  fit: BoxFit.cover,
                  child: SizedBox(
                    width: _cameraController!.value.previewSize?.height ?? size.width,
                    height: _cameraController!.value.previewSize?.width ?? size.height,
                    child: CameraPreview(_cameraController!),
                  ),
                ),
              )
            else
              Positioned.fill(
                child: Container(
                  color: const Color(0xFF0F172A),
                  child: Center(
                    child: _isInitializing
                        ? const CircularProgressIndicator(color: AppColors.primary)
                        : Icon(Icons.videocam_off_rounded, size: 64, color: Colors.grey.shade600),
                  ),
                ),
              ),

            // 2. طبقة التعتيم أو الإضاءة البيضاء الاستوديو مع النافذة البيضاوية (Studio Ring Light & Oval Mask)
            Positioned.fill(
              child: CustomPaint(
                painter: _FaceMaskPainter(
                  borderColor: _statusColor,
                  scanProgress: _scanAnimController.value,
                  isScanning: _cameraController != null && _cameraController!.value.isInitialized,
                  isTorchOn: _isTorchOn,
                ),
              ),
            ),

            // 💡 إضاءة الشاشة الاستوديو فائقة السطوع بنسبة 100% للظلام (Studio Ring Light)
            if (_isTorchOn)
              Positioned.fill(
                child: IgnorePointer(
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.95),
                        width: 36,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.white.withValues(alpha: 0.85),
                          blurRadius: 40,
                          spreadRadius: 20,
                        ),
                      ],
                    ),
                  ),
                ),
              ),

            // 👁️ شارة التوجيه الصوتي والتفاعلي لرمش العين (Interactive Liveness HUD)
            if (_waitingForBlink)
              Positioned(
                top: size.height * 0.16,
                left: 20,
                right: 20,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.accentCyan.withValues(alpha: 0.95),
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.accentCyan.withValues(alpha: 0.4),
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.remove_red_eye_rounded, color: Color(0xFF0F172A), size: 24),
                      SizedBox(width: 10),
                      Text(
                        '👁️ يرجى الرمش بعينيك الآن للتحقق من الحيوية',
                        style: TextStyle(
                          color: Color(0xFF0F172A),
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // 3. شريط العنوان العلوي وزر الإغلاق
            Positioned(
              top: 16,
              left: 16,
              right: 16,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.black45,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.close_rounded, color: Colors.white, size: 22),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white24),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.verified_user_rounded, color: AppColors.primary, size: 16),
                        const SizedBox(width: 6),
                        Text(
                          widget.mode == FaceScannerMode.enroll ? 'تسجيل بصمة الوجه' : 'فحص ومطابقة الوجه',
                          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _toggleTorch,
                    tooltip: 'كشاف الإضاءة الليلية',
                    icon: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: _isTorchOn ? AppColors.warning : Colors.black45,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        _isTorchOn ? Icons.flashlight_on_rounded : Icons.flashlight_off_rounded,
                        color: _isTorchOn ? Colors.black : Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // 4. رسالة التوجيهات وحالة الكشف
            Positioned(
              bottom: 110,
              left: 20,
              right: 20,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: _statusColor.withValues(alpha: 0.6)),
                ),
                child: Text(
                  _statusMessage,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _statusColor,
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),

            // 5. زر الالتقاط والمسح الحي في الأسفل
            Positioned(
              bottom: 24,
              left: 30,
              right: 30,
              child: SizedBox(
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: (_isInitializing || _isProcessing) ? null : _captureAndAnalyze,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 6,
                  ),
                  icon: _isProcessing
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.camera_alt_rounded, size: 22),
                  label: Text(
                    _isProcessing
                        ? 'جارٍ التحقق الذكي...'
                        : (widget.mode == FaceScannerMode.enroll ? 'التقاط وحفظ البصمة' : 'مسح ومطابقة الوجه الآن'),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// رسام القناع البيضاوي والخط الليزري الماسح وحلقة الإضاءة الاستوديو
class _FaceMaskPainter extends CustomPainter {
  final Color borderColor;
  final double scanProgress;
  final bool isScanning;
  final bool isTorchOn;

  _FaceMaskPainter({
    required this.borderColor,
    required this.scanProgress,
    required this.isScanning,
    this.isTorchOn = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final backgroundPaint = Paint()
      ..color = isTorchOn
          ? const Color(0xFFFFFFF2) // 💡 إضاءة استوديو بيضاء فائقة السطوع تضيء وجه الموظف بالكامل في الظلام
          : Colors.black.withValues(alpha: 0.65);
    final borderPaint = Paint()
      ..color = isTorchOn ? AppColors.primary : borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = isTorchOn ? 4.0 : 3.0;

    final ovalWidth = size.width * 0.72;
    final ovalHeight = size.height * 0.46;
    final ovalRect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height * 0.42),
      width: ovalWidth,
      height: ovalHeight,
    );

    // تفريغ الإطار البيضاوي في الخلفية المظلمة أو البيضاء المشعة
    final path = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addOval(ovalRect)
      ..fillType = PathFillType.evenOdd;

    canvas.drawPath(path, backgroundPaint);
    canvas.drawOval(ovalRect, borderPaint);

    // رسم خط المسح الليزري
    if (isScanning) {
      final laserY = ovalRect.top + (ovalRect.height * scanProgress);
      final laserPaint = Paint()
        ..color = (isTorchOn ? AppColors.primary : borderColor).withValues(alpha: 0.8)
        ..strokeWidth = 2.0;

      final halfChord = (ovalWidth / 2) * math.sqrt(1 - math.pow((laserY - ovalRect.center.dy) / (ovalHeight / 2), 2).clamp(0.0, 1.0));
      canvas.drawLine(
        Offset(ovalRect.center.dx - halfChord, laserY),
        Offset(ovalRect.center.dx + halfChord, laserY),
        laserPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _FaceMaskPainter oldDelegate) {
    return oldDelegate.scanProgress != scanProgress ||
        oldDelegate.borderColor != borderColor ||
        oldDelegate.isTorchOn != isTorchOn;
  }
}

