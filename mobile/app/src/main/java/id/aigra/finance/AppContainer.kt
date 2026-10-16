package id.aigra.finance

import android.content.Context
import id.aigra.finance.auth.SessionStore
import id.aigra.finance.data.remote.SupabaseApi
import id.aigra.finance.data.remote.SupabaseApiImpl
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.ktor.client.engine.okhttp.OkHttp

class AppContainer(context: Context) {

    val supabase: SupabaseClient = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY
    ) {
        httpEngine = OkHttp.create()
        install(Auth) {
            sessionManager = SessionStore(context)
        }
        install(Postgrest)
    }

    val api: SupabaseApi = SupabaseApiImpl(supabase)
}
