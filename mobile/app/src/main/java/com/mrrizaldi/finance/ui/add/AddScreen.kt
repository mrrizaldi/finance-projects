package com.mrrizaldi.finance.ui.add

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.components.AmountField
import com.mrrizaldi.finance.ui.components.CapsuleField
import com.mrrizaldi.finance.ui.components.DropdownField
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.util.JakartaDate
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Composable
fun AddScreen(vm: AddViewModel, onBack: () -> Unit) {
    val form by vm.form.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val locale = LocalConfiguration.current.locales[0]
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }

    LaunchedEffect(accounts) {
        if (accounts.isNotEmpty() && form.accountId == null) {
            val (from, to) = defaultAccounts(accounts)
            vm.edit { copy(accountId = from, fromAccountId = from, toAccountId = to) }
        }
    }
    LaunchedEffect(message) {
        message?.let {
            if (it.res == R.string.add_saved) haptic.performHapticFeedback(HapticFeedbackType.Confirm)
            snackbar.showSnackbar(context.getString(it.res, it.arg))
            vm.consumeMessage()
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        snackbarHost = { SnackbarHost(snackbar, Modifier.navigationBarsPadding().imePadding()) },
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                GlassSurface(Modifier.size(44.dp), shape = CircleShape) {
                    IconButton(onClick = onBack, modifier = Modifier.fillMaxSize()) {
                        Icon(AppIcons.Back, stringResource(R.string.common_back))
                    }
                }
                Text(
                    stringResource(R.string.nav_add),
                    style = AppType.screenTitle,
                    modifier = Modifier.padding(start = 12.dp)
                )
            }

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
                CapsuleField(
                    value = form.description,
                    onValueChange = { v -> vm.edit { copy(description = v) } },
                    label = stringResource(R.string.add_description)
                )
                CapsuleField(
                    value = form.merchant,
                    onValueChange = { v -> vm.edit { copy(merchant = v) } },
                    label = stringResource(R.string.add_merchant)
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
                CapsuleField(
                    value = form.description,
                    onValueChange = { v -> vm.edit { copy(description = v) } },
                    label = stringResource(R.string.add_description)
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

            GradientButton(
                text = stringResource(if (form.saving) R.string.add_saving else R.string.add_save),
                onClick = vm::save,
                enabled = !form.saving
            )
            Spacer(Modifier.navigationBarsPadding().height(8.dp))
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
