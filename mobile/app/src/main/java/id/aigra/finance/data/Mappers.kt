package id.aigra.finance.data

import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.data.remote.AccountDto
import id.aigra.finance.data.remote.CategoryDto
import id.aigra.finance.data.remote.TransactionDto
import id.aigra.finance.util.JakartaDate
import kotlin.math.roundToLong

fun AccountDto.toEntity() = AccountEntity(
    id = id,
    name = name,
    type = type,
    balance = balance.roundToLong(),
    color = color,
    isActive = is_active
)

fun CategoryDto.toEntity() = CategoryEntity(
    id = id,
    name = name,
    type = type,
    color = color,
    budgetMonthly = budget_monthly?.roundToLong(),
    sortOrder = sort_order,
    isActive = is_active
)

fun TransactionDto.toEntity() = TransactionEntity(
    id = id,
    type = type,
    amount = amount.roundToLong(),
    transactionDate = transaction_date,
    dateKey = JakartaDate.dateKey(transaction_date),
    toAmount = to_amount?.roundToLong(),
    description = description,
    merchant = merchant,
    categoryId = category_id,
    accountId = account_id,
    toAccountId = to_account_id,
    source = source,
    isAdjustment = is_adjustment,
    balanceAfter = balance_after?.roundToLong(),
    categoryName = category_name,
    categoryColor = category_color,
    accountName = account_name,
    toAccountName = to_account_name
)
