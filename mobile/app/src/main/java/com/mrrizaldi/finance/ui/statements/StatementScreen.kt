package com.mrrizaldi.finance.ui.statements

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.remote.AppFindingDto
import com.mrrizaldi.finance.data.remote.StatementLineDto
import com.mrrizaldi.finance.data.remote.StatementTxDto
import com.mrrizaldi.finance.data.remote.StatementViewDto
import com.mrrizaldi.finance.data.remote.UploadFile
import com.mrrizaldi.finance.ui.components.CapsuleButton
import com.mrrizaldi.finance.ui.components.DropdownField
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.ScreenTopBar
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.RupiahFormat
import kotlin.math.abs
import kotlin.math.roundToLong

private const val ISO_DATE_LENGTH = 10

private fun rupiah(value: Double) = RupiahFormat.format(abs(value).roundToLong())

private fun signed(line: StatementLineDto) = (if (line.direction == "credit") "+" else "−") + rupiah(line.amount)

private fun describe(tx: StatementTxDto): String {
    val accounts = listOfNotNull(tx.account_name, tx.to_account_name).joinToString(" → ")
    val text = tx.description ?: tx.merchant ?: tx.type
    return "${tx.transaction_date.take(ISO_DATE_LENGTH)} ${rupiah(tx.amount)} $text · $accounts"
}

@Composable
fun StatementScreen(
    vm: StatementViewModel,
    sharedFiles: List<UploadFile>,
    onSharedConsumed: () -> Unit,
    onPickFiles: () -> Unit,
    onBack: () -> Unit
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val p = LocalPalette.current

    LaunchedEffect(sharedFiles) {
        if (sharedFiles.isNotEmpty()) {
            vm.setFiles(sharedFiles)
            onSharedConsumed()
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        ScreenTopBar(stringResource(R.string.statements_title), onBack)
        val view = state.view
        val result = state.result
        when {
            result != null -> Column(Modifier.fillMaxWidth().padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    stringResource(R.string.statements_done, result.inserted, result.moved, result.deleted),
                    style = AppType.rowTitle,
                    color = p.textHi
                )
                view?.header?.audit?.takeIf { abs(it.unexplained) >= 1 }?.let {
                    Text(stringResource(R.string.statements_audit_left, rupiah(it.unexplained)), color = p.textMute)
                }
                GradientButton(stringResource(R.string.statements_finish), onBack)
            }
            view == null -> SetupPane(
                state = state,
                accounts = accounts.map { it.id to it.name },
                onAccount = vm::setAccount,
                onPick = onPickFiles,
                onStart = vm::upload,
                onOpenExisting = vm::openExisting
            )
            else -> ReviewPane(
                view = view,
                busy = state.busy != null,
                error = state.error,
                onToggleLine = vm::toggleLine,
                onMarkNew = vm::markNew,
                onToggleFinding = vm::toggleFinding,
                onCommit = vm::commit,
                onDiscard = { vm.discard(onBack) }
            )
        }
    }
}

