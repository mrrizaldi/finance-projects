package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.CardShape
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun GroupedCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(CardShape).background(LocalPalette.current.surface),
        content = content
    )
}

@Composable
fun <T> GroupedCard(items: List<T>, modifier: Modifier = Modifier, row: @Composable (T) -> Unit) {
    GroupedCard(modifier) {
        items.forEachIndexed { i, item ->
            if (i > 0) GroupDivider()
            row(item)
        }
    }
}

@Composable
fun GroupDivider() {
    HorizontalDivider(
        Modifier.padding(horizontal = 16.dp),
        thickness = 0.5.dp,
        color = LocalGlass.current.divider
    )
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, trailing: String? = null) {
    val color = LocalPalette.current.textMute
    Row(
        modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 20.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text.uppercase(), style = AppType.sectionLabel, color = color)
        if (trailing != null) Text(trailing, style = AppType.sectionLabel, color = color)
    }
}
