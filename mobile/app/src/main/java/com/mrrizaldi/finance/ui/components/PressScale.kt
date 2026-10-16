package com.mrrizaldi.finance.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

@Composable
fun Modifier.pressScale(interaction: InteractionSource): Modifier {
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.96f else 1f, label = "pressScale")
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
