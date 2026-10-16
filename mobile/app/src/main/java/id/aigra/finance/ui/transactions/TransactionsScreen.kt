package id.aigra.finance.ui.transactions

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.aigra.finance.R
import id.aigra.finance.data.SyncError
import id.aigra.finance.data.TxFilter
import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.ui.components.DropdownField
import id.aigra.finance.ui.components.MonthPicker
import id.aigra.finance.ui.components.OfflineChip
import id.aigra.finance.ui.components.TxRow
import id.aigra.finance.ui.theme.LocalPalette
import id.aigra.finance.util.JakartaDate
import id.aigra.finance.util.RupiahFormat
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
    val filterActive = filter.type != null || filter.accountId != null || filter.categoryId != null
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) { snapshotFlow { filter }.drop(1).collect { listState.scrollToItem(0) } }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = search,
                onValueChange = {
                    search = it
                    vm.setSearch(it)
                },
                placeholder = { Text(stringResource(R.string.tx_search_hint)) },
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            TextButton(onClick = { showFilter = true }) {
                Text(stringResource(R.string.tx_filter) + if (filterActive) " •" else "")
            }
        }
        Box(Modifier.padding(horizontal = 16.dp)) { MonthPicker(filter.month, vm::setMonth) }
        Box(Modifier.padding(horizontal = 16.dp)) {
            when (error) {
                SyncError.Offline -> OfflineChip(lastSuccessAt)
                is SyncError.Server -> Text(stringResource(R.string.load_error), color = LocalPalette.current.negative)
                else -> Unit
            }
        }
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), state = listState) {
                if (items.isEmpty()) {
                    item {
                        Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                            Text(stringResource(R.string.tx_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                items.groupBy { it.dateKey }.forEach { (key, rows) ->
                    item(key = "h-$key") { DayHeader(key, today, locale) }
                    items(rows, key = { it.id }) { tx -> TxRow(tx) { detail = tx } }
                }
            }
        }
    }

    if (showFilter) {
        FilterSheet(
            filter = filter,
            accounts = accounts,
            categories = categories,
            onApply = { type, accountId, categoryId ->
                vm.setFilter(type, accountId, categoryId)
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
private fun DayHeader(key: String, today: LocalDate, locale: Locale) {
    val date = JakartaDate.parseKey(key)
    val label = when (ChronoUnit.DAYS.between(date, today)) {
        0L -> stringResource(R.string.tx_today)
        1L -> stringResource(R.string.tx_yesterday)
        else -> JakartaDate.formatDay(date, locale)
    }
    Text(
        label,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
    )
}

@Composable
private fun FilterSheet(
    filter: TxFilter,
    accounts: List<AccountEntity>,
    categories: List<CategoryEntity>,
    onApply: (String?, String?, String?) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit
) {
    var type by remember { mutableStateOf(filter.type) }
    var account by remember { mutableStateOf(accounts.firstOrNull { it.id == filter.accountId }) }
    var category by remember { mutableStateOf(categories.firstOrNull { it.id == filter.categoryId }) }
    val types = listOf<Pair<String?, Int>>(
        null to R.string.tx_type_all,
        "expense" to R.string.tx_type_expense,
        "income" to R.string.tx_type_income,
        "transfer" to R.string.tx_type_transfer
    )
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.padding(16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                types.forEach { (value, label) ->
                    FilterChip(selected = type == value, onClick = { type = value }, label = { Text(stringResource(label)) })
                }
            }
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
                Button(onClick = { onApply(type, account?.id, category?.id) }) {
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
