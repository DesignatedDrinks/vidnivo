package com.vidnivo.export

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.audio.SpeedProvider
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.util.UUID
import kotlin.math.abs
import kotlin.math.max

/**
 * First Android native exporter: serial trimmed video clips with constant speed,
 * mute and aspect-ratio fitted H.264/AAC MP4.
 *
 * Unlike a fake export, unsupported overlays and added audio are rejected.
 * Media3 runs asynchronously and responds via its completion listener.
 */
@OptIn(UnstableApi::class)
class VidnivoExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VidnivoExport")
    AsyncFunction("exportProject") { payload: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("VIDNIVO_CONTEXT", "Android application context is unavailable.", null)
        return@AsyncFunction
      }
      Handler(Looper.getMainLooper()).post {
        try {
          val plan = JSONObject(payload)
          val texts = plan.getJSONArray("texts")
          if (texts.length() > 0) {
            throw IllegalArgumentException("Android text-overlay export is not implemented yet. Export a video without titles.")
          }
          val clips = plan.getJSONArray("clips")
          val width = plan.getInt("width")
          val height = plan.getInt("height")
          if (width !in 1..4096 || height !in 1..4096) {
            throw IllegalArgumentException("Unsupported export resolution.")
          }
          val items = ArrayList<EditedMediaItem>()
          var cursorMs = 0.0
          for (index in 0 until clips.length()) {
            val clip = clips.getJSONObject(index)
            if (clip.getString("track") != "video") {
              throw IllegalArgumentException("Android added-audio mixing is not implemented yet. Remove added audio tracks before export.")
            }
            val startMs = clip.getDouble("startMs")
            val inMs = clip.getDouble("inMs")
            val outMs = clip.getDouble("outMs")
            val speed = clip.getDouble("speed")
            val uri = clip.getString("uri")
            val volume = clip.getDouble("volume")
            if (!uri.startsWith("file://") || !File(Uri.parse(uri).path ?: "").exists()) {
              throw IllegalArgumentException("Missing source media on this phone.")
            }
            if (speed <= 0.0 || inMs < 0 || outMs <= inMs || abs(startMs - cursorMs) > 40.0) {
              throw IllegalArgumentException("Timeline contains invalid trims, gaps or overlaps.")
            }
            val muted = clip.getBoolean("muted")
            if (!muted && abs(volume - 1.0) > 0.01) {
              throw IllegalArgumentException("Android custom volume export is not available yet. Set clip volume to 100% or mute.")
            }
            val source = MediaItem.Builder()
              .setUri(uri)
              .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                  .setStartPositionMs(inMs.toLong())
                  .setEndPositionMs(outMs.toLong())
                  .build()
              )
              .build()
            val processor = object : SpeedProvider {
              override fun getSpeed(timeUs: Long): Float = speed.toFloat()
              override fun getNextSpeedChangeTimeUs(timeUs: Long): Long = C.TIME_UNSET
            }
            val effect = Presentation.createForWidthAndHeight(
              width, height, Presentation.LAYOUT_SCALE_TO_FIT
            )
            val item = EditedMediaItem.Builder(source)
              .setRemoveAudio(muted)
              .setSpeed(processor)
              .setEffects(Effects(emptyList(), listOf(effect)))
              .build()
            items.add(item)
            cursorMs += (outMs - inMs) / speed
          }
          if (items.isEmpty() || cursorMs <= 0.0 || cursorMs > 900_000.0) {
            throw IllegalArgumentException("A 1–15 minute video sequence is required.")
          }
          val sequence = EditedMediaItemSequence.withAudioAndVideoFrom(items)
          val composition = Composition.Builder(sequence).build()
          val file = File(context.cacheDir, "vidnivo-\${UUID.randomUUID()}.mp4")
          val transformer = Transformer.Builder(context)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .addListener(object : Transformer.Listener {
              override fun onCompleted(composition: Composition, result: ExportResult) {
                promise.resolve(Uri.fromFile(file).toString())
              }
              override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
                file.delete()
                promise.reject("VIDNIVO_EXPORT", exception.message ?: "Android MP4 export failed.", exception)
              }
            }).build()
          transformer.start(composition, file.absolutePath)
        } catch (e: Exception) {
          promise.reject("VIDNIVO_EXPORT", e.message ?: "Unable to start Android export.", e)
        }
      }
    }
  }
}
