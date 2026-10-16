package id.aigra.finance.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.exception.NoSessionFoundException
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException
import java.security.GeneralSecurityException

class SessionStore(private val context: Context) : SessionManager {

    private val prefs: SharedPreferences by lazy {
        try {
            open()
        } catch (e: GeneralSecurityException) {
            reset()
        } catch (e: IOException) {
            reset()
        }
    }

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun saveSession(session: UserSession) {
        prefs.edit().putString(KEY, json.encodeToString(session)).apply()
    }

    override suspend fun loadSession(): UserSession {
        val session = try {
            prefs.getString(KEY, null)?.let { json.decodeFromString<UserSession>(it) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            runCatching { deleteSession() }
            null
        }
        return session ?: throw NoSessionFoundException()
    }

    override suspend fun deleteSession() {
        prefs.edit().remove(KEY).apply()
    }

    private fun open(): SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private fun reset(): SharedPreferences {
        context.deleteSharedPreferences(PREFS)
        return open()
    }

    private companion object {
        const val PREFS = "session"
        const val KEY = "user_session"
    }
}
