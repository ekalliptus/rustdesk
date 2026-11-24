import 'package:flutter/material.dart';
import 'package:settings_ui/settings_ui.dart';

import '../common.dart';
import '../desktop/widgets/tabbar_widget.dart' show TabbarTheme;

/// Ekalliptus brand color tokens derived from ekalliptus-web global CSS.
class ElDeskPalette {
  ElDeskPalette._();

  // Light tokens (--background, --foreground, --card, --primary, --secondary, --accent, --muted-foreground, --border, --destructive)
  static const Color lightBackground = Color(0xFFF5F8FA);
  static const Color lightForeground = Color(0xFF163350);
  static const Color lightCard = Color(0xFFFFFFFF);
  static const Color lightPrimary = Color(0xFF1F4BC1);
  static const Color lightPrimaryForeground = Color(0xFFFFFFFF);
  static const Color lightSecondary = Color(0xFFE4EBF1);
  static const Color lightAccent = Color(0xFF147B6D);
  static const Color lightAccentForeground = Color(0xFFFFFFFF);
  static const Color lightMutedForeground = Color(0xFF536579);
  static const Color lightBorder = Color(0xFFC6D1DC);
  static const Color lightDestructive = Color(0xFFC11F1F);

  // Dark tokens
  static const Color darkBackground = Color(0xFF13202F);
  static const Color darkForeground = Color(0xFFEEF3F6);
  static const Color darkCard = Color(0xFF1E2C3E);
  static const Color darkPrimary = Color(0xFF88B2FC);
  static const Color darkPrimaryForeground = Color(0xFF13202F);
  static const Color darkSecondary = Color(0xFF2B3B4F);
  static const Color darkAccent = Color(0xFF82D4C1);
  static const Color darkAccentForeground = Color(0xFF13202F);
  static const Color darkMutedForeground = Color(0xFFB2BFCD);
  static const Color darkBorder = Color(0xFF43556B);
  static const Color darkDestructive = Color(0xFFF28B82);
}

/// Mobile theme builders derived from [ElDeskPalette] for Light and Dark modes.
class ElDeskTheme {
  ElDeskTheme._();

  static SwitchThemeData _switchTheme({
    required Color activeTrack,
    required Color activeThumb,
    required Color inactiveTrack,
    required Color inactiveThumb,
  }) {
    return SwitchThemeData(
      splashRadius: kRadialReactionRadius,
      thumbColor: MaterialStateProperty.resolveWith<Color>(
        (states) => states.contains(MaterialState.selected)
            ? activeThumb
            : inactiveThumb,
      ),
      trackColor: MaterialStateProperty.resolveWith<Color>(
        (states) => states.contains(MaterialState.selected)
            ? activeTrack
            : inactiveTrack,
      ),
    );
  }

