import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

/// خدمة محاذاة الوجه هندسياً باستخدام التحويل التآلفي (5-Point Similarity Affine Transform)
/// متطابقة 100% مع خوارزمية faceAlignment.js في كشك الويب ومبنية على قالب ArcFace المعياري (112x112)
class FaceAlignmentService {
  FaceAlignmentService._();
  static final FaceAlignmentService instance = FaceAlignmentService._();

  static const int outputSize = 112;

  /// القالب المعياري لأبعاد معالم الوجه الخمسة على مصفوفة 112x112 (InsightFace standard template)
  static const List<math.Point<double>> arcfaceTemplate = [
    math.Point(38.2946, 51.6963), // العين اليسرى (Left Eye)
    math.Point(73.5318, 51.5014), // العين اليمنى (Right Eye)
    math.Point(56.0252, 71.7366), // طرف الأنف (Nose Tip)
    math.Point(41.5493, 92.3655), // زاوية الفم اليسرى (Left Mouth Corner)
    math.Point(70.7299, 92.2041), // زاوية الفم اليمنى (Right Mouth Corner)
  ];

  /// محاذاة وقص الوجه هندسياً من الصورة الأصلية باستخدام النقاط الخمس
  /// [srcPoints]: قائمة المعالم الخمسة [العين اليسرى، العين اليمنى، الأنف، زاوية الفم اليسرى، زاوية الفم اليمنى]
  img.Image? alignFace({
    required img.Image sourceImage,
    required List<math.Point<double>> srcPoints,
  }) {
    if (srcPoints.length != 5) return null;

    try {
      // 1. حساب المتوسط الحسابي لنقاط المصدر والهدف (Centers)
      double srcMeanX = 0.0;
      double srcMeanY = 0.0;
      double dstMeanX = 0.0;
      double dstMeanY = 0.0;

      for (int i = 0; i < 5; i++) {
        srcMeanX += srcPoints[i].x;
        srcMeanY += srcPoints[i].y;
        dstMeanX += arcfaceTemplate[i].x;
        dstMeanY += arcfaceTemplate[i].y;
      }

      srcMeanX /= 5.0;
      srcMeanY /= 5.0;
      dstMeanX /= 5.0;
      dstMeanY /= 5.0;

      // 2. إزاحة النقاط حول المركز وحساب مصفوفات التباين المشترك
      double srcVar = 0.0;
      double covXX = 0.0;
      double covXY = 0.0;
      double covYX = 0.0;
      double covYY = 0.0;

      for (int i = 0; i < 5; i++) {
        final sx = srcPoints[i].x - srcMeanX;
        final sy = srcPoints[i].y - srcMeanY;
        final dx = arcfaceTemplate[i].x - dstMeanX;
        final dy = arcfaceTemplate[i].y - dstMeanY;

        srcVar += sx * sx + sy * sy;
        covXX += sx * dx;
        covXY += sx * dy;
        covYX += sy * dx;
        covYY += sy * dy;
      }

      if (srcVar <= 1e-6) srcVar = 1e-6;

      // 3. معاملات المقياس والدوران (Scale & Rotation)
      final a = (covXX + covYY) / srcVar;
      final b = (covXY - covYX) / srcVar;

      final denom = a * a + b * b;
      if (denom <= 1e-6) return null;

      // 4. معاملات التحويل العكسي (من Target 112x112 إلى Source)
      final invA = a / denom;
      final invB = -b / denom;

      final aligned = img.Image(
        width: outputSize,
        height: outputSize,
        numChannels: 3,
      );

      final srcW = sourceImage.width;
      final srcH = sourceImage.height;

      // 5. تطبيق التحويل مع استيفاء خطي ثنائي (Bilinear Interpolation)
      for (int dstY = 0; dstY < outputSize; dstY++) {
        final dy = dstY.toDouble() - dstMeanY;
        for (int dstX = 0; dstX < outputSize; dstX++) {
          final dx = dstX.toDouble() - dstMeanX;

          final srcX = invA * dx - invB * dy + srcMeanX;
          final srcY = invB * dx + invA * dy + srcMeanY;

          if (srcX < 0 || srcX >= srcW - 1 || srcY < 0 || srcY >= srcH - 1) {
            aligned.setPixelRgb(dstX, dstY, 0, 0, 0);
            continue;
          }

          // استيفاء خطي ثنائي للألوان بدقة فائقة
          final x0 = srcX.floor();
          final y0 = srcY.floor();
          final x1 = x0 + 1;
          final y1 = y0 + 1;

          final fx = srcX - x0;
          final fy = srcY - y0;

          final p00 = sourceImage.getPixel(x0, y0);
          final p10 = sourceImage.getPixel(x1, y0);
          final p01 = sourceImage.getPixel(x0, y1);
          final p11 = sourceImage.getPixel(x1, y1);

          final r = _bilerp(p00.r, p10.r, p01.r, p11.r, fx, fy);
          final g = _bilerp(p00.g, p10.g, p01.g, p11.g, fx, fy);
          final bCol = _bilerp(p00.b, p10.b, p01.b, p11.b, fx, fy);

          aligned.setPixelRgb(dstX, dstY, r.round(), g.round(), bCol.round());
        }
      }

      return aligned;
    } catch (e) {
      debugPrint('[FaceAlignment] خطأ في محاذاة الوجه: $e');
      return null;
    }
  }

  static double _bilerp(
    num v00,
    num v10,
    num v01,
    num v11,
    double fx,
    double fy,
  ) {
    final top = v00 * (1.0 - fx) + v10 * fx;
    final bottom = v01 * (1.0 - fx) + v11 * fx;
    return top * (1.0 - fy) + bottom * fy;
  }
}
