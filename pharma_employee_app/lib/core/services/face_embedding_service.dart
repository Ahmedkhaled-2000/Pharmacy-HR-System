import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:onnxruntime/onnxruntime.dart';

/// متتبع ومحلل حيوية الوجه ورمش العين الطبيعي (Blink Liveness Tracker)
class BlinkTracker {
  bool _sawOpenFirst = false;
  bool _sawClosed = false;
  bool _isBlinkVerified = false;
  DateTime? _closedTime;

  bool get isBlinkVerified => _isBlinkVerified;
  bool get sawClosed => _sawClosed;

  void reset() {
    _sawOpenFirst = false;
    _sawClosed = false;
    _isBlinkVerified = false;
    _closedTime = null;
  }

  /// تغذية احتمالية فتح العينين (من 0.0 مغمض إلى 1.0 مفتوح)
  bool feedEyeOpen(double avgEyeOpen) {
    if (_isBlinkVerified) return true;

    final now = DateTime.now();

    if (!_sawOpenFirst) {
      if (avgEyeOpen >= 0.45) {
        _sawOpenFirst = true;
      }
      return false;
    }

    if (_sawOpenFirst && !_sawClosed) {
      if (avgEyeOpen <= 0.22) {
        _sawClosed = true;
        _closedTime = now;
      }
      return false;
    }

    if (_sawOpenFirst && _sawClosed) {
      if (_closedTime != null && now.difference(_closedTime!).inMilliseconds > 2500) {
        reset();
        return false;
      }

      if (avgEyeOpen >= 0.45) {
        _isBlinkVerified = true;
        return true;
      }
    }

    return false;
  }
}

/// نتيجة مقارنة بصمة الوجه البيومترية
class FaceMatchResult {
  final bool isMatch;
  final double matchPercentage;
  final double similarity;
  final double distance;
  final bool isLegacy;
  final String? error;

  const FaceMatchResult({
    required this.isMatch,
    required this.matchPercentage,
    required this.similarity,
    required this.distance,
    this.isLegacy = false,
    this.error,
  });

  factory FaceMatchResult.noMatch([String? error]) {
    return FaceMatchResult(
      isMatch: false,
      matchPercentage: 0.0,
      similarity: 0.0,
      distance: 1.0,
      error: error,
    );
  }
}

/// محرك استخراج ومطابقة بصمات الوجوه عبر الذكاء الاصطناعي (ArcFace 512D)
/// متطابق بنسبة 100% مع نموذج الويب InsightFace MobileFaceNet (w600k_mbf.onnx)
class FaceEmbeddingService {
  FaceEmbeddingService._();
  static final FaceEmbeddingService instance = FaceEmbeddingService._();

  static const String modelAssetPath = 'assets/models/w600k_mbf.onnx';
  static const int inputSize = 112;
  static const int embeddingDimension = 512;
  static const double matchThreshold = 70.0;

  /// حساب معامل تصحيح Gamma التكيفي للإضاءة المنخفضة (نفس خوارزمية الويب lowLightEnhancer)
  static double calculateGammaCorrection(double luminance) {
    if (luminance >= 110) return 1.0;
    if (luminance < 40) return 0.42;
    if (luminance < 75) return 0.55;
    return 0.72;
  }

  bool _isInitialized = false;
  bool _isInitFailed = false;
  String? _initError;
  OrtSession? _session;

  bool get isReady => _isInitialized && _session != null;
  String? get initError => _initError;

  /// تهيئة المحرك وتحميل النموذج من أصول التطبيق
  Future<bool> initialize() async {
    if (_isInitialized && _session != null) return true;
    if (_isInitFailed) return false;

    try {
      debugPrint('⚡ [FaceAI] جاري تحميل نموذج ArcFace 512D (w600k_mbf.onnx)...');

      // 1. تهيئة بيئة ONNX Runtime
      try {
        OrtEnv.instance.init(level: OrtLoggingLevel.warning);
      } catch (e) {
        debugPrint('[FaceAI] OrtEnv init notice: $e');
      }

      // 2. تحميل ملف النموذج من الـ Assets
      final byteData = await rootBundle.load(modelAssetPath);
      final modelBytes = byteData.buffer.asUint8List(
        byteData.offsetInBytes,
        byteData.lengthInBytes,
      );

      final sessionOptions = OrtSessionOptions();
      _session = OrtSession.fromBuffer(modelBytes, sessionOptions);

      _isInitialized = true;
      _isInitFailed = false;
      debugPrint('✅ [FaceAI] تم تحميل محرك ArcFace 512D بنجاح وجاهز للاستنتاج.');
      return true;
    } catch (e, stack) {
      _isInitFailed = true;
      _initError = e.toString();
      debugPrint('❌ [FaceAI] خطأ في تحميل نموذج الوجه: $e\n$stack');
      return false;
    }
  }

