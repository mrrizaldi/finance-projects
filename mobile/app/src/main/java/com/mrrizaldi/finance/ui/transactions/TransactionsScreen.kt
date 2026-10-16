package com.mrrizaldi.finance.ui.transactions

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.TxFilter
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.ui.components.DropdownField
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.MonthPicker
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.SectionLabel
import com.mrrizaldi.finance.ui.components.TxRow
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import kotlinx.coroutines.flow.drop
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale

@Composable
fun TransactionsScreen(vm: TransactionsViewModel) {
    val items by vm.items.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    var search by rememberSaveable { mutableStateOf("") }
    var showFilter by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<TransactionEntity?>(null) }
    val locale = LocalConfiguration.current.locales[0]
    val today = JakartaDate.today()
    val p = LocalPalette.current
    val sheetFilterActive = filter.accountId != null || filter.categoryId != null
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) { snapshotFlow { filter }.drop(1).collect { listState.scrollToItem(0) } }
    val types = listOf<Pair<String?, Int>>(
        null to R.string.tx_type_all,
        "expense" to R.string.tx_type_expense,
        "income" to R.string.tx_type_income,
        "transfer" to R.string.tx_type_transfer
    )

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text(
                stringResource(R.string.nav_transactions),
                style = AppType.screenTitle,
                modifier = Modifier.padding(top = 8.dp, bottom = 12.dp)
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GlassSurface(Modifier.weight(1f).height(44.dp), shape = CircleShape) {
                    Row(
                        Modifier.fillMaxSize().padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(AppIcons.Search, null, tint = p.textMute, modifier = Modifier.size(18.dp))
                        BasicTextField(
                            value = search,
                            onValueChange = {
                                search = it
                                vm.setSearch(it)
                            },
                            singleLine = true,
                            textStyle = AppType.rowTitle.copy(color = p.textHi),
                            cursorBrush = SolidColor(p.primary),
                            modifier = Modifier.weight(1f).padding(start = 8.dp),
                            decorationBox = { inner ->
                                Box(contentAlignment = Alignment.CenterStart) {
                                    if (search.isEmpty()) {
                                        Text(
                                            stringResource(R.string.tx_search_hint),
                                            style = AppType.rowTitle,
                                            color = p.textMute,
                                            maxLines = 1
                                        )
                                    }
                                    inner()
                                }
                            }
                        )
                    }
                }
                GlassSurface(Modifier.size(44.dp), shape = CircleShape) {
                    IconButton(onClick = { showFilter = true }, modifier = Modifier.fillMaxSize()) {
                        Icon(
                            AppIcons.Filter,
                            stringResource(R.string.tx_filter),
                            tint = if (sheetFilterActive) p.primary else p.textHi
                        )
                    }
                }
            }
            Row(
                Modifier.padding(top = 4.dp).horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                types.forEach { (value, label) ->
                    TypeChip(stringResource(label), filter.type == value) {
                        vm.setFilter(value, filter.accountId, filter.categoryId)
                    }
                }
            }
            MonthPicker(filter.month, vm::setMonth)
            when (error) {
                SyncError.Offline -> OfflineChip(lastSuccessAt)
                is SyncError.Server -> Text(stringResource(R.string.load_error), color = p.negative)
                else -> Unit
            }
        }
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(
                Modifier.fillMaxSize(),
                state = listState,
                contentPadding = PaddingValues(horizontal = 16.dp)
            ) {
                if (items.isEmpty()) {
                    item {
                        Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                            Text(stringResource(R.string.tx_empty), color = p.textMute)
                        }
                    }
                }
                items.groupBy { it.dateKey }.forEach { (key, rows) ->
                    item(key = "d-$key") {
                        Column {
                            SectionLabel(dayLabel(key, today, locale), trailing = formatDayTotal(dailyTotal(rows)))
                            GroupedCard(rows) { tx -> TxRow(tx) { detail = tx } }
                        }
                    }
                }
                item { Spacer(Modifier.navigationBarsPadding().height(NavBarClearance)) }
            }
        }
    }

    if (showFilter) {
        FilterSheet(
            filter = filter,
            accounts = accounts,
            categories = categories,
            onApply = { accountId, categoryId ->
                vm.setFilter(filter.type, accountId, categoryId)
                showFilter = false
            },
            onReset = {
                vm.resetFilter()
                showFilter = false
            },
            onDismiss = { showFilter = false }
        )
    }
    detail?.let { DetailSheet(it, locale) { detail = null } }
}

