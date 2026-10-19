package com.mrrizaldi.finance

import android.content.Context
import androidx.glance.appwidget.updateAll
import androidx.room.Room
import com.mrrizaldi.finance.auth.SessionStore
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.local.FinanceDb
import com.mrrizaldi.finance.data.remote.SupabaseApi
import com.mrrizaldi.finance.data.remote.StatementApi
import com.mrrizaldi.finance.data.remote.StatementApiImpl
import com.mrrizaldi.finance.data.remote.SupabaseApiImpl
import com.mrrizaldi.finance.data.remote.UploadFile
import com.mrrizaldi.finance.lock.AppLock
import com.mrrizaldi.finance.sync.Sync
import com.mrrizaldi.finance.widget.BalanceWidget
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.Json

class AppContainer(context: Context) {

    private val appContext = context.applicationContext

    private val sessionStore by lazy { SessionStore(appContext) }

    val supabase: SupabaseClient by lazy {
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY
        ) {
            httpEngine = OkHttp.create()
            defaultSerializer = KotlinXSerializer(Json { ignoreUnknownKeys = true; coerceInputValues = true })
            install(Auth) {
                sessionManager = sessionStore
            }
            install(Postgrest)
        }
    }

    val api: SupabaseApi by lazy { SupabaseApiImpl(supabase) }

    val statements: StatementApi by lazy {
        StatementApiImpl(BuildConfig.FINANCE_API_URL) { api.awaitSession()?.accessToken }
    }

    val sharedUploads = MutableStateFlow<List<UploadFile>>(emptyList())

    val lock by lazy { AppLock(appContext) }

    val db: FinanceDb = Room.databaseBuilder(appContext, FinanceDb::class.java, "finance.db")
        .addMigrations(FinanceDb.MIGRATION_2_3)
        .fallbackToDestructiveMigrationFrom(true, 1)
        .build()

    val repository by lazy {
        Repository(
            api = api,
            accountDao = db.accountDao(),
            categoryDao = db.categoryDao(),
            transactionDao = db.transactionDao(),
            snapshotDao = db.snapshotDao(),
            syncMetaDao = db.syncMetaDao(),
            outboxDao = db.outboxDao(),
            onRefreshed = { BalanceWidget().updateAll(appContext) },
            scheduleFlush = { Sync.flush(appContext) }
        )
    }
}
