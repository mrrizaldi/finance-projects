package com.mrrizaldi.finance.ui.add

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerColors
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerColors
import androidx.compose.material3.TimePickerDefaults
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
import com.mrrizaldi.finance.ui.components.CancelButton
import com.mrrizaldi.finance.ui.components.CapsuleButton
import com.mrrizaldi.finance.ui.components.CapsuleField
import com.mrrizaldi.finance.ui.components.CheckRow
import com.mrrizaldi.finance.ui.components.DeleteTransactionDialog
import com.mrrizaldi.finance.ui.components.DropdownField
import com.mrrizaldi.finance.ui.components.GlassDialog
import com.mrrizaldi.finance.ui.components.GlassSegmented
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.components.ScreenTopBar
import com.mrrizaldi.finance.ui.components.TopBarButton
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
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
    val done by vm.done.collectAsStateWithLifecycle()
    val p = LocalPalette.current
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(done) {
        if (done) {
            haptic.performHapticFeedback(HapticFeedbackType.Confirm)
            onBack()
        }
    }
    LaunchedEffect(accounts) {
        if (accounts.isNotEmpty() && form.accountId == null) {
            val (from, to) = defaultAccounts(accounts)
            vm.edit { copy(accountId = from, fromAccountId = from, toAccountId = to) }
        }
    }
    LaunchedEffect(message) {
        message?.let {
            if (it.res == R.string.add_saved || it.res == R.string.add_saved_offline) haptic.performHapticFeedback(HapticFeedbackType.Confirm)
            snackbar.showSnackbar(context.getString(it.res, it.arg))
            vm.consumeMessage()
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        snackbarHost = { SnackbarHost(snackbar, Modifier.navigationBarsPadding().imePadding()) },
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            ScreenTopBar(
                title = stringResource(if (vm.editing) R.string.edit_title else R.string.add_title),
                onBack = onBack,
                modifier = Modifier.padding(horizontal = 16.dp),
                trailing = {
                    if (vm.editing) {
                        TopBarButton(
                            AppIcons.Trash,
                            stringResource(R.string.tx_delete),
                            { if (!form.saving) confirmDelete = true },
                            tint = p.negative
                        )
                    }
                }
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                GlassSegmented(
                    options = listOf(
                        stringResource(R.string.tx_type_expense),
                        stringResource(R.string.tx_type_income),
                        stringResource(R.string.tx_type_transfer)
                    ),
                    selected = form.kind.ordinal,
                    onSelect = { i -> vm.edit { withKind(AddKind.entries[i], categories) } }
                )

                if (form.kind != AddKind.TRANSFER) {
                    AmountField(form.amount, { v -> vm.edit { copy(amount = v) } }, stringResource(R.string.add_amount))
                    DropdownField(
                        label = stringResource(R.string.add_account),
                        options = accounts,
                        selected = accounts.firstOrNull { it.id == form.accountId },
                        optionLabel = { it.name },
                        onSelect = { a -> vm.edit { copy(accountId = a.id) } }
                    )
                    val visibleCategories = categories.filter { it.type == form.kind.type || it.type == "both" }
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
                    CheckRow(
                        text = stringResource(R.string.add_same_amount),
                        checked = form.sameAmount,
                        onCheckedChange = { v -> vm.edit { copy(sameAmount = v) } }
                    )
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
                    CapsuleButton(JakartaDate.formatDay(form.date, locale), { showDate = true }, Modifier.weight(1f))
                    CapsuleButton(form.time.format(DateTimeFormatter.ofPattern("HH:mm")), { showTime = true }, Modifier.weight(1f))
                }

                GradientButton(
                    text = stringResource(if (form.saving) R.string.add_saving else R.string.add_save),
                    onClick = vm::save,
                    enabled = !form.saving
                )
                Spacer(Modifier.navigationBarsPadding().height(8.dp))
            }
        }
    }

    if (confirmDelete) {
        DeleteTransactionDialog(
            label = form.description,
            amount = RupiahFormat.parse(form.amount) ?: 0L,
            onConfirm = {
                confirmDelete = false
                vm.delete()
            },
            onDismiss = { confirmDelete = false }
        )
    }

    if (showDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = form.date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        )
        GlassDialog(
            onDismiss = { showDate = false },
            actions = {
                CancelButton(stringResource(R.string.common_cancel), { showDate = false }, Modifier.weight(1f))
                GradientButton(
                    text = stringResource(R.string.common_ok),
                    onClick = {
                        state.selectedDateMillis?.let { ms ->
                            vm.edit { copy(date = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()) }
                        }
                        showDate = false
                    },
                    modifier = Modifier.weight(1f)
                )
            }
        ) {
            DatePicker(state = state, colors = glassDateColors())
        }
    }

    if (showTime) {
        val state = rememberTimePickerState(initialHour = form.time.hour, initialMinute = form.time.minute, is24Hour = true)
        GlassDialog(
            onDismiss = { showTime = false },
            title = stringResource(R.string.add_time_title),
            actions = {
                CancelButton(stringResource(R.string.common_cancel), { showTime = false }, Modifier.weight(1f))
                GradientButton(
                    text = stringResource(R.string.common_ok),
                    onClick = {
                        vm.edit { copy(time = LocalTime.of(state.hour, state.minute)) }
                        showTime = false
                    },
                    modifier = Modifier.weight(1f)
                )
            }
        ) {
            Box(Modifier.fillMaxWidth().padding(top = 20.dp), contentAlignment = Alignment.Center) {
                TimePicker(state = state, colors = glassTimeColors())
            }
        }
    }
}

@Composable
private fun glassDateColors(): DatePickerColors {
    val p = LocalPalette.current
    return DatePickerDefaults.colors(
        containerColor = Color.Transparent,
        titleContentColor = p.textMute,
        headlineContentColor = p.textHi,
        weekdayContentColor = p.textMute,
        subheadContentColor = p.textMute,
        navigationContentColor = p.textHi,
        yearContentColor = p.textHi,
        disabledYearContentColor = p.textDim,
        currentYearContentColor = p.primary,
        selectedYearContentColor = p.primaryFg,
        selectedYearContainerColor = p.primary,
        dayContentColor = p.textHi,
        disabledDayContentColor = p.textDim,
        selectedDayContentColor = p.primaryFg,
        selectedDayContainerColor = p.primary,
        todayContentColor = p.primary,
        todayDateBorderColor = p.primary,
        dividerColor = LocalGlass.current.divider
    )
}

@Composable
private fun glassTimeColors(): TimePickerColors {
    val p = LocalPalette.current
    return TimePickerDefaults.colors(
        clockDialColor = p.surfaceHi,
        clockDialSelectedContentColor = p.primaryFg,
        clockDialUnselectedContentColor = p.textHi,
        selectorColor = p.primary,
        containerColor = Color.Transparent,
        timeSelectorSelectedContainerColor = p.primarySoft,
        timeSelectorUnselectedContainerColor = p.surfaceHi,
        timeSelectorSelectedContentColor = p.primary,
        timeSelectorUnselectedContentColor = p.textHi
    )
}
