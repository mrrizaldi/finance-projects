package com.mrrizaldi.finance.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.content.TextContent
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlin.io.encoding.Base64

@Serializable
data class StatementAuditDto(
    val statementClosing: Double,
    val appClosing: Double,
    val explained: Double,
    val unexplained: Double
)

@Serializable
data class AppFindingDto(
    val transactionId: String,
    val kind: String,
    val relatedLineId: String? = null,
    val selected: Boolean,
    val signedAmount: Double
)

@Serializable
data class StatementImportDto(
    val id: String,
    val account_id: String,
    val kind: String,
    val bank: String,
    val status: String,
    val period_start: String? = null,
    val period_end: String? = null,
    val integrity_ok: Boolean? = null,
    val opening_balance: Double? = null,
    val closing_balance: Double? = null,
    val audit: StatementAuditDto? = null,
    val app_findings: List<AppFindingDto> = emptyList()
)

@Serializable
data class StatementLineDto(
    val id: String,
    val line_no: Int,
    val occurred_on: String,
    val occurred_time: String? = null,
    val amount: Double,
    val direction: String,
    val description_raw: String? = null,
    val counterparty: String? = null,
    val decision: String,
    val selected: Boolean,
    val confidence: Double = 1.0,
    val matched_transaction_id: String? = null,
    val committed_transaction_id: String? = null
)

@Serializable
data class StatementTxDto(
    val id: String,
    val type: String,
    val amount: Double,
    val transaction_date: String,
    val description: String? = null,
    val merchant: String? = null,
    val account_name: String? = null,
    val to_account_name: String? = null
)

@Serializable
data class StatementViewDto(
    @SerialName("import") val header: StatementImportDto,
    val lines: List<StatementLineDto>,
    val transactions: List<StatementTxDto> = emptyList()
)

@Serializable
data class CommitResultDto(val inserted: Int, val moved: Int, val deleted: Int)

@Serializable
private data class ErrorDto(val error: String? = null, val import_id: String? = null, val transaction_id: String? = null)

@Serializable
private data class DataEnvelope<T>(val data: T)

data class UploadFile(val name: String, val bytes: ByteArray)

class StatementApiException(
    val status: Int,
    message: String,
    val existingImportId: String? = null,
    val existingTransactionId: String? = null
) : Exception(message)

interface StatementApi {
    suspend fun upload(accountId: String, files: List<UploadFile>): StatementViewDto
    suspend fun view(importId: String): StatementViewDto
    suspend fun setLineSelected(importId: String, lineId: String, selected: Boolean)
    suspend fun markLineNew(importId: String, lineId: String)
    suspend fun setFindingSelected(importId: String, transactionId: String, selected: Boolean)
    suspend fun commit(importId: String): CommitResultDto
    suspend fun discard(importId: String)
}

private const val UPLOAD_TIMEOUT_MS = 150_000L
private const val UNAUTHORIZED = 401

class StatementApiImpl(
    private val baseUrl: String,
    private val accessToken: suspend () -> String?
) : StatementApi {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val client = HttpClient(OkHttp) {
        install(HttpTimeout) {
            requestTimeoutMillis = UPLOAD_TIMEOUT_MS
            socketTimeoutMillis = UPLOAD_TIMEOUT_MS
        }
    }

    internal suspend fun send(method: HttpMethod, path: String, body: JsonObject? = null): String {
        val token = accessToken() ?: throw StatementApiException(UNAUTHORIZED, "Sesi habis, login ulang")
        val response = client.request("$baseUrl$path") {
            this.method = method
            header(HttpHeaders.Authorization, "Bearer $token")
            if (body != null) setBody(TextContent(body.toString(), ContentType.Application.Json))
        }
        val text = response.bodyAsText()
        if (!response.status.isSuccess()) {
            val error = runCatching { json.decodeFromString<ErrorDto>(text) }.getOrNull()
            throw StatementApiException(response.status.value, error?.error ?: "HTTP ${response.status.value}", error?.import_id, error?.transaction_id)
        }
        return text
    }

    override suspend fun upload(accountId: String, files: List<UploadFile>): StatementViewDto {
        val body = buildJsonObject {
            put("account_id", accountId)
            putJsonArray("files") {
                files.forEach { file ->
                    addJsonObject {
                        put("name", file.name)
                        put("content_base64", Base64.encode(file.bytes))
                    }
                }
            }
        }
        return json.decodeFromString(send(HttpMethod.Post, "/api/statements", body))
    }

    override suspend fun view(importId: String): StatementViewDto =
        json.decodeFromString(send(HttpMethod.Get, "/api/statements/$importId"))

    override suspend fun setLineSelected(importId: String, lineId: String, selected: Boolean) {
        send(HttpMethod.Patch, "/api/statements/$importId/lines/$lineId", buildJsonObject { put("selected", selected) })
    }

    override suspend fun markLineNew(importId: String, lineId: String) {
        send(
            HttpMethod.Patch,
            "/api/statements/$importId/lines/$lineId",
            buildJsonObject {
                put("decision", "new")
                put("selected", true)
            }
        )
    }

    override suspend fun setFindingSelected(importId: String, transactionId: String, selected: Boolean) {
        send(
            HttpMethod.Patch,
            "/api/statements/$importId/findings/$transactionId",
            JsonObject(mapOf("selected" to JsonPrimitive(selected)))
        )
    }

    override suspend fun commit(importId: String): CommitResultDto =
        json.decodeFromString<DataEnvelope<CommitResultDto>>(
            send(HttpMethod.Post, "/api/statements/$importId/commit", JsonObject(emptyMap()))
        ).data

    override suspend fun discard(importId: String) {
        send(HttpMethod.Post, "/api/statements/$importId/discard", JsonObject(emptyMap()))
    }
}
