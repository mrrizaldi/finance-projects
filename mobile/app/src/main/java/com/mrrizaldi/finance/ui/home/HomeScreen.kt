package com.mrrizaldi.finance.ui.home

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.lock.AppLock
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GroupDivider
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.MonthMenuButton
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.PendingChip
import com.mrrizaldi.finance.ui.components.SectionLabel
import com.mrrizaldi.finance.ui.components.TxDetailActions
import com.mrrizaldi.finance.ui.components.TxRow
import com.mrrizaldi.finance.ui.components.signedAmount
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import java.time.YearMonth
import kotlin.math.abs

@Composable
fun HomeScreen(
    vm: HomeViewModel,
    lock: AppLock,
    unread: Int,
    onEdit: (String) -> Unit,
    onInbox: () -> Unit
) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val pendingCount by vm.pendingCount.collectAsStateWithLifecycle()
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val deleteError by vm.deleteError.collectAsStateWithLifecycle()
    var showSettings by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<TransactionEntity?>(null) }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.home_total_balance),
                    style = MaterialTheme.typography.bodyMedium,
                    color = p.textMute,
                    modifier = Modifier.weight(1f)
                )
                MonthMenuButton(state.month, vm::setMonth)
                IconButton(onClick = onInbox) {
                    Box {
                        Icon(AppIcons.Bell, stringResource(R.string.inbox_title))
                        if (unread > 0) UnreadBadge(unread, Modifier.align(Alignment.TopEnd))
                    }
                }
                IconButton(onClick = { showSettings = true }) {
                    Icon(AppIcons.Settings, stringResource(R.string.settings_title))
                }
            }
            CountUpBalance(state.month, state.totalBalance)
            DeltaLine(state.netChange, JakartaDate.formatMonth(state.month, locale))
            when (error) {
                SyncError.Offline -> Box(Modifier.padding(top = 12.dp)) { OfflineChip(state.lastSuccessAt) }
                is SyncError.Server -> Text(
                    stringResource(R.string.load_error),
                    color = p.negative,
                    modifier = Modifier.padding(top = 12.dp)
                )
                else -> Unit
            }
            if (pendingCount > 0) Box(Modifier.padding(top = 12.dp)) { PendingChip(pendingCount) }
            GlassSurface(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                Column {
                    SummaryRow(R.string.home_income, state.income, p.positive)
                    GroupDivider()
                    SummaryRow(R.string.home_expense, state.expense, p.negative)
                    GroupDivider()
                    BudgetRow(state.budgetSpent, state.budgetLimit)
                }
            }
            SectionLabel(stringResource(R.string.home_recent_title))
            if (state.recent.isEmpty()) {
                GroupedCard {
                    Text(stringResource(R.string.tx_empty), color = p.textMute, modifier = Modifier.padding(16.dp))
                }
            } else {
                GroupedCard(state.recent) { tx -> TxRow(tx) { if (!tx.pending) detail = tx } }
            }
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
    if (showSettings) SettingsSheet(pendingCount, lock, onLogout = vm::logout, onDismiss = { showSettings = false })
    TxDetailActions(
        detail = detail,
        deleteError = deleteError,
        onEdit = onEdit,
        onDelete = vm::delete,
        onDismiss = { detail = null },
        onDismissError = vm::clearDeleteError
    )
}

@Composable
private fun CountUpBalance(month: YearMonth, total: Long) {
    val progress = remember { Animatable(1f) }
    var from by remember { mutableLongStateOf(0L) }
    var to by remember { mutableLongStateOf(0L) }
    var shownMonth by remember { mutableStateOf<YearMonth?>(null) }
    LaunchedEffect(month, total) {
        from = if (shownMonth == month) countUpValue(from, to, progress.value) else 0L
        shownMonth = month
        to = total
        progress.snapTo(0f)
        progress.animateTo(1f, tween(durationMillis = 600, easing = FastOutSlowInEasing))
    }
    Text(
        signedAmount(RupiahFormat.format(if (shownMonth == month) countUpValue(from, to, progress.value) else 0L)),
        style = AppType.balance,
        maxLines = 1,
        modifier = Modifier.padding(top = 2.dp)
    )
}

@Composable
private fun DeltaLine(change: Long?, monthLabel: String) {
    val p = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(top = 2.dp)) {
        if (change != null) {
            Text(
                (if (change >= 0) "▲ " else "▼ ") + RupiahFormat.format(abs(change)) + " ",
                style = AppType.rowMeta.copy(fontWeight = FontWeight.SemiBold),
                color = if (change >= 0) p.positive else p.negative
            )
        }
        Text(
            if (change != null) stringResource(R.string.home_delta, monthLabel) else monthLabel,
            style = AppType.rowMeta,
            color = p.textMute,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun SummaryRow(label: Int, amount: Long, color: Color) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(
            stringResource(label),
            style = AppType.rowTitle,
            color = LocalPalette.current.textMute,
            modifier = Modifier.padding(start = 10.dp).weight(1f)
        )
        Text(RupiahFormat.format(amount), style = AppType.rowAmount, color = color)
    }
}

@Composable
private fun BudgetRow(spent: Long, limit: Long) {
    val p = LocalPalette.current
    val over = limit > 0L && spent > limit
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.home_budget_title),
                style = AppType.rowTitle,
                color = p.textMute,
                modifier = Modifier.weight(1f)
            )
            Text(
                when {
                    limit <= 0L -> stringResource(R.string.home_no_budget)
                    over -> stringResource(R.string.home_budget_over, RupiahFormat.format(spent - limit))
                    else -> stringResource(R.string.home_budget_left, RupiahFormat.format(limit - spent))
                },
                style = AppType.rowAmount,
                color = if (over) p.negative else p.textMute
            )
        }
        if (limit > 0L) {
            val ratio = (spent.toFloat() / limit).coerceIn(0f, 1f)
            val color = when {
                over -> p.negative
                ratio > 0.8f -> p.warn
                else -> p.primary
            }
            Box(
                Modifier
                    .padding(top = 10.dp)
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(p.textHi.copy(alpha = 0.08f))
            ) {
                Box(Modifier.fillMaxWidth(ratio).fillMaxHeight().background(color, CircleShape))
            }
        }
    }
}

@Composable
private fun UnreadBadge(count: Int, modifier: Modifier) {
    val p = LocalPalette.current
    Box(
        modifier.offset(x = 6.dp, y = (-4).dp).defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
            .clip(CircleShape).background(p.primary).padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(if (count > 99) "99+" else count.toString(), color = p.primaryFg, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}
