package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate

@Composable
fun OfflineChip(lastSuccessAt: Long?) {
    val locale = LocalConfiguration.current.locales[0]
    val p = LocalPalette.current
    StatusChip(
        if (lastSuccessAt == null) stringResource(R.string.offline_never)
        else stringResource(R.string.offline_chip, JakartaDate.formatMillis(lastSuccessAt, locale)),
        p.warnSoft,
        p.warn
    )
}

@Composable
fun PendingChip(count: Int) {
    val p = LocalPalette.current
    StatusChip(stringResource(R.string.home_pending, count), p.infoSoft, p.info)
}

@Composable
private fun StatusChip(text: String, fill: Color, color: Color) {
    Surface(color = fill, contentColor = color, shape = MaterialTheme.shapes.small) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelMedium
        )
    }
}
