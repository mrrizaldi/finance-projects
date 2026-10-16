package id.aigra.finance.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        AccountEntity::class,
        CategoryEntity::class,
        TransactionEntity::class,
        RpcSnapshot::class,
        SyncMeta::class
    ],
    version = 1,
    exportSchema = false
)
abstract class FinanceDb : RoomDatabase() {
    abstract fun accountDao(): AccountDao
    abstract fun categoryDao(): CategoryDao
    abstract fun transactionDao(): TransactionDao
    abstract fun snapshotDao(): SnapshotDao
    abstract fun syncMetaDao(): SyncMetaDao
}
