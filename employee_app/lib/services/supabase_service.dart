import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static const String supabaseUrl = 'https://jjosopujlxgkhrragumj.supabase.co';
  static const String supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqb3NvcHVqbHhna2hycmFndW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MzA2NjQsImV4cCI6MjEwMDIwNjY2NH0.m91fh2xgaU72oEfNacFF2BICNuGuvEg3t_sHc2U8n9M';

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;

  static Future<Map<String, dynamic>> fetchAppSettings() async {
    try {
      final response = await client
          .from('app_settings')
          .select('value')
          .eq('key', 'pharmacy-tracker-data')
          .maybeSingle();
      
      if (response != null && response['value'] != null) {
        if (response['value'] is String) {
          return jsonDecode(response['value']);
        }
        return Map<String, dynamic>.from(response['value']);
      }
    } catch (e) {
      print('Error fetching app settings: \$e');
    }
    return {};
  }

  static Future<void> updateAppSettings(Map<String, dynamic> data) async {
    try {
      await client.from('app_settings').upsert({
        'key': 'pharmacy-tracker-data',
        'value': data,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      });
    } catch (e) {
      print('Error updating app settings: \$e');
    }
  }
}
