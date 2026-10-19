package com.mrrizaldi.finance.ui.receipt

import kotlin.math.roundToLong

data class ReceiptLine(val kind: String, val name: String, val qty: Double, val amount: Long, val categoryId: String?)

data class Slice(val categoryId: String?, val amount: Long)

const val KIND_ITEM = "item"
val ADJUSTMENT_KINDS = listOf("discount", "service", "tax", "rounding")

fun allocate(parentAmount: Long, parentCategoryId: String?, lines: List<ReceiptLine>): List<Slice> {
    val items = lines.filter { it.kind == KIND_ITEM && it.amount > 0 }
    val itemSum = items.sumOf { it.amount }
    if (itemSum == 0L) return listOf(Slice(parentCategoryId, parentAmount))
    val basis = minOf(lines.sumOf { it.amount }.coerceAtLeast(0), parentAmount)
    val byCategory = items
        .groupBy { it.categoryId ?: parentCategoryId }
        .mapValues { (_, group) -> (group.sumOf { it.amount }.toDouble() * basis / itemSum).roundToLong() }
    val rest = parentAmount - byCategory.values.sum()
    val merged = byCategory + (parentCategoryId to (byCategory[parentCategoryId] ?: 0L) + rest)
    return merged.filter { it.value > 0 }.map { Slice(it.key, it.value) }.sortedByDescending { it.amount }
}
