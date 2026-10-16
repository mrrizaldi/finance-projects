package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.mrrizaldi.finance.ui.theme.LocalGlass

@Composable
fun AuroraBackground(modifier: Modifier = Modifier) {
    val blobs = LocalGlass.current.aurora
    Canvas(modifier) {
        blobs.forEach { blob ->
            drawRect(
                Brush.radialGradient(
                    colors = listOf(blob.color, Color.Transparent),
                    center = Offset(size.width * blob.center.x, size.height * blob.center.y),
                    radius = blob.radius.toPx()
                )
            )
        }
    }
}
