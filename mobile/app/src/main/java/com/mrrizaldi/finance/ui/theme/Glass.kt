package com.mrrizaldi.finance.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState

data class AuroraBlob(val color: Color, val radius: Dp, val center: Offset)

data class GlassTokens(
    val aurora: List<AuroraBlob>,
    val tint: Color,
    val edge: Color,
    val divider: Color,
    val navPill: Color,
    val navIcon: Color,
    val fabTop: Color,
    val fabBottom: Color,
    val fabIcon: Color,
    val fabShadow: Color,
    val buttonTop: Color,
    val buttonBottom: Color,
    val buttonText: Color
)

val GlassBlur = 20.dp

val CardShape = RoundedCornerShape(20.dp)

val LightGlass = GlassTokens(
    aurora = listOf(
        AuroraBlob(Color(0xFF37D16C).copy(alpha = 0.40f), 170.dp, Offset(0.12f, 0.06f)),
        AuroraBlob(Color(0xFF7DE3C0).copy(alpha = 0.34f), 190.dp, Offset(1.00f, 0.14f)),
        AuroraBlob(Color(0xFF9CC7FF).copy(alpha = 0.26f), 220.dp, Offset(0.55f, 0.34f))
    ),
    tint = Color.White.copy(alpha = 0.66f),
    edge = Color.White.copy(alpha = 0.90f),
    divider = Color(0xFF7F7F7F).copy(alpha = 0.22f),
    navPill = Color(0xFF008831).copy(alpha = 0.13f),
    navIcon = Color(0xFF006E28),
    fabTop = Color(0xFF37D16C),
    fabBottom = Color(0xFF008831),
    fabIcon = Color.White,
    fabShadow = Color(0xFF008831).copy(alpha = 0.38f),
    buttonTop = Color(0xFF008831),
    buttonBottom = Color(0xFF006E28),
    buttonText = Color.White
)

val DarkGlass = GlassTokens(
    aurora = listOf(
        AuroraBlob(Color(0xFF1FAA5A).copy(alpha = 0.50f), 210.dp, Offset(0.18f, 0.04f)),
        AuroraBlob(Color(0xFF146E5A).copy(alpha = 0.40f), 210.dp, Offset(1.00f, 0.26f)),
        AuroraBlob(Color(0xFF2850A0).copy(alpha = 0.20f), 240.dp, Offset(0.40f, 0.46f))
    ),
    tint = Color(0xFF1A2129).copy(alpha = 0.55f),
    edge = Color.White.copy(alpha = 0.10f),
    divider = Color(0xFF7F7F7F).copy(alpha = 0.22f),
    navPill = Color(0xFF37D16C).copy(alpha = 0.18f),
    navIcon = Color(0xFF6BE895),
    fabTop = Color(0xFF6BE895),
    fabBottom = Color(0xFF37D16C),
    fabIcon = Color(0xFF05080B),
    fabShadow = Color(0xFF37D16C).copy(alpha = 0.38f),
    buttonTop = Color(0xFF6BE895),
    buttonBottom = Color(0xFF37D16C),
    buttonText = Color(0xFF05080B)
)

val LocalGlass = staticCompositionLocalOf { LightGlass }

val LocalHazeState = staticCompositionLocalOf<HazeState> { error("LocalHazeState belum disediakan") }