  static CheckboxThemeData _checkboxTheme({
    required Color selectedBg,
    required Color checkColor,
    required Color borderColor,
  }) {
    return CheckboxThemeData(
      splashRadius: 0,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(5)),
      ),
      checkColor: MaterialStateProperty.all(checkColor),
      fillColor: MaterialStateProperty.resolveWith<Color>(
        (states) => states.contains(MaterialState.selected)
            ? selectedBg
            : Colors.transparent,
      ),
      side: BorderSide(color: borderColor, width: 1.5),
    );
  }

  static RadioThemeData _radioTheme({
    required Color selectedColor,
    required Color unselectedColor,
  }) {
    return RadioThemeData(
      splashRadius: kRadialReactionRadius,
      fillColor: MaterialStateProperty.resolveWith<Color>(
        (states) => states.contains(MaterialState.selected)
            ? selectedColor
            : unselectedColor,
      ),
    );
  }

  /// Light [ThemeData] for mobile targets using Ekalliptus studio palette.
  static ThemeData mobileLightTheme() {
    return MyTheme.lightTheme.copyWith(
      scaffoldBackgroundColor: ElDeskPalette.lightBackground,
      cardColor: ElDeskPalette.lightCard,
      dialogBackgroundColor: ElDeskPalette.lightCard,
      dividerColor: ElDeskPalette.lightBorder,
      hintColor: ElDeskPalette.lightMutedForeground,
      hoverColor: ElDeskPalette.lightSecondary,
      primaryColor: ElDeskPalette.lightPrimary,
      colorScheme: const ColorScheme.light(
        primary: ElDeskPalette.lightPrimary,
        onPrimary: ElDeskPalette.lightPrimaryForeground,
        secondary: ElDeskPalette.lightAccent,
        onSecondary: ElDeskPalette.lightAccentForeground,
        surface: ElDeskPalette.lightCard,
        onSurface: ElDeskPalette.lightForeground,
        background: ElDeskPalette.lightSecondary,
        onBackground: ElDeskPalette.lightForeground,
        error: ElDeskPalette.lightDestructive,
        onError: Colors.white,
        outline: ElDeskPalette.lightBorder,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: ElDeskPalette.lightPrimary,
        foregroundColor: ElDeskPalette.lightPrimaryForeground,
        elevation: 0,
        shadowColor: Colors.transparent,
        iconTheme: IconThemeData(color: ElDeskPalette.lightPrimaryForeground),
        titleTextStyle: TextStyle(
          color: ElDeskPalette.lightPrimaryForeground,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: ElDeskPalette.lightCard,
        selectedItemColor: ElDeskPalette.lightPrimary,
        unselectedItemColor: ElDeskPalette.lightMutedForeground,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      iconTheme: const IconThemeData(color: ElDeskPalette.lightForeground),
      textTheme: const TextTheme(
        titleLarge: TextStyle(fontSize: 19, color: ElDeskPalette.lightForeground),
        titleMedium:
            TextStyle(fontSize: 16, color: ElDeskPalette.lightForeground),
        titleSmall: TextStyle(fontSize: 14, color: ElDeskPalette.lightForeground),
        bodyLarge: TextStyle(
          fontSize: 15,
          color: ElDeskPalette.lightForeground,
          height: 1.35,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: ElDeskPalette.lightForeground,
          height: 1.25,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: ElDeskPalette.lightMutedForeground,
          height: 1.25,
        ),
        labelLarge: TextStyle(fontSize: 16.0, color: ElDeskPalette.lightPrimary),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: ElDeskPalette.lightPrimary,
          foregroundColor: ElDeskPalette.lightPrimaryForeground,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          backgroundColor: ElDeskPalette.lightCard,
          foregroundColor: ElDeskPalette.lightForeground,
          side: const BorderSide(color: ElDeskPalette.lightBorder),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: ElDeskPalette.lightPrimary,
          padding: const EdgeInsets.symmetric(
            horizontal: MyTheme.mobileTextButtonPaddingLR,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10.0),
          ),
        ),
      ),
      switchTheme: _switchTheme(
        activeTrack: ElDeskPalette.lightPrimary,
        activeThumb: ElDeskPalette.lightPrimaryForeground,
        inactiveTrack: ElDeskPalette.lightSecondary,
        inactiveThumb: ElDeskPalette.lightMutedForeground,
      ),
      checkboxTheme: _checkboxTheme(
        selectedBg: ElDeskPalette.lightPrimary,
        checkColor: ElDeskPalette.lightPrimaryForeground,
        borderColor: ElDeskPalette.lightMutedForeground,
      ),
      radioTheme: _radioTheme(
        selectedColor: ElDeskPalette.lightPrimary,
        unselectedColor: ElDeskPalette.lightMutedForeground,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: ElDeskPalette.lightPrimary,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: ElDeskPalette.lightPrimary,
        foregroundColor: ElDeskPalette.lightPrimaryForeground,
      ),
      extensions: <ThemeExtension<dynamic>>[
        ColorThemeExtension.light.copyWith(
          border: ElDeskPalette.lightBorder,
          border2: ElDeskPalette.lightBorder,
          highlight: ElDeskPalette.lightSecondary,
          me: ElDeskPalette.lightAccent,
          divider: ElDeskPalette.lightBorder,
        ),
        TabbarTheme.light.copyWith(
          selectedTabIconColor: ElDeskPalette.lightPrimary,
          unSelectedTabIconColor: ElDeskPalette.lightMutedForeground,
          selectedTextColor: ElDeskPalette.lightPrimary,
          unSelectedTextColor: ElDeskPalette.lightMutedForeground,
          selectedIconColor: ElDeskPalette.lightPrimary,
          unSelectedIconColor: ElDeskPalette.lightMutedForeground,
          dividerColor: ElDeskPalette.lightBorder,
        ),
      ],
    );
  }

  /// Dark [ThemeData] for mobile targets using Ekalliptus night slate palette.
  static ThemeData mobileDarkTheme() {
    return MyTheme.darkTheme.copyWith(
      scaffoldBackgroundColor: ElDeskPalette.darkBackground,
      cardColor: ElDeskPalette.darkCard,
      dialogBackgroundColor: ElDeskPalette.darkCard,
      dividerColor: ElDeskPalette.darkBorder,
      hintColor: ElDeskPalette.darkMutedForeground,
      hoverColor: ElDeskPalette.darkSecondary,
      primaryColor: ElDeskPalette.darkPrimary,
      colorScheme: const ColorScheme.dark(
        primary: ElDeskPalette.darkPrimary,
        onPrimary: ElDeskPalette.darkPrimaryForeground,
        secondary: ElDeskPalette.darkAccent,
        onSecondary: ElDeskPalette.darkAccentForeground,
        surface: ElDeskPalette.darkCard,
        onSurface: ElDeskPalette.darkForeground,
        background: ElDeskPalette.darkSecondary,
        onBackground: ElDeskPalette.darkForeground,
        error: ElDeskPalette.darkDestructive,
        onError: ElDeskPalette.darkBackground,
        outline: ElDeskPalette.darkBorder,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: ElDeskPalette.darkCard,
        foregroundColor: ElDeskPalette.darkForeground,
        elevation: 0,
        shadowColor: Colors.transparent,
        iconTheme: IconThemeData(color: ElDeskPalette.darkForeground),
        titleTextStyle: TextStyle(
          color: ElDeskPalette.darkForeground,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: ElDeskPalette.darkCard,
        selectedItemColor: ElDeskPalette.darkPrimary,
        unselectedItemColor: ElDeskPalette.darkMutedForeground,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      iconTheme: const IconThemeData(color: ElDeskPalette.darkForeground),
      textTheme: const TextTheme(
        titleLarge: TextStyle(fontSize: 19, color: ElDeskPalette.darkForeground),
        titleMedium:
            TextStyle(fontSize: 16, color: ElDeskPalette.darkForeground),
        titleSmall: TextStyle(fontSize: 14, color: ElDeskPalette.darkForeground),
        bodyLarge: TextStyle(
          fontSize: 15,
          color: ElDeskPalette.darkForeground,
          height: 1.35,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: ElDeskPalette.darkForeground,
          height: 1.25,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: ElDeskPalette.darkMutedForeground,
          height: 1.25,
        ),
        labelLarge: TextStyle(
          fontSize: 16.0,
          fontWeight: FontWeight.bold,
          color: ElDeskPalette.darkPrimary,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: ElDeskPalette.darkPrimary,
          foregroundColor: ElDeskPalette.darkPrimaryForeground,
          disabledForegroundColor: ElDeskPalette.darkMutedForeground,
          disabledBackgroundColor: ElDeskPalette.darkSecondary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          backgroundColor: ElDeskPalette.darkCard,
          foregroundColor: ElDeskPalette.darkForeground,
          side: const BorderSide(color: ElDeskPalette.darkBorder),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: ElDeskPalette.darkPrimary,
          padding: const EdgeInsets.symmetric(
            horizontal: MyTheme.mobileTextButtonPaddingLR,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10.0),
          ),
        ),
      ),
      switchTheme: _switchTheme(
        activeTrack: ElDeskPalette.darkPrimary,
        activeThumb: ElDeskPalette.darkPrimaryForeground,
        inactiveTrack: ElDeskPalette.darkSecondary,
        inactiveThumb: ElDeskPalette.darkMutedForeground,
      ),
      checkboxTheme: _checkboxTheme(
        selectedBg: ElDeskPalette.darkPrimary,
        checkColor: ElDeskPalette.darkPrimaryForeground,
        borderColor: ElDeskPalette.darkMutedForeground,
      ),
      radioTheme: _radioTheme(
        selectedColor: ElDeskPalette.darkPrimary,
        unselectedColor: ElDeskPalette.darkMutedForeground,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: ElDeskPalette.darkPrimary,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: ElDeskPalette.darkPrimary,
        foregroundColor: ElDeskPalette.darkPrimaryForeground,
      ),
      extensions: <ThemeExtension<dynamic>>[
        ColorThemeExtension.dark.copyWith(
          border: ElDeskPalette.darkBorder,
          border2: ElDeskPalette.darkMutedForeground,
          highlight: ElDeskPalette.darkSecondary,
          me: ElDeskPalette.darkAccent,
          divider: ElDeskPalette.darkBorder,
        ),
        TabbarTheme.dark.copyWith(
          selectedTabIconColor: ElDeskPalette.darkPrimary,
          unSelectedTabIconColor: ElDeskPalette.darkMutedForeground,
          selectedTextColor: ElDeskPalette.darkPrimary,
          unSelectedTextColor: ElDeskPalette.darkMutedForeground,
          selectedIconColor: ElDeskPalette.darkPrimary,
          unSelectedIconColor: ElDeskPalette.darkMutedForeground,
          dividerColor: ElDeskPalette.darkBorder,
        ),
      ],
    );
  }

  /// Light settings surface & typography theme for `SettingsList`.
  static SettingsThemeData mobileSettingsLightTheme() {
    return const SettingsThemeData(
      settingsListBackground: ElDeskPalette.lightBackground,
      settingsSectionBackground: ElDeskPalette.lightCard,
      titleTextColor: ElDeskPalette.lightPrimary,
      settingsTileTextColor: ElDeskPalette.lightForeground,
      tileDescriptionTextColor: ElDeskPalette.lightMutedForeground,
      trailingTextColor: ElDeskPalette.lightMutedForeground,
      leadingIconsColor: ElDeskPalette.lightPrimary,
      dividerColor: ElDeskPalette.lightBorder,
      tileHighlightColor: ElDeskPalette.lightSecondary,
      inactiveTitleColor: ElDeskPalette.lightMutedForeground,
      inactiveSubtitleColor: ElDeskPalette.lightMutedForeground,
    );
  }

  /// Dark settings surface & typography theme for `SettingsList`.
  static SettingsThemeData mobileSettingsDarkTheme() {
    return const SettingsThemeData(
      settingsListBackground: ElDeskPalette.darkBackground,
      settingsSectionBackground: ElDeskPalette.darkCard,
      titleTextColor: ElDeskPalette.darkPrimary,
      settingsTileTextColor: ElDeskPalette.darkForeground,
      tileDescriptionTextColor: ElDeskPalette.darkMutedForeground,
      trailingTextColor: ElDeskPalette.darkMutedForeground,
      leadingIconsColor: ElDeskPalette.darkPrimary,
      dividerColor: ElDeskPalette.darkBorder,
      tileHighlightColor: ElDeskPalette.darkSecondary,
      inactiveTitleColor: ElDeskPalette.darkMutedForeground,
      inactiveSubtitleColor: ElDeskPalette.darkMutedForeground,
    );
  }
}
