import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/app_colors.dart';

enum OrgBrandIcon {
  pharmaCross,
  capsulePulse,
  shieldCaduceus,
  customEnterprise;

  String get labelAr {
    switch (this) {
      case OrgBrandIcon.pharmaCross:
        return 'الصليب الصيدلاني الطبي 🏥';
      case OrgBrandIcon.capsulePulse:
        return 'كبسولة الدواء والنبض 💊';
      case OrgBrandIcon.shieldCaduceus:
        return 'الدرع الطبي المعتمد 🛡️';
      case OrgBrandIcon.customEnterprise:
        return 'شعار المؤسسة الرسمي 🏢';
    }
  }

  IconData get iconData {
    switch (this) {
      case OrgBrandIcon.pharmaCross:
        return Icons.local_pharmacy_rounded;
      case OrgBrandIcon.capsulePulse:
        return Icons.medication_rounded;
      case OrgBrandIcon.shieldCaduceus:
        return Icons.health_and_safety_rounded;
      case OrgBrandIcon.customEnterprise:
        return Icons.business_rounded;
    }
  }
}

class AppThemeSettings {
  final ThemeMode themeMode;
  final Color primaryColor;
  final OrgBrandIcon brandIcon;
  final bool isBiometricsEnabled;
  final bool isPrivacyMode;
  final String organizationName;

  const AppThemeSettings({
    this.themeMode = ThemeMode.light,
    this.primaryColor = AppColors.primary,
    this.brandIcon = OrgBrandIcon.capsulePulse,
    this.isBiometricsEnabled = true,
    this.isPrivacyMode = false,
    this.organizationName = 'مجموعة صيدليات النخبة',
  });

  AppThemeSettings copyWith({
    ThemeMode? themeMode,
    Color? primaryColor,
    OrgBrandIcon? brandIcon,
    bool? isBiometricsEnabled,
    bool? isPrivacyMode,
    String? organizationName,
  }) {
    return AppThemeSettings(
      themeMode: themeMode ?? this.themeMode,
      primaryColor: primaryColor ?? this.primaryColor,
      brandIcon: brandIcon ?? this.brandIcon,
      isBiometricsEnabled: isBiometricsEnabled ?? this.isBiometricsEnabled,
      isPrivacyMode: isPrivacyMode ?? this.isPrivacyMode,
      organizationName: organizationName ?? this.organizationName,
    );
  }
}

class AppThemeNotifier extends Notifier<AppThemeSettings> {
  @override
  AppThemeSettings build() => const AppThemeSettings();

  void toggleThemeMode(ThemeMode mode) {
    state = state.copyWith(themeMode: mode);
  }

  void setPrimaryColor(Color color) {
    state = state.copyWith(primaryColor: color);
  }

  void setBrandIcon(OrgBrandIcon icon) {
    state = state.copyWith(brandIcon: icon);
  }

  void toggleBiometrics(bool enabled) {
    state = state.copyWith(isBiometricsEnabled: enabled);
  }

  void togglePrivacyMode(bool enabled) {
    state = state.copyWith(isPrivacyMode: enabled);
  }

  void setOrganizationName(String name) {
    state = state.copyWith(organizationName: name);
  }
}

final themeSettingsProvider = NotifierProvider<AppThemeNotifier, AppThemeSettings>(AppThemeNotifier.new);
