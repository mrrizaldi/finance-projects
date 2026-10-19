package com.mrrizaldi.finance.ui.receipt

data class ReceiptLine(val kind: String, val name: String, val qty: Double, val amount: Long, val categoryId: String?)

data class Slice(val categoryId: String?, val amount: Long)

const val KIND_ITEM = "item"
val ADJUSTMENT_KINDS = listOf("discount", "service", "tax", "rounding")

fun allocate(parentAmount: Long, parentCategoryId: String?, lines: List<ReceiptLine>): List<Slice> {
    val items = lines.filter { it.kind == KIND_ITEM && it.amount > 0 }
    val itemSum = items.sumOf { it.amount }
    if (itemSum == 0L) return listOf(Slice(parentCategoryId, parentAmount))
    val basis = minOf(lines.sumOf { it.amount }.coerceAtLeast(0), parentAmount)
    val grouped = items
        .groupBy { it.categoryId ?: parentCategoryId }
        .map { (category, group) -> category to group.sumOf { it.amount } * basis }
    val floors = grouped.associate { (category, scaled) -> category to scaled / itemSum }.toMutableMap()
    val byRemainder = grouped.sortedByDescending { (_, scaled) -> scaled % itemSum }
    val extra = (basis - floors.values.sum()).toInt()
    byRemainder.take(extra).forEach { (category, _) -> floors[category] = floors.getValue(category) + 1 }
    floors[parentCategoryId] = (floors[parentCategoryId] ?: 0L) + (parentAmount - basis)
    return floors.filter { it.value > 0 }.map { Slice(it.key, it.value) }.sortedByDescending { it.amount }
}
