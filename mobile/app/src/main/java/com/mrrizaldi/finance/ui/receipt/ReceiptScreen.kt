package com.mrrizaldi.finance.ui.receipt

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.remote.ReceiptCandidateDto
import com.mrrizaldi.finance.data.remote.UploadFile
import com.mrrizaldi.finance.ui.components.AmountField
import com.mrrizaldi.finance.ui.components.CancelButton
import com.mrrizaldi.finance.ui.components.CapsuleButton
import com.mrrizaldi.finance.ui.components.CapsuleField
import com.mrrizaldi.finance.ui.components.DangerButton
import com.mrrizaldi.finance.ui.components.DropdownField
import com.mrrizaldi.finance.ui.components.GlassDialog
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.ScreenTopBar
import com.mrrizaldi.finance.ui.components.SectionLabel
import com.mrrizaldi.finance.ui.components.TopBarButton
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

private fun formatWhen(timestamp: String?, locale: Locale): String? =
    timestamp?.let { runCatching { JakartaDate.formatTimestamp(it, locale) }.getOrDefault(it) }

private fun digitsOf(amount: Long): String = if (amount == 0L) "" else abs(amount).toString()

@Composable
fun ReceiptScreen(
    vm: ReceiptViewModel,
    uploads: List<UploadFile>,
    onUploadsConsumed: () -> Unit,
    onCamera: () -> Unit,
    onPickFiles: () -> Unit,
    onBack: () -> Unit
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val p = LocalPalette.current
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(uploads) {
        if (uploads.isNotEmpty()) {
            vm.upload(uploads)
            onUploadsConsumed()
        }
    }
    LaunchedEffect(state.done) {
        if (state.done) onBack()
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        ScreenTopBar(
            title = stringResource(R.string.receipt_title),
            onBack = onBack,
            modifier = Modifier.padding(horizontal = 16.dp),
            trailing = {
                if (state.exists && state.busy == null) {
                    TopBarButton(AppIcons.Trash, stringResource(R.string.receipt_delete), { confirmDelete = true }, tint = p.negative)
                }
            }
        )
        Column(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(top = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val message = state.error ?: state.errorRes?.let { stringResource(it) }
            message?.let { Text(it, color = p.negative, style = AppType.rowMeta) }
            when {
                state.busy == ReceiptBusy.LOADING -> Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                state.busy == ReceiptBusy.UPLOADING -> Row(
                    Modifier.padding(top = 24.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    CircularProgressIndicator()
                    Text(stringResource(R.string.receipt_reading), color = p.textMute)
                }
                state.alreadyItemized -> {
                    Text(stringResource(R.string.receipt_already), style = AppType.rowTitle, color = p.textHi)
                    CapsuleButton(stringResource(R.string.receipt_close), onBack, Modifier.fillMaxWidth())
                }
                !state.editing -> EmptyPane(state.transactionId != null, onCamera, onPickFiles, vm::startManual)
                else -> ReviewPane(state, vm, accounts, categories)
            }
            Spacer(Modifier.navigationBarsPadding().height(8.dp))
        }
    }

    if (confirmDelete) {
        GlassDialog(
            onDismiss = { confirmDelete = false },
            title = stringResource(R.string.receipt_delete_title),
            body = stringResource(R.string.receipt_delete_body),
            actions = {
                CancelButton(stringResource(R.string.common_cancel), { confirmDelete = false }, Modifier.weight(1f))
                DangerButton(
                    stringResource(R.string.receipt_delete),
                    {
                        confirmDelete = false
                        vm.delete()
                    },
                    Modifier.weight(1f)
                )
            }
        )
    }
}

@Composable
private fun EmptyPane(canTypeManually: Boolean, onCamera: () -> Unit, onPickFiles: () -> Unit, onManual: () -> Unit) {
    Text(stringResource(R.string.receipt_intro), color = LocalPalette.current.textMute, style = AppType.rowMeta)
    CapsuleButton(stringResource(R.string.receipt_camera), onCamera, Modifier.fillMaxWidth())
    CapsuleButton(stringResource(R.string.receipt_pick), onPickFiles, Modifier.fillMaxWidth())
    if (canTypeManually) CapsuleButton(stringResource(R.string.receipt_manual), onManual, Modifier.fillMaxWidth())
}

@Composable
private fun ReviewPane(state: ReceiptState, vm: ReceiptViewModel, accounts: List<AccountEntity>, categories: List<CategoryEntity>) {
    val p = LocalPalette.current
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0]
    val categoryOptions = listOf<Pair<String?, String>>(null to stringResource(R.string.receipt_follow_parent)) +
        categories.map { it.id to it.name }

    val header = listOfNotNull(state.merchant, formatWhen(state.purchasedAt, locale), state.printedTotal?.let(RupiahFormat::format))
    if (header.isNotEmpty()) Text(header.joinToString(" · "), style = AppType.rowTitle, color = p.textHi)
    if (!state.totalOk && state.printedTotal != null) {
        Text(stringResource(R.string.receipt_total_mismatch), color = p.negative, style = AppType.rowMeta)
    }
    if (state.extractionError != null) {
        Text(stringResource(R.string.receipt_extract_failed), color = p.negative, style = AppType.rowMeta)
    }
    state.files.firstOrNull()?.let { file ->
        CapsuleButton(
            stringResource(R.string.receipt_view_file),
            { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(file.url))) },
            Modifier.fillMaxWidth()
        )
    }

    if (state.transactionId == null) {
        SectionLabel(stringResource(R.string.receipt_match_title))
        GroupedCard {
            state.candidates.forEach { candidate ->
                ChoiceRow(describe(candidate, locale), state.chosenCandidateId == candidate.id && !state.createNew) {
                    vm.chooseCandidate(candidate.id)
                }
            }
            ChoiceRow(stringResource(R.string.receipt_new_tx), state.createNew) { vm.chooseCandidate(null) }
        }
        if (state.createNew) {
            DropdownField(
                label = stringResource(R.string.add_account),
                options = accounts,
                selected = accounts.firstOrNull { it.id == state.newAccountId },
                optionLabel = { it.name },
                onSelect = { a -> vm.editNew { copy(newAccountId = a.id) } }
            )
            AmountField(state.newAmount, { v -> vm.editNew { copy(newAmount = v) } }, stringResource(R.string.add_amount))
            DropdownField(
                label = stringResource(R.string.add_category),
                options = categories,
                selected = categories.firstOrNull { it.id == state.newCategoryId },
                optionLabel = { it.name },
                onSelect = { c -> vm.editNew { copy(newCategoryId = c.id) } }
            )
        }
    }

    SectionLabel(stringResource(R.string.receipt_items))
    state.lines.forEachIndexed { index, line ->
        if (line.kind != KIND_ITEM) return@forEachIndexed
        GroupedCard {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CapsuleField(line.name, { v -> vm.updateLine(index, line.copy(name = v)) }, stringResource(R.string.receipt_item_name))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AmountField(
                        digitsOf(line.amount),
                        { v -> vm.updateLine(index, line.copy(amount = v.toLongOrNull() ?: 0L)) },
                        stringResource(R.string.add_amount),
                        Modifier.weight(1f)
                    )
                    TopBarButton(AppIcons.Trash, stringResource(R.string.receipt_remove_item), { vm.removeLine(index) }, tint = p.negative)
                }
                DropdownField(
                    label = stringResource(R.string.add_category),
                    options = categoryOptions,
                    selected = categoryOptions.firstOrNull { it.first == line.categoryId },
                    optionLabel = { it.second },
                    onSelect = { (id, _) -> vm.updateLine(index, line.copy(categoryId = id)) }
                )
            }
        }
    }
    CapsuleButton(stringResource(R.string.receipt_add_item), vm::addItem, Modifier.fillMaxWidth())

    if (state.lines.any { it.kind in ADJUSTMENT_KINDS }) {
        SectionLabel(stringResource(R.string.receipt_adjustments))
        state.lines.forEachIndexed { index, line ->
            if (line.kind !in ADJUSTMENT_KINDS) return@forEachIndexed
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CapsuleField(
                    line.name,
                    { v -> vm.updateLine(index, line.copy(name = v)) },
                    stringResource(R.string.receipt_item_name),
                    Modifier.weight(1f)
                )
                AmountField(
                    digitsOf(line.amount),
                    { v -> vm.updateLine(index, line.copy(amount = signedAdjustment(line.kind, v.toLongOrNull() ?: 0L, line.amount))) },
                    if (line.amount < 0) "−" else "+",
                    Modifier.weight(1f)
                )
            }
        }
    }

    state.effectiveParentAmount?.let { parentAmount ->
        val names = categories.associate { it.id to it.name }
        SectionLabel(stringResource(R.string.receipt_allocation))
        GroupedCard {
            allocate(parentAmount, state.effectiveParentCategoryId, state.lines).forEach { slice ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                    Text(
                        slice.categoryId?.let(names::get) ?: stringResource(R.string.receipt_uncategorized),
                        style = AppType.rowTitle,
                        color = p.textHi,
                        modifier = Modifier.weight(1f)
                    )
                    Text(RupiahFormat.format(slice.amount), style = AppType.rowTitle, color = p.textHi)
                }
            }
        }
    }
    GradientButton(
        stringResource(if (state.busy == ReceiptBusy.SAVING) R.string.receipt_saving else R.string.receipt_save),
        vm::save,
        enabled = state.canSave
    )
}

private fun describe(candidate: ReceiptCandidateDto, locale: Locale): String = listOfNotNull(
    candidate.account_name,
    candidate.merchant ?: candidate.description,
    formatWhen(candidate.transaction_date, locale),
    RupiahFormat.format(candidate.amount.roundToLong())
).joinToString(" · ")

@Composable
private fun ChoiceRow(text: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(text, style = AppType.rowMeta, color = LocalPalette.current.textHi, modifier = Modifier.padding(start = 8.dp))
    }
}
