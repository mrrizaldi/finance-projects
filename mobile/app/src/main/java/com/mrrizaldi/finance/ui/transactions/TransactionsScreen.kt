package com.mrrizaldi.finance.ui.transactions

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.TxFilter
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.ui.components.CancelButton
import com.mrrizaldi.finance.ui.components.ColorDot
import com.mrrizaldi.finance.ui.components.DangerButton
import com.mrrizaldi.finance.ui.components.GlassDialog
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.hexColor
import com.mrrizaldi.finance.ui.components.MonthPicker
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.SectionLabel
import com.mrrizaldi.finance.ui.components.TxDetailActions
import com.mrrizaldi.finance.ui.components.TxRow
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.drop
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale

@Composable
fun TransactionsScreen(vm: TransactionsViewModel, onEdit: (String) -> Unit) {
    val items by vm.items.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    val outbox by vm.outbox.collectAsStateWithLifecycle()
    val deleteError by vm.deleteError.collectAsStateWithLifecycle()
    var pending by remember { mutableStateOf<TransactionEntity?>(null) }
    var confirmDelete by remember { mutableStateOf<TransactionEntity?>(null) }
    var search by rememberSaveable { mutableStateOf("") }
    var showFilter by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<TransactionEntity?>(null) }
    val locale = LocalConfiguration.current.locales[0]
    val today = JakartaDate.today()
    val p = LocalPalette.current
    val sheetFilterCount = activeFilterCount(filter.accountId, filter.categoryId)
    val listState = rememberLazyListState()
    val searchInteraction = remember { MutableInteractionSource() }
    val searchFocused by searchInteraction.collectIsFocusedAsState()
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
                GlassSurface(
                    Modifier
                        .weight(1f)
                        .height(44.dp)
                        .then(if (searchFocused) Modifier.border(1.dp, p.primary, CircleShape) else Modifier),
                    shape = CircleShape
                ) {
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
                            interactionSource = searchInteraction,
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
                Box {
                    GlassSurface(Modifier.size(44.dp), shape = CircleShape) {
                        IconButton(onClick = { showFilter = true }, modifier = Modifier.fillMaxSize()) {
                            Icon(
                                AppIcons.Filter,
                                stringResource(R.string.tx_filter),
                                tint = if (sheetFilterCount > 0) p.primary else p.textHi
                            )
                        }
                    }
                    if (sheetFilterCount > 0) {
                        Box(
                            Modifier
                                .align(Alignment.TopEnd)
                                .offset(x = 2.dp, y = (-2).dp)
                                .size(18.dp)
                                .background(p.primary, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                sheetFilterCount.toString(),
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                color = p.primaryFg
                            )
                        }
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
                    item {
                        Column {
                            SectionLabel(dayLabel(key, today, locale), trailing = formatDayTotal(dailyTotal(rows)))
                            GroupedCard(rows) { tx -> TxRow(tx) { if (tx.pending) pending = tx else detail = tx } }
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
    TxDetailActions(
        detail = detail,
        deleteError = deleteError,
        onEdit = onEdit,
        onDelete = vm::delete,
        onDismiss = { detail = null },
        onDismissError = vm::clearDeleteError
    )
    pending?.let { tx ->
        val error = outbox[tx.id]?.lastError
        GlassDialog(
            onDismiss = { pending = null },
            title = stringResource(R.string.pending_title),
            body = if (error != null) stringResource(R.string.pending_error, error) else stringResource(R.string.pending_waiting),
            actions = {
                DangerButton(
                    stringResource(R.string.pending_delete),
                    {
                        pending = null
                        confirmDelete = tx
                    },
                    Modifier.weight(1f)
                )
                GradientButton(
                    text = stringResource(R.string.pending_retry),
                    onClick = {
                        pending = null
                        vm.retry(tx.id)
                    },
                    modifier = Modifier.weight(1f)
                )
            }
        )
    }
    confirmDelete?.let { tx ->
        GlassDialog(
            onDismiss = { confirmDelete = null },
            title = stringResource(R.string.pending_delete_title),
            body = stringResource(R.string.pending_delete_body),
            actions = {
                CancelButton(stringResource(R.string.common_cancel), { confirmDelete = null }, Modifier.weight(1f))
                DangerButton(
                    stringResource(R.string.pending_delete),
                    {
                        confirmDelete = null
                        vm.discard(tx.id)
                    },
                    Modifier.weight(1f)
                )
            }
        )
    }
}

private val SheetShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)

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
    val p = LocalPalette.current
    var accountId by remember { mutableStateOf(filter.accountId) }
    var categoryId by remember { mutableStateOf(filter.categoryId) }
    val count = activeFilterCount(accountId, categoryId)
    val forType = categoriesForType(categories, filter.type)
    val visibleCategories = forType + categories.filter { it.id == categoryId && it !in forType }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = SheetShape,
        containerColor = p.bg
    ) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 16.dp)) {
            Text(
                stringResource(R.string.tx_filter),
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.padding(horizontal = 20.dp)
            )
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                SectionLabel(stringResource(R.string.tx_filter_account), Modifier.padding(horizontal = 16.dp))
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(accounts, key = { it.id }) { account ->
                        FilterChip(account.name, hexColor(account.color, p.textMute), account.id == accountId) {
                            accountId = if (account.id == accountId) null else account.id
                        }
                    }
                }
                SectionLabel(stringResource(R.string.tx_filter_category), Modifier.padding(horizontal = 16.dp))
                FlowRow(
                    Modifier.padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    visibleCategories.forEach { category ->
                        FilterChip(category.name, hexColor(category.color, p.textMute), category.id == categoryId) {
                            categoryId = if (category.id == categoryId) null else category.id
                        }
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 24.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onReset) { Text(stringResource(R.string.tx_filter_reset), color = p.textHi) }
                Spacer(Modifier.width(12.dp))
                GradientButton(
                    text = if (count > 0) {
                        stringResource(R.string.tx_filter_apply_count, count)
                    } else {
                        stringResource(R.string.tx_filter_apply)
                    },
                    onClick = { onApply(accountId, categoryId) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun FilterChip(label: String, dot: Color, selected: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    val fg = if (selected) p.bg else p.textHi
    Row(
        Modifier
            .clip(CircleShape)
            .background(if (selected) p.textHi else p.textHi.copy(alpha = 0.07f))
            .selectable(selected = selected, role = Role.Checkbox, onClick = onClick)
            .heightIn(min = 40.dp)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        ColorDot(dot, fg, 10.dp)
        Text(
            label,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            color = fg,
            maxLines = 1
        )
        if (selected) Icon(AppIcons.Check, null, tint = fg, modifier = Modifier.size(16.dp))
    }
}
