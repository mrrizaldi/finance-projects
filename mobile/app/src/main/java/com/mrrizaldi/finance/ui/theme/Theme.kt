package com.mrrizaldi.finance.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf

val LocalPalette = staticCompositionLocalOf { LightPalette }

private fun schemeOf(p: FinancePalette, dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = p.primary,
        onPrimary = p.primaryFg,
        primaryContainer = p.primarySoft,
        onPrimaryContainer = p.positive,
        inversePrimary = p.primary,
        secondary = p.info,
        onSecondary = p.primaryFg,
        secondaryContainer = p.infoSoft,
        onSecondaryContainer = p.textHi,
        tertiary = p.warn,
        onTertiary = p.primaryFg,
        tertiaryContainer = p.warnSoft,
        onTertiaryContainer = p.textHi,
        background = p.bg,
        onBackground = p.textHi,
        surface = p.surface,
        onSurface = p.textHi,
        surfaceVariant = p.surfaceHi,
        onSurfaceVariant = p.textMute,
        surfaceContainerLowest = p.surface,
        surfaceContainerLow = p.surface2,
        surfaceContainer = p.surface2,
        surfaceContainerHigh = p.surfaceHi,
        surfaceContainerHighest = p.surfaceHi,
        inverseSurface = p.textHi,
        inverseOnSurface = p.bg,
        outline = p.borderStrong,
        outlineVariant = p.border,
        error = p.negative,
        onError = p.primaryFg,
        errorContainer = p.negativeSoft,
        onErrorContainer = p.negative
    )
}

@Composable
fun FinanceTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val palette = if (dark) DarkPalette else LightPalette
    CompositionLocalProvider(LocalPalette provides palette, LocalGlass provides if (dark) DarkGlass else LightGlass) {
        MaterialTheme(
            colorScheme = schemeOf(palette, dark),
            typography = FinanceTypography,
            content = content
        )
    }
}
