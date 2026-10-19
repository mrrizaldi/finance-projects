package com.mrrizaldi.finance.ui.statements

import com.mrrizaldi.finance.data.remote.StatementLineDto
import com.mrrizaldi.finance.data.remote.StatementViewDto

const val AUTO_SELECT_MIN_CONFIDENCE = 0.8

private const val STATUS_REVIEW = "review"
private val COMMITTABLE_DECISIONS = setOf("new", "other_account")

enum class LineGroup(val decisions: Set<String>) {
    NEW(setOf("new")),
    OTHER_ACCOUNT(setOf("other_account")),
    PROBABLE(setOf("probable")),
    MATCHED(setOf("match", "transfer_pair")),
    SKIPPED(setOf("skip"))
}

data class ReviewSummary(
    val groups: List<Pair<LineGroup, List<StatementLineDto>>>,
    val selectedCount: Int,
    val lowConfidenceCount: Int,
    val canCommit: Boolean,
    val inReview: Boolean
)

fun isToggleable(line: StatementLineDto): Boolean = line.decision in COMMITTABLE_DECISIONS

fun isLowConfidence(line: StatementLineDto): Boolean = line.confidence < AUTO_SELECT_MIN_CONFIDENCE

fun summarize(view: StatementViewDto): ReviewSummary {
    val groups = LineGroup.entries
        .map { group -> group to view.lines.filter { it.decision in group.decisions } }
        .filter { (_, lines) -> lines.isNotEmpty() }
    val selectedLines = view.lines.count { it.selected && isToggleable(it) }
    val selectedFindings = view.header.app_findings.count { it.selected }
    val inReview = view.header.status == STATUS_REVIEW
    val selectedCount = selectedLines + selectedFindings
    return ReviewSummary(
        groups = groups,
        selectedCount = selectedCount,
        lowConfidenceCount = view.lines.count { it.decision == "new" && isLowConfidence(it) },
        canCommit = inReview && view.header.integrity_ok != false && selectedCount > 0,
        inReview = inReview
    )
}

fun StatementViewDto.withLineSelected(lineId: String, selected: Boolean): StatementViewDto =
    copy(lines = lines.map { if (it.id == lineId) it.copy(selected = selected) else it })

fun StatementViewDto.withLineMarkedNew(lineId: String): StatementViewDto =
    copy(lines = lines.map { if (it.id == lineId) it.copy(decision = "new", selected = true) else it })

fun StatementViewDto.withFindingSelected(transactionId: String, selected: Boolean): StatementViewDto =
    copy(
        header = header.copy(
            app_findings = header.app_findings.map {
                if (it.transactionId == transactionId) it.copy(selected = selected) else it
            }
        )
    )
