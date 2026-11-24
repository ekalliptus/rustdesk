import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_hbb/common.dart';
import 'package:flutter_hbb/common/eldesk_theme.dart';
import 'package:flutter_hbb/desktop/widgets/tabbar_widget.dart' show TabbarTheme;

double _linearize(int channel) {
  final c = channel / 255.0;
  return c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
}

double _relativeLuminance(Color color) {
  return 0.2126 * _linearize(color.red) +
      0.7152 * _linearize(color.green) +
      0.0722 * _linearize(color.blue);
}

double _contrastRatio(Color a, Color b) {
  final la = _relativeLuminance(a);
  final lb = _relativeLuminance(b);
  final lighter = math.max(la, lb);
  final darker = math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('ElDesk light theme matches ekalliptus-web studio palette', () {
    final theme = ElDeskTheme.mobileLightTheme();
    expect(theme.brightness, Brightness.light);
    expect(theme.scaffoldBackgroundColor, ElDeskPalette.lightBackground);
    expect(theme.cardColor, ElDeskPalette.lightCard);
    expect(theme.colorScheme.primary, ElDeskPalette.lightPrimary);
    expect(theme.colorScheme.onPrimary, ElDeskPalette.lightPrimaryForeground);
    expect(theme.colorScheme.secondary, ElDeskPalette.lightAccent);
    expect(theme.appBarTheme.backgroundColor, ElDeskPalette.lightPrimary);
    expect(theme.appBarTheme.foregroundColor, ElDeskPalette.lightPrimaryForeground);
    expect(
      theme.bottomNavigationBarTheme.selectedItemColor,
      ElDeskPalette.lightPrimary,
    );
    expect(
      theme.bottomNavigationBarTheme.unselectedItemColor,
      ElDeskPalette.lightMutedForeground,
    );
    expect(
      theme.extension<ColorThemeExtension>()?.me,
      ElDeskPalette.lightAccent,
    );
    expect(
      theme.extension<TabbarTheme>()?.selectedTextColor,
      ElDeskPalette.lightPrimary,
    );
  });

  test('ElDesk dark theme matches ekalliptus-web night slate palette', () {
    final theme = ElDeskTheme.mobileDarkTheme();
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, ElDeskPalette.darkBackground);
    expect(theme.cardColor, ElDeskPalette.darkCard);
    expect(theme.colorScheme.primary, ElDeskPalette.darkPrimary);
    expect(theme.colorScheme.onPrimary, ElDeskPalette.darkPrimaryForeground);
    expect(theme.colorScheme.secondary, ElDeskPalette.darkAccent);
    expect(theme.appBarTheme.backgroundColor, ElDeskPalette.darkCard);
    expect(theme.appBarTheme.foregroundColor, ElDeskPalette.darkForeground);
    expect(
      theme.bottomNavigationBarTheme.selectedItemColor,
      ElDeskPalette.darkPrimary,
    );
    expect(
      theme.bottomNavigationBarTheme.unselectedItemColor,
      ElDeskPalette.darkMutedForeground,
    );
    expect(
      theme.extension<ColorThemeExtension>()?.me,
      ElDeskPalette.darkAccent,
    );
    expect(
      theme.extension<TabbarTheme>()?.selectedTextColor,
      ElDeskPalette.darkPrimary,
    );
  });

  test('Settings themes preserve ekalliptus surface and ink tokens', () {
    final light = ElDeskTheme.mobileSettingsLightTheme();
    expect(light.settingsListBackground, ElDeskPalette.lightBackground);
    expect(light.settingsSectionBackground, ElDeskPalette.lightCard);
    expect(light.titleTextColor, ElDeskPalette.lightPrimary);
    expect(light.settingsTileTextColor, ElDeskPalette.lightForeground);

    final dark = ElDeskTheme.mobileSettingsDarkTheme();
    expect(dark.settingsListBackground, ElDeskPalette.darkBackground);
    expect(dark.settingsSectionBackground, ElDeskPalette.darkCard);
    expect(dark.titleTextColor, ElDeskPalette.darkPrimary);
    expect(dark.settingsTileTextColor, ElDeskPalette.darkForeground);
  });

  test('Ekalliptus light and dark palettes meet WCAG AA 4.5:1 text contrast', () {
    final lightPairs = <(Color, Color)>[
      (ElDeskPalette.lightForeground, ElDeskPalette.lightBackground),
      (ElDeskPalette.lightForeground, ElDeskPalette.lightCard),
      (ElDeskPalette.lightMutedForeground, ElDeskPalette.lightBackground),
      (ElDeskPalette.lightMutedForeground, ElDeskPalette.lightCard),
      (ElDeskPalette.lightPrimaryForeground, ElDeskPalette.lightPrimary),
      (ElDeskPalette.lightPrimary, ElDeskPalette.lightCard),
      (ElDeskPalette.lightAccentForeground, ElDeskPalette.lightAccent),
    ];
    for (final pair in lightPairs) {
      expect(_contrastRatio(pair.$1, pair.$2), greaterThanOrEqualTo(4.5));
    }

    final darkPairs = <(Color, Color)>[
      (ElDeskPalette.darkForeground, ElDeskPalette.darkBackground),
      (ElDeskPalette.darkForeground, ElDeskPalette.darkCard),
      (ElDeskPalette.darkMutedForeground, ElDeskPalette.darkBackground),
      (ElDeskPalette.darkMutedForeground, ElDeskPalette.darkCard),
      (ElDeskPalette.darkPrimaryForeground, ElDeskPalette.darkPrimary),
      (ElDeskPalette.darkPrimary, ElDeskPalette.darkCard),
      (ElDeskPalette.darkAccentForeground, ElDeskPalette.darkAccent),
    ];
    for (final pair in darkPairs) {
      expect(_contrastRatio(pair.$1, pair.$2), greaterThanOrEqualTo(4.5));
    }
  });
}
