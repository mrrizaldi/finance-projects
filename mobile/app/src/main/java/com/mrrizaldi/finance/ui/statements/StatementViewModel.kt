package com.mrrizaldi.finance.ui.statements

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.remote.AppFindingDto
import com.mrrizaldi.finance.data.remote.CommitResultDto
import com.mrrizaldi.finance.data.remote.StatementApi
import com.mrrizaldi.finance.data.remote.StatementApiException
import com.mrrizaldi.finance.data.remote.StatementLineDto
import com.mrrizaldi.finance.data.remote.StatementViewDto
import com.mrrizaldi.finance.data.remote.UploadFile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val STOP_TIMEOUT_MS = 5_000L
private const val MAX_UPLOAD_BYTES = 20L * 1024 * 1024

enum class StatementBusy { UPLOADING, COMMITTING }

data class StatementState(
    val accountId: String? = null,
    val files: List<UploadFile> = emptyList(),
    val view: StatementViewDto? = null,
    val busy: StatementBusy? = null,
    val error: String? = null,
    val tooLarge: Boolean = false,
    val existingImportId: String? = null,
    val result: CommitResultDto? = null
)

class StatementViewModel(
    private val api: StatementApi,
    accounts: Flow<List<AccountEntity>>,
    private val onCommitted: suspend () -> Unit
) : ViewModel() {
    private val _state = MutableStateFlow(StatementState())
    val state: StateFlow<StatementState> = _state.asStateFlow()

    val accounts: StateFlow<List<AccountEntity>> =
        accounts.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    fun setAccount(id: String) = _state.update { it.copy(accountId = id) }

    fun setFiles(files: List<UploadFile>) = _state.update {
        it.copy(files = files, tooLarge = files.sumOf { f -> f.bytes.size.toLong() } > MAX_UPLOAD_BYTES, error = null)
    }

    fun upload() {
        val current = _state.value
        val accountId = current.accountId ?: return
        if (current.files.isEmpty() || current.tooLarge || current.busy != null) return
        _state.update { it.copy(busy = StatementBusy.UPLOADING, error = null, existingImportId = null) }
        viewModelScope.launch {
            try {
                val view = api.upload(accountId, current.files)
                _state.update { it.copy(busy = null, view = view, files = emptyList()) }
            } catch (e: StatementApiException) {
                _state.update { it.copy(busy = null, error = e.message, existingImportId = e.existingImportId) }
            } catch (e: Exception) {
                _state.update { it.copy(busy = null, error = e.message ?: e.javaClass.simpleName) }
            }
        }
    }

    fun openExisting() {
        val id = _state.value.existingImportId ?: return
        viewModelScope.launch {
            runCatching { api.view(id) }
                .onSuccess { view -> _state.update { it.copy(view = view, error = null, existingImportId = null, files = emptyList()) } }
                .onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    private fun optimistic(change: (StatementViewDto) -> StatementViewDto, call: suspend (String) -> Unit) {
        val before = _state.value.view ?: return
        _state.update { it.copy(view = change(before), error = null) }
        viewModelScope.launch {
            runCatching { call(before.header.id) }.onFailure { e ->
                _state.update { it.copy(view = before, error = e.message) }
            }
        }
    }

    fun toggleLine(line: StatementLineDto) {
        if (!isToggleable(line)) return
        val next = !line.selected
        optimistic({ it.withLineSelected(line.id, next) }) { importId -> api.setLineSelected(importId, line.id, next) }
    }

    fun markNew(line: StatementLineDto) {
        if (line.decision != "probable") return
        optimistic({ it.withLineMarkedNew(line.id) }) { importId -> api.markLineNew(importId, line.id) }
    }

    fun toggleFinding(finding: AppFindingDto) {
        val next = !finding.selected
        optimistic({ it.withFindingSelected(finding.transactionId, next) }) { importId ->
            api.setFindingSelected(importId, finding.transactionId, next)
        }
    }

    fun commit() {
        val view = _state.value.view ?: return
        if (!summarize(view).canCommit || _state.value.busy != null) return
        _state.update { it.copy(busy = StatementBusy.COMMITTING, error = null) }
        viewModelScope.launch {
            try {
                val result = api.commit(view.header.id)
                _state.update { it.copy(busy = null, result = result) }
                runCatching { onCommitted() }
            } catch (e: Exception) {
                _state.update { it.copy(busy = null, error = e.message) }
            }
        }
    }

    fun discard(onDone: () -> Unit) {
        val view = _state.value.view
        viewModelScope.launch {
            if (view != null && view.header.status == "review") runCatching { api.discard(view.header.id) }
            onDone()
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }
}
