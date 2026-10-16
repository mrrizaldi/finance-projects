package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.util.JakartaDate
import java.time.YearMonth

@Composable
fun MonthPicker(month: YearMonth, onChange: (YearMonth) -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        IconButton(onClick = { onChange(month.minusMonths(1)) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.month_prev))
        }
        Text(JakartaDate.formatMonth(month, locale), style = MaterialTheme.typography.titleMedium)
        IconButton(onClick = { onChange(month.plusMonths(1)) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.month_next))
        }
    }
}

@Composable
fun MonthMenuButton(month: YearMonth, onChange: (YearMonth) -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    var open by remember { mutableStateOf(false) }
    val current = JakartaDate.currentMonth()
    Box {
        IconButton(onClick = { open = true }) {
            Icon(AppIcons.Calendar, stringResource(R.string.month_pick))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            (0L until 12L).map { current.minusMonths(it) }.forEach { m ->
                DropdownMenuItem(
                    text = {
                        Text(
                            JakartaDate.formatMonth(m, locale),
                            fontWeight = if (m == month) FontWeight.SemiBold else FontWeight.Normal
                        )
                    },
                    onClick = {
                        open = false
                        onChange(m)
                    }
                )
            }
        }
    }
}
