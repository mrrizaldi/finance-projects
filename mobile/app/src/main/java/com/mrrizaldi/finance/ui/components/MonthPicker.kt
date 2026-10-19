package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import java.time.YearMonth
import java.time.format.TextStyle

private const val MONTHS_IN_YEAR = 12
private const val MONTHS_PER_ROW = 3
private const val FUTURE_ALPHA = 0.35f

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

enum class MonthCell { SELECTED, CURRENT, NORMAL, FUTURE }

internal fun monthCell(cell: YearMonth, selected: YearMonth, current: YearMonth): MonthCell = when {
    cell.isAfter(current) -> MonthCell.FUTURE
    cell == selected -> MonthCell.SELECTED
    cell == current -> MonthCell.CURRENT
    else -> MonthCell.NORMAL
}

internal fun yearMonths(year: Int): List<YearMonth> = (1..MONTHS_IN_YEAR).map { YearMonth.of(year, it) }


@Composable
fun MonthMenuButton(month: YearMonth, onChange: (YearMonth) -> Unit) {
    var open by remember { mutableStateOf(false) }
    IconButton(onClick = { open = true }) {
        Icon(AppIcons.Calendar, stringResource(R.string.month_pick))
    }
    if (open) {
        MonthGridDialog(
            selected = month,
            onPick = {
                open = false
                onChange(it)
            },
            onDismiss = { open = false }
        )
    }
}

@Composable
private fun MonthGridDialog(selected: YearMonth, onPick: (YearMonth) -> Unit, onDismiss: () -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    val current = JakartaDate.currentMonth()
    val p = LocalPalette.current
    val glass = LocalGlass.current
    var year by remember { mutableIntStateOf(selected.year) }
    GlassDialog(
        onDismiss = onDismiss,
        actions = {
            CancelButton(stringResource(R.string.common_cancel), onDismiss, Modifier.weight(1f))
            GradientButton(stringResource(R.string.month_this), { onPick(current) }, Modifier.weight(1f))
        }
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(onClick = { year -= 1 }) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.year_prev))
            }
            Text(year.toString(), style = MaterialTheme.typography.titleMedium, color = p.textHi)
            IconButton(onClick = { year += 1 }, enabled = year < current.year) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.year_next))
            }
        }
        yearMonths(year).chunked(MONTHS_PER_ROW).forEach { row ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                row.forEach { m ->
                    val state = monthCell(m, selected, current)
                    val label = m.month.getDisplayName(TextStyle.SHORT, locale)
                    Box(
                        Modifier
                            .weight(1f)
                            .height(48.dp)
                            .clip(CircleShape)
                            .then(
                                when (state) {
                                    MonthCell.SELECTED -> Modifier.background(Brush.verticalGradient(listOf(glass.buttonTop, glass.buttonBottom)))
                                    MonthCell.CURRENT -> Modifier.border(1.dp, p.textHi, CircleShape)
                                    else -> Modifier
                                }
                            )
                            .alpha(if (state == MonthCell.FUTURE) FUTURE_ALPHA else 1f)
                            .semantics {
                                this.selected = state == MonthCell.SELECTED
                                contentDescription = JakartaDate.formatMonth(m, locale)
                            }
                            .clickable(enabled = state != MonthCell.FUTURE, role = Role.Button) { onPick(m) },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            label,
                            fontWeight = if (state == MonthCell.SELECTED) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (state == MonthCell.SELECTED) glass.buttonText else p.textHi
                        )
                    }
                }
            }
        }
    }
}
