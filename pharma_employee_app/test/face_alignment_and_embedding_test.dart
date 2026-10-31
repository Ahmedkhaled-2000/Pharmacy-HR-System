import 'dart:math' as math;
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:pharma_employee_app/core/services/face_alignment_service.dart';
import 'package:pharma_employee_app/core/services/face_embedding_service.dart';

void main() {
  group('Face Alignment & Embedding Tests (Web Parity)', () {
    test('FaceAlignmentService aligns 5 landmarks to 112x112 canonical template', () {
      final dummyImg = img.Image(width: 400, height: 400, numChannels: 3);
      // Fill with some pattern
      for (int y = 0; y < 400; y++) {
        for (int x = 0; x < 400; x++) {
          dummyImg.setPixelRgb(x, y, x % 255, y % 255, (x + y) % 255);
        }
      }

      // Landmarks roughly in the center
      final landmarks = [
        const math.Point(160.0, 180.0), // Left Eye
        const math.Point(240.0, 180.0), // Right Eye
        const math.Point(200.0, 220.0), // Nose
        const math.Point(170.0, 270.0), // Left Mouth
        const math.Point(230.0, 270.0), // Right Mouth
      ];

      final aligned = FaceAlignmentService.instance.alignFace(
        sourceImage: dummyImg,
        srcPoints: landmarks,
      );

      expect(aligned, isNotNull);
      expect(aligned!.width, equals(112));
      expect(aligned.height, equals(112));
    });

    test('FaceEmbeddingService compareFaces calculates accurate percentage for 512D vectors', () {
      final vecA = List.generate(512, (i) => 0.05);
      final vecSimilar = List.generate(512, (i) => 0.048);

      final res = FaceEmbeddingService.compareFaces(
        savedDescriptor: vecA,
        liveDescriptor: vecSimilar,
        threshold: 70.0,
      );

      expect(res.isMatch, isTrue);
      expect(res.matchPercentage, greaterThanOrEqualTo(70.0));
    });

    test('FaceEmbeddingService parseDescriptors supports multi-descriptor arrays (Web Parity)', () {
      final vec1 = List.generate(512, (i) => 0.05);
      final vec2 = List.generate(512, (i) => -0.05);

      final parsed = FaceEmbeddingService.parseDescriptors([vec1, vec2]);
      expect(parsed.length, equals(2));
      expect(parsed[0].length, equals(512));
      expect(parsed[1].length, equals(512));
    });
  });
}
