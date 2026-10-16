package id.aigra.finance

import android.content.Context
import androidx.room.Room
import id.aigra.finance.auth.SessionStore
import id.aigra.finance.data.Repository
import id.aigra.finance.data.local.FinanceDb
import id.aigra.finance.data.remote.SupabaseApi
import id.aigra.finance.data.remote.SupabaseApiImpl
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.ktor.client.engine.okhttp.OkHttp
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

    val db: FinanceDb = Room.databaseBuilder(appContext, FinanceDb::class.java, "finance.db")
        .fallbackToDestructiveMigration(true)
        .build()

    val repository by lazy {
        Repository(
            api = api,
            accountDao = db.accountDao(),
            categoryDao = db.categoryDao(),
            transactionDao = db.transactionDao(),
            snapshotDao = db.snapshotDao(),
            syncMetaDao = db.syncMetaDao()
        )
    }
}
