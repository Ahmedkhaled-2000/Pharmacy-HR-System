import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/core/services/face_embedding_service.dart';

void main() {
  group('Screen Brightness & Adaptive Gamma Enhancer Tests', () {
    test('calculateGammaCorrection correctly applies adaptive gamma curves based on luminance', () {
      // Extremely dark (e.g. luminance 20) -> gamma ~ 0.42
      expect(FaceEmbeddingService.calculateGammaCorrection(20), closeTo(0.42, 0.05));

      // Dim lighting (e.g. luminance 65) -> gamma ~ 0.55
      expect(FaceEmbeddingService.calculateGammaCorrection(65), closeTo(0.55, 0.05));

      // Moderate dim (e.g. luminance 85) -> gamma ~ 0.72
      expect(FaceEmbeddingService.calculateGammaCorrection(85), closeTo(0.72, 0.05));

      // Good lighting (e.g. luminance 140) -> gamma 1.0 (no distortion)
      expect(FaceEmbeddingService.calculateGammaCorrection(140), equals(1.0));
    });
  });
}
