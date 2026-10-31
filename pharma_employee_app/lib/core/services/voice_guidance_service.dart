import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// 🎙️ خدمة التوجيه الصوتي التفاعلي باللغة العربية لبصمة الوجه والكشك
class VoiceGuidanceService {
  VoiceGuidanceService._();
  static final VoiceGuidanceService instance = VoiceGuidanceService._();

  FlutterTts? _tts;
  bool _initialized = false;
  bool _isSpeaking = false;

  Future<void> _init() async {
    if (_initialized) return;
    try {
      _tts = FlutterTts();
      await _tts!.setLanguage('ar');
      await _tts!.setSpeechRate(0.48);
      await _tts!.setVolume(1.0);
      await _tts!.setPitch(1.0);

      _tts!.setCompletionHandler(() {
        _isSpeaking = false;
      });
      _tts!.setErrorHandler((_) {
        _isSpeaking = false;
      });

      _initialized = true;
    } catch (e) {
      debugPrint('VoiceGuidanceService init error: $e');
    }
  }

  /// نطق توجيه صوتي باللغة العربية
  Future<void> speak(String text) async {
    try {
      SystemSound.play(SystemSoundType.click);
      HapticFeedback.lightImpact();

      await _init();
      if (_tts != null) {
        if (_isSpeaking) {
          await _tts!.stop();
        }
        _isSpeaking = true;
        await _tts!.speak(text);
      }
    } catch (e) {
      debugPrint('VoiceGuidanceService speak error: $e');
    }
  }

  /// إيقاف الصوت فوراً
  Future<void> stop() async {
    try {
      if (_tts != null && _isSpeaking) {
        await _tts!.stop();
        _isSpeaking = false;
      }
    } catch (_) {}
  }
}
