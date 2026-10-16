package id.aigra.finance.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface AccountDao {
    @Query("SELECT * FROM accounts WHERE isActive = 1 ORDER BY balance DESC")
    fun observeActive(): Flow<List<AccountEntity>>

    @Query("DELETE FROM accounts")
    suspend fun deleteAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<AccountEntity>)

    @Transaction
    suspend fun replaceAll(rows: List<AccountEntity>) {
        deleteAll()
        insertAll(rows)
    }
}

@Dao
interface CategoryDao {
    @Query("SELECT * FROM categories WHERE isActive = 1 ORDER BY sortOrder ASC, name ASC")
    fun observeActive(): Flow<List<CategoryEntity>>

    @Query("DELETE FROM categories")
    suspend fun deleteAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<CategoryEntity>)

    @Transaction
    suspend fun replaceAll(rows: List<CategoryEntity>) {
        deleteAll()
        insertAll(rows)
    }
}

@Dao
interface TransactionDao {
    @Query(
        """
        SELECT * FROM transactions
        WHERE dateKey BETWEEN :start AND :end
          AND (:type IS NULL OR type = :type)
          AND (:accountId IS NULL OR accountId = :accountId OR toAccountId = :accountId)
          AND (:categoryId IS NULL OR categoryId = :categoryId)
          AND (:search IS NULL OR description LIKE '%' || :search || '%' ESCAPE '\' OR merchant LIKE '%' || :search || '%' ESCAPE '\')
        ORDER BY transactionDate DESC
        """
    )
    fun observe(
        start: String,
        end: String,
        type: String?,
        accountId: String?,
        categoryId: String?,
        search: String?
    ): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions ORDER BY transactionDate DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<TransactionEntity>>

    @Query("DELETE FROM transactions WHERE dateKey BETWEEN :start AND :end AND pending = 0")
    suspend fun deleteRange(start: String, end: String)

    @Query("DELETE FROM transactions")
    suspend fun deleteAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<TransactionEntity>)

    @Transaction
    suspend fun replaceRange(start: String, end: String, rows: List<TransactionEntity>) {
        deleteRange(start, end)
        insertAll(rows)
    }
}

@Dao
interface SnapshotDao {
    @Query("SELECT * FROM rpc_snapshots WHERE `key` = :key")
    fun observe(key: String): Flow<RpcSnapshot?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: RpcSnapshot)

    @Query("DELETE FROM rpc_snapshots")
    suspend fun deleteAll()
}

@Dao
interface SyncMetaDao {
    @Query("SELECT * FROM sync_meta WHERE id = 1")
    fun observe(): Flow<SyncMeta?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: SyncMeta)

    @Query("DELETE FROM sync_meta")
    suspend fun deleteAll()
}