@Composable
private fun TypeChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    Box(Modifier.minimumInteractiveComponentSize(), contentAlignment = Alignment.Center) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            color = if (selected) p.bg else p.textHi,
            modifier = Modifier
                .clip(CircleShape)
                .background(if (selected) p.textHi else p.textHi.copy(alpha = 0.07f))
                .selectable(selected = selected, role = Role.Tab, onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 8.dp)
        )
    }
}

@Composable
private fun dayLabel(key: String, today: LocalDate, locale: Locale): String {
    val date = JakartaDate.parseKey(key)
    return when (ChronoUnit.DAYS.between(date, today)) {
        0L -> stringResource(R.string.tx_today)
        1L -> stringResource(R.string.tx_yesterday)
        else -> JakartaDate.formatDay(date, locale)
    }
}

@Composable
private fun FilterSheet(
    filter: TxFilter,
    accounts: List<AccountEntity>,
    categories: List<CategoryEntity>,
    onApply: (String?, String?) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit
) {
    var account by remember { mutableStateOf(accounts.firstOrNull { it.id == filter.accountId }) }
    var category by remember { mutableStateOf(categories.firstOrNull { it.id == filter.categoryId }) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.padding(16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            DropdownField(
                label = stringResource(R.string.tx_filter_account),
                options = accounts,
                selected = account,
                optionLabel = { it.name },
                onSelect = { account = it }
            )
            DropdownField(
                label = stringResource(R.string.tx_filter_category),
                options = categories,
                selected = category,
                optionLabel = { it.name },
                onSelect = { category = it }
            )
            Row(Modifier.fillMaxWidth()) {
                TextButton(onClick = onReset) { Text(stringResource(R.string.tx_filter_reset)) }
                Spacer(Modifier.weight(1f))
                Button(onClick = { onApply(account?.id, category?.id) }) {
                    Text(stringResource(R.string.tx_filter_apply))
                }
            }
        }
    }
}

@Composable
private fun DetailSheet(tx: TransactionEntity, locale: Locale, onDismiss: () -> Unit) {
    val typeLabel = when (tx.type) {
        "income" -> stringResource(R.string.tx_type_income)
        "expense" -> stringResource(R.string.tx_type_expense)
        "transfer" -> stringResource(R.string.tx_type_transfer)
        else -> tx.type
    }
    val rows = listOf(
        R.string.tx_detail_amount to RupiahFormat.format(tx.amount),
        R.string.tx_detail_type to typeLabel,
        R.string.tx_detail_account to tx.accountName,
        R.string.tx_detail_to_account to tx.toAccountName,
        R.string.tx_detail_category to tx.categoryName,
        R.string.tx_detail_description to tx.description,
        R.string.tx_detail_merchant to tx.merchant,
        R.string.tx_detail_date to JakartaDate.formatTimestamp(tx.transactionDate, locale),
        R.string.tx_detail_source to tx.source,
        R.string.tx_detail_balance_after to tx.balanceAfter?.let { RupiahFormat.format(it) }
    )
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.tx_detail_title), style = MaterialTheme.typography.titleLarge)
            HorizontalDivider()
            rows.forEach { (label, value) ->
                if (value != null) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(label), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            value,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.End,
                            modifier = Modifier.padding(start = 16.dp)
                        )
                    }
                }
            }
        }
    }
}
