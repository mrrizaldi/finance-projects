package id.aigra.finance.ui.components

import androidx.compose.ui.graphics.Color

fun hexColor(hex: String?, fallback: Color): Color =
    hex?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() } ?: fallback
