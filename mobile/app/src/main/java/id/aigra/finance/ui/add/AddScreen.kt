package id.aigra.finance.ui.add

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.aigra.finance.R
import id.aigra.finance.ui.components.AmountField
import id.aigra.finance.ui.components.DropdownField
import id.aigra.finance.util.JakartaDate
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Composable
fun AddScreen(vm: AddViewModel) {
    val form by vm.form.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0]
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }

    LaunchedEffect(accounts) {
        if (accounts.isNotEmpty() && form.accountId == null) {
            vm.edit {
                copy(
                    accountId = accounts.first().id,
                    fromAccountId = accounts.first().id,
                    toAccountId = accounts.getOrNull(1)?.id
                )
            }
        }
    }
    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(context.getString(it.res, it.arg))
            vm.consumeMessage()
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }, contentWindowInsets = WindowInsets(0)) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                AddTab.entries.forEachIndexed { i, tab ->
                    SegmentedButton(
                        selected = form.tab == tab,
                        onClick = { vm.edit { copy(tab = tab) } },
                        shape = SegmentedButtonDefaults.itemShape(i, AddTab.entries.size)
                    ) {
                        Text(stringResource(if (tab == AddTab.ENTRY) R.string.add_tab_entry else R.string.add_tab_transfer))
                    }
                }
            }

            if (form.tab == AddTab.ENTRY) {
                val types = listOf("expense" to R.string.tx_type_expense, "income" to R.string.tx_type_income)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    types.forEachIndexed { i, (value, label) ->
                        SegmentedButton(
                            selected = form.type == value,
                            onClick = { vm.edit { copy(type = value, categoryId = null) } },
                            shape = SegmentedButtonDefaults.itemShape(i, types.size)
                        ) { Text(stringResource(label)) }
                    }
                }
                AmountField(form.amount, { v -> vm.edit { copy(amount = v) } }, stringResource(R.string.add_amount))
                DropdownField(
                    label = stringResource(R.string.add_account),
                    options = accounts,
                    selected = accounts.firstOrNull { it.id == form.accountId },
                    optionLabel = { it.name },
                    onSelect = { a -> vm.edit { copy(accountId = a.id) } }
                )
                val visibleCategories = categories.filter { it.type == form.type || it.type == "both" }
                DropdownField(
                    label = stringResource(R.string.add_category),
                    options = visibleCategories,
                    selected = visibleCategories.firstOrNull { it.id == form.categoryId },
                    optionLabel = { it.name },
                    onSelect = { c -> vm.edit { copy(categoryId = c.id) } }
                )
                OutlinedTextField(
                    value = form.description,
                    onValueChange = { v -> vm.edit { copy(description = v) } },
                    label = { Text(stringResource(R.string.add_description)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = form.merchant,
                    onValueChange = { v -> vm.edit { copy(merchant = v) } },
                    label = { Text(stringResource(R.string.add_merchant)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                AmountField(form.amount, { v -> vm.edit { copy(amount = v) } }, stringResource(R.string.add_amount))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = form.sameAmount, onCheckedChange = { v -> vm.edit { copy(sameAmount = v) } })
                    Text(stringResource(R.string.add_same_amount))
                }
                if (!form.sameAmount) {
                    AmountField(form.toAmount, { v -> vm.edit { copy(toAmount = v) } }, stringResource(R.string.add_amount_to))
                }
                DropdownField(
                    label = stringResource(R.string.add_from_account),
                    options = accounts,
                    selected = accounts.firstOrNull { it.id == form.fromAccountId },
                    optionLabel = { it.name },
                    onSelect = { a -> vm.edit { copy(fromAccountId = a.id) } }
                )
                val targets = accounts.filter { it.id != form.fromAccountId }
                DropdownField(
                    label = stringResource(R.string.add_to_account),
                    options = targets,
                    selected = targets.firstOrNull { it.id == form.toAccountId },
                    optionLabel = { it.name },
                    onSelect = { a -> vm.edit { copy(toAccountId = a.id) } }
                )
                OutlinedTextField(
                    value = form.description,
                    onValueChange = { v -> vm.edit { copy(description = v) } },
                    label = { Text(stringResource(R.string.add_description)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { showDate = true }, modifier = Modifier.weight(1f)) {
                    Text(JakartaDate.formatDay(form.date, locale))
                }
                OutlinedButton(onClick = { showTime = true }, modifier = Modifier.weight(1f)) {
                    Text(form.time.format(DateTimeFormatter.ofPattern("HH:mm")))
                }
            }

            Button(onClick = vm::save, enabled = !form.saving, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(if (form.saving) R.string.add_saving else R.string.add_save))
            }
        }
    }

    if (showDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = form.date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        vm.edit { copy(date = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()) }
                    }
                    showDate = false
                }) { Text(stringResource(R.string.common_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDate = false }) { Text(stringResource(R.string.common_cancel)) }
            }
        ) { DatePicker(state = state) }
    }

    if (showTime) {
        val state = rememberTimePickerState(initialHour = form.time.hour, initialMinute = form.time.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { showTime = false },
            confirmButton = {
                TextButton(onClick = {
                    vm.edit { copy(time = LocalTime.of(state.hour, state.minute)) }
                    showTime = false
                }) { Text(stringResource(R.string.common_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showTime = false }) { Text(stringResource(R.string.common_cancel)) }
            },
            text = { TimePicker(state = state) }
        )
    }
}
