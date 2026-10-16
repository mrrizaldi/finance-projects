package com.mrrizaldi.finance.ui.analytics

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.ui.components.GlassSegmented
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.SectionLabel
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.AnalyticsPeriod
import com.mrrizaldi.finance.util.PeriodBounds
import com.mrrizaldi.finance.util.RupiahFormat
import java.time.YearMonth
import kotlin.math.roundToLong

@Composable
fun AnalyticsScreen(vm: AnalyticsViewModel) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val p = LocalPalette.current
    val highlighted = state.savings.indices
        .filter { state.bounds.covers(YearMonth.parse(state.savings[it].month_date.take(7))) }
        .toSet()

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Text(
                stringResource(R.string.analytics_title),
                style = AppType.screenTitle,
                modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
            )
            PeriodSwitcher(state.bounds, vm::setPeriod, vm::shift)
            when (error) {
                SyncError.Offline -> Box(Modifier.padding(top = 8.dp)) { OfflineChip(state.lastSuccessAt) }
                is SyncError.Server -> Text(
                    stringResource(R.string.load_error),
                    color = p.negative,
                    modifier = Modifier.padding(top = 8.dp)
                )
                else -> Unit
            }
            state.comparison?.let { ComparisonCard(it, state.bounds) }
            SectionLabel(stringResource(R.string.analytics_trend))
            GroupedCard {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LegendDot(p.positive, stringResource(R.string.home_income))
                        LegendDot(p.negative, stringResource(R.string.home_expense), Modifier.padding(start = 12.dp))
                    }
                    if (state.trend.isNotEmpty()) TrendChart(state.trend, Modifier.fillMaxWidth().padding(top = 12.dp))
                }
            }
            SectionLabel(stringResource(R.string.analytics_savings))
            GroupedCard {
                Box(Modifier.padding(16.dp)) {
                    if (state.savings.isNotEmpty()) SavingsChart(state.savings, highlighted, Modifier.fillMaxWidth())
                }
            }
            SectionLabel(stringResource(R.string.analytics_by_category))
            CategoryCard(state.categories)
            SectionLabel(stringResource(R.string.analytics_daily))
            DailyCard(state.bounds, state.daily)
            if (state.bounds.period == AnalyticsPeriod.MONTH) {
                SectionLabel(stringResource(R.string.analytics_budget))
                BudgetCard(state.budgets)
            }
            SectionLabel(stringResource(R.string.analytics_top))
            TopCard(state.top)
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
}

@Composable
private fun PeriodSwitcher(bounds: PeriodBounds, onPeriod: (AnalyticsPeriod) -> Unit, onShift: (Long) -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    val names = listOf(
        R.string.analytics_week,
        R.string.analytics_month,
        R.string.analytics_quarter,
        R.string.analytics_year
    )
    GlassSegmented(
        options = names.map { stringResource(it) },
        selected = bounds.period.ordinal,
        onSelect = { onPeriod(AnalyticsPeriod.entries[it]) },
        modifier = Modifier.padding(top = 8.dp)
    )
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        IconButton(onClick = { onShift(-1) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.analytics_prev))
        }
        Text(bounds.label(locale), style = MaterialTheme.typography.titleMedium)
        IconButton(onClick = { onShift(1) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.analytics_next))
        }
    }
}

@Composable
private fun ComparisonCard(c: PeriodComparisonDto, bounds: PeriodBounds) {
    val locale = LocalConfiguration.current.locales[0]
    val previous = bounds.shift(-1).label(locale)
    GlassSurface(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Row(Modifier.padding(16.dp)) {
            ComparisonCell(R.string.tx_type_income, c.curr_income, c.prev_income, true, previous, Modifier.weight(1f))
            Spacer(Modifier.width(16.dp))
            ComparisonCell(R.string.tx_type_expense, c.curr_expense, c.prev_expense, false, previous, Modifier.weight(1f))
        }
    }
}

@Composable
private fun ComparisonCell(
    label: Int,
    current: Double,
    previous: Double,
    higherIsGood: Boolean,
    previousLabel: String,
    modifier: Modifier
) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val change = percentChange(current, previous)
    val color = when (toneOf(change, higherIsGood)) {
        Tone.GOOD -> p.positive
        Tone.BAD -> p.negative
        Tone.NEUTRAL -> p.textMute
    }
    Column(modifier) {
        Text(stringResource(label), style = AppType.rowMeta, color = p.textMute)
        Text(
            RupiahFormat.format(current.roundToLong()),
            style = AppType.rowAmount,
            maxLines = 1,
            modifier = Modifier.padding(top = 2.dp)
        )
        Text(
            change?.let { formatChange(it, locale) } ?: "–",
            style = AppType.rowMeta.copy(fontWeight = FontWeight.SemiBold),
            color = color,
            modifier = Modifier.padding(top = 6.dp)
        )
        Text(
            stringResource(R.string.analytics_vs, previousLabel),
            style = AppType.rowMeta,
            color = p.textMute,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun LegendDot(color: Color, label: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(
            label,
            style = AppType.rowMeta,
            color = LocalPalette.current.textMute,
            modifier = Modifier.padding(start = 6.dp)
        )
    }
}
