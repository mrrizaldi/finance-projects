package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.HazeColorEffect
import dev.chrisbanes.haze.blur.hazeBlur
import com.mrrizaldi.finance.ui.theme.CardShape
import com.mrrizaldi.finance.ui.theme.GlassBlur
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalHazeState
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    shape: Shape = CardShape,
    content: @Composable BoxScope.() -> Unit
) {
    val glass = LocalGlass.current
    val bg = LocalPalette.current.bg
    val state = LocalHazeState.current
    val style = remember(glass, bg) {
        HazeBlurStyle {
            blurRadius(GlassBlur)
            noiseFactor(0f)
            backgroundColor(bg)
            colorEffects(listOf(HazeColorEffect.tint(glass.tint)))
        }
    }
    Box(
        modifier
            .clip(shape)
            .hazeBlur(HazeInput.Sources(state), style)
            .border(1.dp, glass.edge, shape),
        content = content
    )
}
