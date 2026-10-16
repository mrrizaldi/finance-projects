package com.mrrizaldi.finance.ui.analytics

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.TxRow
import com.mrrizaldi.finance.ui.components.hexColor
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.FinancePalette
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.AnalyticsPeriod
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.PeriodBounds
import com.mrrizaldi.finance.util.RupiahFormat
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.TextStyle as JavaTextStyle
import java.util.Locale
import kotlin.math.roundToLong

private val CellShape = RoundedCornerShape(8.dp)

private val GridShape = RoundedCornerShape(3.dp)

private val GridCell = 14.dp

private val GridGap = 3.dp

@Composable
private fun EmptyCard(text: String) {
    GroupedCard {
        Text(text, style = AppType.rowTitle, color = LocalPalette.current.textMute, modifier = Modifier.padding(16.dp))
    }
}

@Composable
private fun ThinBar(fraction: Float, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(CircleShape)
            .background(LocalPalette.current.textHi.copy(alpha = 0.08f))
    ) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight().background(color, CircleShape))
    }
}

@Composable
internal fun CategoryCard(slices: List<CategorySlice>) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    if (slices.isEmpty()) {
        EmptyCard(stringResource(R.string.analytics_empty))
    } else {
        GroupedCard(slices.withIndex().toList()) { (i, s) ->
            val color = if (s.name == null) p.textMute else hexColor(s.color, p.chart[i % p.chart.size])
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).background(color, CircleShape))
                    Text(
                        s.name ?: stringResource(R.string.analytics_others),
                        style = AppType.rowTitle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 10.dp).weight(1f)
                    )
                    Text(RupiahFormat.format(s.amount), style = AppType.rowAmount)
                    Text(
                        formatShare(s.share, locale),
                        style = AppType.rowMeta,
                        color = p.textMute,
                        textAlign = TextAlign.End,
                        modifier = Modifier.padding(start = 8.dp).width(48.dp)
                    )
                }
                ThinBar(s.share, color, Modifier.padding(top = 8.dp))
            }
        }
    }
}

private fun dayFill(level: Float, p: FinancePalette): Color {
    if (level <= 0f) return p.textHi.copy(alpha = 0.06f).compositeOver(p.surface)
    val hue = if (level < 0.5f) lerp(p.positive, p.warn, level * 2f) else lerp(p.warn, p.negative, (level - 0.5f) * 2f)
    return hue.copy(alpha = 0.35f + 0.65f * level).compositeOver(p.surface)
}

@Composable
private fun DayCell(
    date: LocalDate,
    level: Float,
    detail: String,
    isToday: Boolean,
    isPicked: Boolean,
    numbered: Boolean,
    onClick: () -> Unit
) {
    val p = LocalPalette.current
    val fill = dayFill(level, p)
    val ink = if (fill.luminance() > 0.179f) Color(0xFF11171D) else Color.White
    val shape = if (numbered) CellShape else GridShape
    Box(
        Modifier
            .fillMaxSize()
            .clip(shape)
            .background(fill)
            .then(if (isToday || isPicked) Modifier.border(if (isPicked) 2.dp else 1.dp, p.textHi, shape) else Modifier)
            .semantics { contentDescription = detail }
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        if (numbered) Text(date.dayOfMonth.toString(), style = AppType.rowMeta, color = ink)
    }
}

@Composable
private fun CalendarGrid(weeks: List<List<LocalDate?>>, locale: Locale, cell: @Composable (LocalDate) -> Unit) {
    val p = LocalPalette.current
    Row {
        DayOfWeek.entries.forEach { day ->
            Text(
                day.getDisplayName(JavaTextStyle.SHORT, locale),
                style = AppType.sectionLabel,
                color = p.textMute,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f)
            )
        }
    }
    weeks.forEach { week ->
        Row {
            week.forEach { date ->
                Box(Modifier.weight(1f).aspectRatio(1f).padding(3.dp)) {
                    if (date != null) cell(date)
                }
            }
        }
    }
}

@Composable
private fun ContributionGrid(
    weeks: List<List<LocalDate?>>,
    bounds: PeriodBounds,
    locale: Locale,
    cell: @Composable (LocalDate) -> Unit
) {
    val p = LocalPalette.current
    key(bounds) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState(Int.MAX_VALUE)),
            horizontalArrangement = Arrangement.spacedBy(GridGap)
        ) {
            weeks.forEach { week ->
                Column(verticalArrangement = Arrangement.spacedBy(GridGap)) {
                    Box(Modifier.size(GridCell), contentAlignment = Alignment.Center) {
                        week.firstOrNull { it?.dayOfMonth == 1 }?.let {
                            Text(shortMonth(it.toString(), locale).take(1), style = AppType.sectionLabel, color = p.textMute)
                        }
                    }
                    week.forEach { date ->
                        Box(Modifier.size(GridCell)) {
                            if (date != null) cell(date)
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun DailyCard(bounds: PeriodBounds, daily: List<DailySpendingDto>) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val today = JakartaDate.today()
    var picked by rememberSaveable(bounds) { mutableStateOf<String?>(null) }
    val byDay = daily.associate { it.day to it.daily_expense }
    val max = byDay.values.maxOrNull() ?: 0.0
    val calendar = bounds.period == AnalyticsPeriod.WEEK || bounds.period == AnalyticsPeriod.MONTH
    val weeks = weeksOf(bounds.start, bounds.end)
    fun detailOf(date: LocalDate) =
        formatDayDetail(date, RupiahFormat.format((byDay[date.toString()] ?: 0.0).roundToLong()), locale)
    val cell: @Composable (LocalDate) -> Unit = { date ->
        DayCell(
            date = date,
            level = intensity(byDay[date.toString()] ?: 0.0, max),
            detail = detailOf(date),
            isToday = date == today,
            isPicked = date.toString() == picked,
            numbered = calendar,
            onClick = { picked = date.toString() }
        )
    }
    GroupedCard {
        Column(Modifier.padding(12.dp)) {
            if (calendar) CalendarGrid(weeks, locale, cell) else ContributionGrid(weeks, bounds, locale, cell)
            val detail = picked?.let { detailOf(LocalDate.parse(it)) }
            Text(
                detail ?: stringResource(R.string.analytics_daily_hint),
                style = AppType.rowMeta,
                color = if (detail != null) p.textHi else p.textMute,
                modifier = Modifier.padding(start = 4.dp, top = 8.dp)
            )
        }
    }
}

@Composable
internal fun BudgetCard(lines: List<BudgetLine>) {
    val p = LocalPalette.current
    if (lines.isEmpty()) {
        EmptyCard(stringResource(R.string.home_no_budget))
    } else {
        GroupedCard(lines) { line ->
            val color = when (line.state) {
                BudgetState.OVER -> p.negative
                BudgetState.WARN -> p.warn
                BudgetState.OK -> p.primary
            }
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        line.name,
                        style = AppType.rowTitle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        stringResource(
                            R.string.analytics_budget_used,
                            RupiahFormat.format(line.spent),
                            RupiahFormat.format(line.limit)
                        ),
                        style = AppType.rowMeta,
                        color = if (line.state == BudgetState.OVER) p.negative else p.textMute,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
                ThinBar(line.ratio, color, Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
internal fun TopCard(rows: List<TransactionEntity>) {
    if (rows.isEmpty()) EmptyCard(stringResource(R.string.analytics_empty)) else GroupedCard(rows) { tx -> TxRow(tx) {} }
}