@Composable
private fun SetupPane(
    state: StatementState,
    accounts: List<Pair<String, String>>,
    onAccount: (String) -> Unit,
    onPick: () -> Unit,
    onStart: () -> Unit,
    onOpenExisting: () -> Unit
) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.statements_intro), color = p.textMute, style = AppType.rowMeta)
        DropdownField(
            label = stringResource(R.string.statements_account),
            options = accounts,
            selected = accounts.firstOrNull { it.first == state.accountId },
            optionLabel = { it.second },
            onSelect = { onAccount(it.first) }
        )
        CapsuleButton(stringResource(R.string.statements_pick_files), onPick, Modifier.fillMaxWidth())
        state.files.forEach { Text("• ${it.name}", color = p.textHi, style = AppType.rowMeta) }
        if (state.tooLarge) Text(stringResource(R.string.statements_too_large), color = p.negative)
        if (state.busy == StatementBusy.UPLOADING) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator()
                Text(stringResource(R.string.statements_reading), color = p.textMute)
            }
        } else {
            GradientButton(
                stringResource(R.string.statements_start),
                onStart,
                enabled = state.accountId != null && state.files.isNotEmpty() && !state.tooLarge
            )
        }
        state.error?.let { Text(it, color = p.negative) }
        if (state.existingImportId != null) {
            CapsuleButton(stringResource(R.string.statements_open_existing), onOpenExisting, Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun ReviewPane(
    view: StatementViewDto,
    busy: Boolean,
    error: String?,
    onToggleLine: (StatementLineDto) -> Unit,
    onMarkNew: (StatementLineDto) -> Unit,
    onToggleFinding: (AppFindingDto) -> Unit,
    onCommit: () -> Unit,
    onDiscard: () -> Unit
) {
    val p = LocalPalette.current
    val summary = summarize(view)
    val txById = view.transactions.associateBy { it.id }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 160.dp)) {
            item {
                Column(Modifier.padding(vertical = 8.dp)) {
                    val source = if (view.header.kind == "screenshot") stringResource(R.string.statements_kind_screenshot) else view.header.bank
                    Text(
                        "$source · ${view.header.period_start.orEmpty()} – ${view.header.period_end.orEmpty()}",
                        style = AppType.rowTitle,
                        color = p.textHi
                    )
                    if (view.header.integrity_ok == false) {
                        Text(stringResource(R.string.statements_integrity_failed), color = p.negative)
                    }
                    if (!summary.inReview) Text(stringResource(R.string.statements_already_committed), color = p.textMute)
                    view.header.audit?.takeIf { abs(it.unexplained) >= 1 }?.let {
                        Text(stringResource(R.string.statements_audit_left, rupiah(it.unexplained)), color = p.textMute)
                    }
                    if (summary.lowConfidenceCount > 0) {
                        Text(stringResource(R.string.statements_low_confidence_hint, summary.lowConfidenceCount), color = p.negative)
                    }
                }
            }
            summary.groups.forEach { (group, lines) ->
                item { SectionTitle(stringResource(group.titleRes(), lines.size)) }
                item {
                    GroupedCard(lines) { line ->
                        LineRow(line, line.matched_transaction_id?.let(txById::get), summary.inReview, onToggleLine, onMarkNew)
                    }
                }
            }
            if (view.header.app_findings.isNotEmpty()) {
                item { SectionTitle(stringResource(R.string.statements_group_findings, view.header.app_findings.size)) }
                item {
                    GroupedCard(view.header.app_findings) { finding ->
                        FindingRow(finding, txById[finding.transactionId], summary.inReview, onToggleFinding)
                    }
                }
            }
        }
        if (summary.inReview) {
            Column(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, p.bg, p.bg)))
                    .navigationBarsPadding()
                    .padding(top = 32.dp, bottom = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                error?.let { Text(it, color = p.negative, modifier = Modifier.padding(bottom = 8.dp)) }
                if (busy) {
                    CircularProgressIndicator()
                } else {
                    GradientButton(stringResource(R.string.statements_commit, summary.selectedCount), onCommit, enabled = summary.canCommit)
                    TextButton(onClick = onDiscard) { Text(stringResource(R.string.statements_discard), color = p.textMute) }
                }
            }
        }
    }
}

private fun LineGroup.titleRes() = when (this) {
    LineGroup.NEW -> R.string.statements_group_new
    LineGroup.OTHER_ACCOUNT -> R.string.statements_group_other_account
    LineGroup.PROBABLE -> R.string.statements_group_probable
    LineGroup.MATCHED -> R.string.statements_group_matched
    LineGroup.SKIPPED -> R.string.statements_group_skipped
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = AppType.rowMeta,
        fontWeight = FontWeight.SemiBold,
        color = LocalPalette.current.textMute,
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
    )
}

@Composable
private fun LineRow(
    line: StatementLineDto,
    matched: StatementTxDto?,
    editable: Boolean,
    onToggle: (StatementLineDto) -> Unit,
    onMarkNew: (StatementLineDto) -> Unit
) {
    val p = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (isToggleable(line)) {
            Checkbox(checked = line.selected, onCheckedChange = { onToggle(line) }, enabled = editable)
        } else {
            Spacer(Modifier.width(48.dp))
        }
        Column(Modifier.weight(1f)) {
            Row {
                Text(line.occurred_on, style = AppType.rowMeta, color = p.textMute, modifier = Modifier.weight(1f))
                Text(signed(line), style = AppType.rowTitle, color = if (line.direction == "credit") p.positive else p.negative)
            }
            Text(line.counterparty ?: line.description_raw.orEmpty(), style = AppType.rowMeta, color = p.textHi, maxLines = 2)
            matched?.let { Text(stringResource(R.string.statements_matched_with, describe(it)), style = AppType.rowMeta, color = p.textMute) }
            if (line.decision == "new" && isLowConfidence(line)) {
                Text(stringResource(R.string.statements_low_confidence), style = AppType.rowMeta, color = p.negative)
            }
            if (line.decision == "probable" && editable) {
                TextButton(onClick = { onMarkNew(line) }) { Text(stringResource(R.string.statements_mark_new)) }
            }
        }
    }
}

@Composable
private fun FindingRow(finding: AppFindingDto, tx: StatementTxDto?, editable: Boolean, onToggle: (AppFindingDto) -> Unit) {
    val p = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = finding.selected, onCheckedChange = { onToggle(finding) }, enabled = editable)
        Column(Modifier.weight(1f)) {
            Text(
                stringResource(if (finding.kind == "app_dup") R.string.statements_finding_dup else R.string.statements_finding_only),
                style = AppType.rowTitle,
                color = p.textHi
            )
            Text(tx?.let(::describe) ?: rupiah(finding.signedAmount), style = AppType.rowMeta, color = p.textMute)
        }
    }
}