  /// قص الوجه وتجهيزه بأبعاد 112x112 مع هامش آمن
  img.Image? cropAndResizeFace({
    required Uint8List imageBytes,
    required math.Rectangle<num> boundingBox,
    double marginFactor = 0.15,
  }) {
    try {
      final original = img.decodeImage(imageBytes);
      if (original == null) return null;

      // حساب أبعاد الصندوق مع الهامش
      final marginX = (boundingBox.width * marginFactor).round();
      final marginY = (boundingBox.height * marginFactor).round();

      final left = math.max(0, (boundingBox.left - marginX).round());
      final top = math.max(0, (boundingBox.top - marginY).round());
      final right = math.min(original.width, (boundingBox.left + boundingBox.width + marginX).round());
      final bottom = math.min(original.height, (boundingBox.top + boundingBox.height + marginY).round());

      final width = right - left;
      final height = bottom - top;

      if (width <= 0 || height <= 0) return null;

      final cropped = img.copyCrop(
        original,
        x: left,
        y: top,
        width: width,
        height: height,
      );

      return img.copyResize(
        cropped,
        width: inputSize,
        height: inputSize,
        interpolation: img.Interpolation.linear,
      );
    } catch (e) {
      debugPrint('[FaceAI] خطأ في قص وتجهيز الوجه: $e');
      return null;
    }
  }

  /// تحويل الصورة المعالجة إلى مصفوفة BGR Planar بتطبيع [-1.0, 1.0]
  /// متطابقة 100% مع معالجة faceApiHelper.js:
  /// floatArray[i] = (b - 127.5) / 127.5
  /// floatArray[planeSize + i] = (g - 127.5) / 127.5
  /// floatArray[2 * planeSize + i] = (r - 127.5) / 127.5
  Float32List preprocessFaceImageToBgrPlanar(img.Image face112) {
    const planeSize = inputSize * inputSize;
    final tensorData = Float32List(3 * planeSize);

    for (int y = 0; y < inputSize; y++) {
      for (int x = 0; x < inputSize; x++) {
        final pixel = face112.getPixel(x, y);
        final r = pixel.r.toDouble();
        final g = pixel.g.toDouble();
        final b = pixel.b.toDouble();
        final idx = y * inputSize + x;

        // BGR Planar
        tensorData[idx] = (b - 127.5) / 127.5; // Plane 0: B
        tensorData[planeSize + idx] = (g - 127.5) / 127.5; // Plane 1: G
        tensorData[2 * planeSize + idx] = (r - 127.5) / 127.5; // Plane 2: R
      }
    }

    return tensorData;
  }

  /// استخراج بصمة الوجه 512D Vector من الصورة المقصوصة
  Future<List<double>?> getEmbeddingFromFaceImage(img.Image face112) async {
    if (!await initialize() || _session == null) return null;

    OrtValueTensor? inputTensor;
    OrtRunOptions? runOptions;

    try {
      final inputData = preprocessFaceImageToBgrPlanar(face112);
      inputTensor = OrtValueTensor.createTensorWithDataList(
        inputData,
        [1, 3, inputSize, inputSize],
      );

      runOptions = OrtRunOptions();
      final inputName = _session!.inputNames.isNotEmpty ? _session!.inputNames[0] : 'data';
      final inputs = {inputName: inputTensor};

      final outputs = _session!.run(runOptions, inputs);
      if (outputs.isEmpty || outputs[0] == null) return null;

      final outputVal = outputs[0]!.value;
      List<double> rawDoubles = [];

      if (outputVal is List) {
        if (outputVal.isNotEmpty && outputVal[0] is List) {
          rawDoubles = (outputVal[0] as List).map((e) => (e as num).toDouble()).toList();
        } else {
          rawDoubles = outputVal.map((e) => (e as num).toDouble()).toList();
        }
      }

      outputs[0]!.release();

      if (rawDoubles.isEmpty) return null;

      // 4. تطبيع L2 Norm تماماً كما في الويب: desc[i] = outputData[i] / norm
      double sumSq = 0.0;
      for (final val in rawDoubles) {
        sumSq += val * val;
      }
      final norm = math.sqrt(sumSq);
      if (norm < 1e-6) return null;

      final normalizedEmbedding = rawDoubles.map((v) => double.parse((v / norm).toStringAsFixed(6))).toList();
      return normalizedEmbedding;
    } catch (e) {
      debugPrint('[FaceAI] خطأ أثناء استنتاج بصمة الوجه: $e');
      return null;
    } finally {
      inputTensor?.release();
      runOptions?.release();
    }
  }

