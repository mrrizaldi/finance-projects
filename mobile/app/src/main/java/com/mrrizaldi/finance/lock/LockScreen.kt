package com.mrrizaldi.finance.lock

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.components.AuroraBackground
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.CardShape
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun LockScreen(onUnlock: () -> Unit) {
    val p = LocalPalette.current
    val glass = LocalGlass.current
    Box(
        Modifier.fillMaxSize().background(p.bg).pointerInput(Unit) {},
        contentAlignment = Alignment.Center
    ) {
        AuroraBackground(Modifier.fillMaxSize())
        Column(
            Modifier
                .padding(horizontal = 32.dp)
                .fillMaxWidth()
                .clip(CardShape)
                .background(p.surface)
                .background(glass.tint)
                .border(1.dp, glass.edge, CardShape)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(stringResource(R.string.app_name), style = AppType.screenTitle, color = p.textHi)
            Text(
                stringResource(R.string.lock_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = p.textMute,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp, bottom = 20.dp)
            )
            GradientButton(stringResource(R.string.lock_open), onUnlock)
        }
    }
}
