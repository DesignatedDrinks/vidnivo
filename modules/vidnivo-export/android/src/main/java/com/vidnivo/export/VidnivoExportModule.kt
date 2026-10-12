package com.vidnivo.export

import android.net.Uri
import android.graphics.Color
import android.graphics.Bitmap
import androidx.media3.effect.BitmapOverlay
import android.text.Spannable
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.audio.SpeedProvider
import androidx.media3.effect.Presentation
import androidx.media3.effect.TextOverlay
import androidx.media3.common.OverlaySettings
import androidx.media3.effect.StaticOverlaySettings
import androidx.media3.effect.TextureOverlay
import androidx.media3.effect.OverlayEffect
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
            if (clip.getString("track") != "video") continue
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
            val isImage = clip.optString("kind", "video") == "image"
            val muted = clip.getBoolean("muted") || isImage
            if (!muted && abs(volume - 1.0) > 0.01) {
              throw IllegalArgumentException("Android custom volume export is not available yet. Set clip volume to 100% or mute.")
            }
            // Static images produce actual 30fps video frames with an explicit
            // output duration. Source in/out and speed determine display time;
            // unlike encoded video, photo inputs do not have a time-based stream.
            val displayMs = ((outMs - inMs) / speed).toLong().coerceAtLeast(250)
            val sourceBuilder = MediaItem.Builder().setUri(uri)
            if (isImage) {
              sourceBuilder.setImageDurationMs(displayMs)
            } else {
              sourceBuilder.setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                  .setStartPositionMs(inMs.toLong())
                  .setEndPositionMs(outMs.toLong())
                  .build()
              )
            }
            val source = sourceBuilder.build()
            val processor = object : SpeedProvider {
              override fun getSpeed(timeUs: Long): Float = speed.toFloat()
              override fun getNextSpeedChangeTimeUs(timeUs: Long): Long = C.TIME_UNSET
            }
            val effect = Presentation.createForWidthAndHeight(
              width, height, Presentation.LAYOUT_SCALE_TO_FIT
            )
            val itemBuilder = EditedMediaItem.Builder(source)
              .setRemoveAudio(muted)
              .setEffects(Effects(emptyList(), listOf(effect)))
            if (isImage) {
              itemBuilder.setFrameRate(30)
            } else {
              itemBuilder.setSpeed(processor)
            }
            val item = itemBuilder.build()
            items.add(item)
            cursorMs += (outMs - inMs) / speed
          }
          if (items.isEmpty() || cursorMs <= 0.0 || cursorMs > 900_000.0) {
            throw IllegalArgumentException("A visual sequence up to 15 minutes is required.")
          }
          val sequence = EditedMediaItemSequence.withAudioAndVideoFrom(items)
          val soundtrackSequences = ArrayList<EditedMediaItemSequence>()
          for (index in 0 until clips.length()) {
            val clip=clips.getJSONObject(index)
            if (clip.getString("track") != "audio" || clip.getBoolean("muted")) continue
            val startMs=clip.getDouble("startMs")
            val inMs=clip.getDouble("inMs")
            val outMs=clip.getDouble("outMs")
            val speed=clip.getDouble("speed")
            val volume=clip.getDouble("volume")
            if (speed<=0.0 || inMs<0 || outMs<=inMs || startMs<0.0)
              throw IllegalArgumentException("Imported soundtrack timing is invalid.")
            if (abs(volume-1.0)>0.01)
              throw IllegalArgumentException("Android audio mixing requires soundtrack volume 100% or mute.")
            if (startMs>=cursorMs) continue
            val sourceUri=clip.getString("uri")
            if (!sourceUri.startsWith("file://") ||
                !File(Uri.parse(sourceUri).path ?: "").exists())
              throw IllegalArgumentException("Imported audio file is missing on this phone.")
            val trimmedOutMs=minOf(outMs,inMs+(cursorMs-startMs)*speed)
            if (trimmedOutMs<=inMs) continue
            val soundtrackItem=MediaItem.Builder().setUri(sourceUri)
              .setClippingConfiguration(MediaItem.ClippingConfiguration.Builder()
                .setStartPositionMs(inMs.toLong())
                .setEndPositionMs(trimmedOutMs.toLong())
                .build()).build()
            val provider=object : SpeedProvider {
              override fun getSpeed(timeUs: Long)=speed.toFloat()
              override fun getNextSpeedChangeTimeUs(timeUs: Long)=C.TIME_UNSET
            }
            val audioItem=EditedMediaItem.Builder(soundtrackItem).setSpeed(provider).build()
            val builder=EditedMediaItemSequence.Builder(setOf(C.TRACK_TYPE_AUDIO))
            if(startMs>0)builder.addGap((startMs*1000.0).toLong())
            builder.addItem(audioItem)
            soundtrackSequences.add(builder.build())
          }

          val overlays=ArrayList<TextureOverlay>()
          val look=plan.optJSONObject("look")
          val lookName=look?.optString("preset","none") ?: "none"
          val lookStrength=look?.optDouble("intensity",100.0) ?: 100.0
          val lookColors=mapOf(
            "warm" to Pair(0xFFBA74,.16), "cool" to Pair(0x4C9CE5,.16),
            "cinema" to Pair(0x375E66,.20), "sunset" to Pair(0xE97D42,.22),
            "vintage" to Pair(0xC3AD77,.21), "rose" to Pair(0xDB789C,.19),
            "night" to Pair(0x364D7B,.22))
          val tint=lookColors[lookName]
          if(tint!=null && lookStrength>0.0) {
            val alpha=(tint.second*(lookStrength/100.0).coerceIn(0.0,1.0)*255)
              .toInt().coerceIn(0,255)
            if(alpha>0) {
              val bitmap=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888)
              bitmap.eraseColor(Color.argb(alpha,
                (tint.first shr 16) and 255,(tint.first shr 8) and 255,tint.first and 255))
              overlays.add(BitmapOverlay.createStaticBitmapOverlay(bitmap))
            }
          }
          for (index in 0 until texts.length()) {
            val label=texts.getJSONObject(index)
            val fromMs=label.getDouble("startMs")
            val toMs=label.getDouble("endMs")
            val phrase=label.optString("text").trim()
            if (phrase.isEmpty() || toMs <= fromMs) continue
            val styled=SpannableString(phrase)
            val captionColor=try { Color.parseColor(label.optString("color","#FFFFFF")) }
              catch (e: IllegalArgumentException) { Color.WHITE }
            styled.setSpan(ForegroundColorSpan(captionColor),0,styled.length,
              Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            val positionX=label.optDouble("x",0.5).toFloat().coerceIn(0f,1f)
            val positionY=label.optDouble("y",0.75).toFloat().coerceIn(0f,1f)
            val fontSize=label.optDouble("fontSize",32.0).toFloat().coerceIn(14f,96f)
            // Overlay base glyph height is 100 pixels. Scale to match the phone preview.
            val scale=((max(width,height).toFloat()/355f)*fontSize/100f)
              .coerceIn(.2f,4f)
            val overlaySettings=StaticOverlaySettings.Builder()
              .setBackgroundFrameAnchor(2f*positionX-1f,1f-2f*positionY)
              .setOverlayFrameAnchor(0f,0f)
              .setScale(scale,scale)
              .build()
            overlays.add(object : TextOverlay() {
              override fun getText(presentationTimeUs: Long): SpannableString {
                val ms=presentationTimeUs/1000.0
                return if (ms>=fromMs && ms<toMs) styled else SpannableString("")
              }
              override fun getOverlaySettings(presentationTimeUs: Long): OverlaySettings {
                return overlaySettings
              }
            })
          }
          val audioAndVideo=ArrayList<EditedMediaItemSequence>()
          audioAndVideo.add(sequence)
          audioAndVideo.addAll(soundtrackSequences)
          val compositionBuilder=Composition.Builder(audioAndVideo)
          if (overlays.isNotEmpty()) {
            compositionBuilder.setEffects(Effects(emptyList(),listOf(OverlayEffect(overlays))))
          }
          val composition=compositionBuilder.build()
          val file = File(context.cacheDir, "vidnivo-${UUID.randomUUID()}.mp4")
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