  /// حساب تشابه جيب التمام (Cosine Similarity) بين متجهين
  static double calculateCosineSimilarity(List<double> v1, List<double> v2) {
    if (v1.isEmpty || v2.isEmpty) return 0.0;
    if (v1.length != v2.length) {
      debugPrint('[FaceAI] تباين أبعاد المتجهين: ${v1.length} vs ${v2.length}');
      return 0.0;
    }

    double dotProduct = 0.0;
    double norm1 = 0.0;
    double norm2 = 0.0;

    for (int i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }

    final denom = math.sqrt(norm1) * math.sqrt(norm2);
    if (denom == 0.0) return 0.0;

    return dotProduct / denom;
  }

  /// تحليل وفك بصمة الوجه المخزنة بقاعدة البيانات إلى مصفوفة متجهات 512D
  static List<List<double>> parseDescriptors(dynamic raw) {
    if (raw == null) return [];

    try {
      dynamic data = raw;
      if (data is String) {
        final trimmed = data.trim();
        if (trimmed.isEmpty) return [];
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          data = jsonDecode(trimmed);
        } else {
          return [];
        }
      }

      if (data is Map && data['descriptor'] != null) {
        data = data['descriptor'];
      }

      if (data is List) {
        if (data.isEmpty) return [];

        // حالة مصفوفة من المتجهات: [[0.1, ...], [0.2, ...]]
        if (data[0] is List) {
          final result = <List<double>>[];
          for (final item in data) {
            if (item is List) {
              final vec = item.map((e) => (e as num).toDouble()).toList();
              if (vec.length == embeddingDimension) {
                result.add(vec);
              }
            }
          }
          return result;
        }

        // حالة متجه مفرد: [0.1, 0.2, ...]
        if (data[0] is num) {
          final vec = data.map((e) => (e as num).toDouble()).toList();
          if (vec.length == embeddingDimension) {
            return [vec];
          }
        }
      }
    } catch (e) {
      debugPrint('[FaceAI] خطأ في تحليل البصمة: $e');
    }

    return [];
  }

  /// مطابقة بصمة الوجه الحية مع البصمة المسجلة بقاعدة البيانات
  /// متطابقة 100% مع دالة compareFaces في faceApiHelper.js
  static FaceMatchResult compareFaces({
    required dynamic savedDescriptor,
    required dynamic liveDescriptor,
    double threshold = matchThreshold,
  }) {
    if (savedDescriptor == null || liveDescriptor == null) {
      return FaceMatchResult.noMatch('بيانات البصمة غير متوفرة');
    }

    final savedList = parseDescriptors(savedDescriptor);
    final liveList = parseDescriptors(liveDescriptor);

    if (savedList.isEmpty) {
      return FaceMatchResult.noMatch('لا توجد بصمات حديثة مسجلة في قاعدة البيانات (ArcFace 512D)');
    }
    if (liveList.isEmpty) {
      return FaceMatchResult.noMatch('تعذر استخراج بصمة حية صالحة من الكاميرا');
    }

    double bestSimilarity = -1.0;

    for (final sDesc in savedList) {
      for (final lDesc in liveList) {
        final sim = calculateCosineSimilarity(sDesc, lDesc);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
        }
      }
    }

    if (bestSimilarity <= -1.0) {
      return FaceMatchResult.noMatch('تعذر إجراء المطابقة البيومترية');
    }

    // تحويل تشابه جيب التمام لموديل ArcFace إلى نسبة مئوية دقيقة وموزونة:
    // في ArcFace 512D:
    // التشابه <= 0.20 = شخص مختلف تماماً (0%)
    // التشابه بين 0.20 و 0.50 = شبه ضعيف (10% إلى 60%)
    // التشابه >= 0.50 = تطابق مؤكد (60% إلى 100%)
    double matchPercentage = 0.0;
    if (bestSimilarity <= 0.20) {
      matchPercentage = math.max(0.0, (bestSimilarity * 50.0).roundToDouble());
    } else if (bestSimilarity < 0.50) {
      matchPercentage = (10.0 + ((bestSimilarity - 0.20) / 0.30) * 50.0).roundToDouble();
    } else {
      matchPercentage = math.min(100.0, (60.0 + ((bestSimilarity - 0.50) / 0.30) * 40.0).roundToDouble());
    }

    final isMatch = matchPercentage >= threshold;

    return FaceMatchResult(
      isMatch: isMatch,
      matchPercentage: matchPercentage,
      similarity: double.parse(bestSimilarity.toStringAsFixed(4)),
      distance: double.parse((1.0 - bestSimilarity).toStringAsFixed(4)),
    );
  }

  void dispose() {
    _session?.release();
    _session = null;
    _isInitialized = false;
  }
}
