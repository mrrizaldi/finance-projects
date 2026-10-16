package id.aigra.finance.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "accounts")
data class AccountEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val balance: Long,
    val color: String?,
    val isActive: Boolean
)

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val color: String?,
    val budgetMonthly: Long?,
    val sortOrder: Int,
    val isActive: Boolean
)

@Entity(tableName = "transactions", indices = [Index("dateKey")])
data class TransactionEntity(
    @PrimaryKey val id: String,
    val type: String,
    val amount: Long,
    val transactionDate: String,
    val dateKey: String,
    val toAmount: Long? = null,
    val description: String? = null,
    val merchant: String? = null,
    val categoryId: String? = null,
    val accountId: String? = null,
    val toAccountId: String? = null,
    val source: String = "manual_web",
    val isAdjustment: Boolean = false,
    val balanceAfter: Long? = null,
    val categoryName: String? = null,
    val categoryColor: String? = null,
    val accountName: String? = null,
    val toAccountName: String? = null,
    val pending: Boolean = false
)

@Entity(tableName = "rpc_snapshots")
data class RpcSnapshot(
    @PrimaryKey val key: String,
    val json: String,
    val fetchedAt: Long
)

@Entity(tableName = "sync_meta")
data class SyncMeta(
    @PrimaryKey val id: Int = 1,
    val lastSuccessAt: Long? = null,
    val ownerId: String? = null
)
