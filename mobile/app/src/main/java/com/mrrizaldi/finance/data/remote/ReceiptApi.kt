package com.mrrizaldi.finance.data.remote

import io.ktor.http.HttpMethod
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlin.io.encoding.Base64

@Serializable
data class ReceiptDto(
    val id: String,
    val transaction_id: String? = null,
    val status: String,
    val merchant: String? = null,
    val purchased_at: String? = null,
    val printed_total: Double? = null
)

@Serializable
data class ReceiptLineDto(
    val kind: String,
    val name: String,
    val qty: Double = 1.0,
    val amount: Double,
    val category_id: String? = null
)

@Serializable
data class ReceiptCandidateDto(
    val id: String,
    val score: Double,
    val amount: Double,
    val transaction_date: String,
    val description: String? = null,
    val merchant: String? = null,
    val account_name: String? = null,
    val category_id: String? = null,
    val category_name: String? = null,
    val source: String? = null
)

@Serializable
data class ReceiptDraftDto(
    val receipt: ReceiptDto,
    val lines: List<ReceiptLineDto>,
    val totalOk: Boolean = false,
    val candidates: List<ReceiptCandidateDto> = emptyList(),
    val extractionError: String? = null
)

@Serializable
data class ReceiptFileDto(val url: String, val mime: String)

@Serializable
data class ReceiptViewDto(
    val receipt: ReceiptDto,
    val lines: List<ReceiptLineDto>,
    val files: List<ReceiptFileDto> = emptyList()
)

@Serializable
data class NewReceiptTransaction(
    val account_id: String,
    val amount: Long,
    val category_id: String?,
    val merchant: String?,
    val transaction_date: String
)

@Serializable
data class SavedReceiptDto(val receipt_id: String, val transaction_id: String)

@Serializable
private data class SavedEnvelope(val data: SavedReceiptDto)

interface ReceiptApi {
    suspend fun upload(files: List<UploadFile>): ReceiptDraftDto
    suspend fun byTransaction(transactionId: String): ReceiptViewDto?
    suspend fun save(
        receiptId: String?,
        transactionId: String?,
        newTransaction: NewReceiptTransaction?,
        lines: List<ReceiptLineDto>
    ): SavedReceiptDto
    suspend fun delete(receiptId: String)
}

private const val NOT_FOUND = 404

class ReceiptApiImpl(private val send: suspend (HttpMethod, String, JsonObject?) -> String) : ReceiptApi {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = true }

    override suspend fun upload(files: List<UploadFile>): ReceiptDraftDto {
        val body = buildJsonObject {
            putJsonArray("files") {
                files.forEach { file ->
                    addJsonObject {
                        put("name", file.name)
                        put("content_base64", Base64.encode(file.bytes))
                    }
                }
            }
        }
        return json.decodeFromString(send(HttpMethod.Post, "/api/receipts", body))
    }

    override suspend fun byTransaction(transactionId: String): ReceiptViewDto? = try {
        json.decodeFromString<ReceiptViewDto>(send(HttpMethod.Get, "/api/receipts/by-transaction/$transactionId", null))
    } catch (e: StatementApiException) {
        if (e.status == NOT_FOUND) null else throw e
    }

    override suspend fun save(
        receiptId: String?,
        transactionId: String?,
        newTransaction: NewReceiptTransaction?,
        lines: List<ReceiptLineDto>
    ): SavedReceiptDto {
        val body = buildJsonObject {
            put("receipt_id", receiptId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("transaction_id", transactionId?.let { JsonPrimitive(it) } ?: JsonNull)
            put("new_transaction", newTransaction?.let { json.encodeToJsonElement(it) } ?: JsonNull)
            put("lines", json.encodeToJsonElement(lines))
        }
        return json.decodeFromString<SavedEnvelope>(send(HttpMethod.Post, "/api/receipts/save", body)).data
    }

    override suspend fun delete(receiptId: String) {
        send(HttpMethod.Delete, "/api/receipts/$receiptId", null)
    }
}
