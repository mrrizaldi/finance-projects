package com.mrrizaldi.finance.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        AccountEntity::class,
        CategoryEntity::class,
        TransactionEntity::class,
        RpcSnapshot::class,
        SyncMeta::class,
        Outbox::class
    ],
    version = 3,
    exportSchema = false
)
abstract class FinanceDb : RoomDatabase() {
    abstract fun accountDao(): AccountDao
    abstract fun categoryDao(): CategoryDao
    abstract fun transactionDao(): TransactionDao
    abstract fun snapshotDao(): SnapshotDao
    abstract fun syncMetaDao(): SyncMetaDao
    abstract fun outboxDao(): OutboxDao

    companion object {
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `outbox` (" +
                        "`clientId` TEXT NOT NULL, `ownerId` TEXT NOT NULL, `kind` TEXT NOT NULL, " +
                        "`payloadJson` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, `attempts` INTEGER NOT NULL, " +
                        "`lastError` TEXT, PRIMARY KEY(`clientId`))"
                )
            }
        }
    }
}
