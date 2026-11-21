package app.floatphone.shell
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.util.Base64
import java.net.URL
import android.os.Handler
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
class MusicMediaService : Service() {
 companion object {
  const val ACTION_UPDATE="app.floatphone.shell.music.UPDATE"
  const val ACTION_STOP="app.floatphone.shell.music.STOP"
  const val ACTION_CONTROL="app.floatphone.shell.music.CONTROL"
  private const val CHANNEL_ID="float_music_playback"
  private const val NOTIFICATION_ID=7301
 }
 private lateinit var session:MediaSessionCompat
 private var title="未知歌曲"; private var artist=""; private var album="Float"; private var artwork=""
 private var duration=0L; private var position=0L; private var playing=false; private var liked=false
 private var cover: Bitmap? = null
 override fun onCreate() {
  super.onCreate(); createChannel()
  session=MediaSessionCompat(this,"FloatMusic").apply {
   setCallback(object:MediaSessionCompat.Callback() {
    override fun onPlay()=dispatch("play")
    override fun onPause()=dispatch("pause")
    override fun onSkipToNext()=dispatch("next")
    override fun onSkipToPrevious()=dispatch("previous")
    override fun onSeekTo(pos:Long) { sendBroadcast(Intent(ACTION_CONTROL).setPackage(packageName).putExtra("control","seek").putExtra("position",pos)) }
   })
   isActive=true
  }
 }
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  if(intent?.action==ACTION_STOP){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY}
  if(intent?.action==ACTION_UPDATE){
   title=intent.getStringExtra("title").orEmpty().ifBlank{"未知歌曲"}
   artist=intent.getStringExtra("artist").orEmpty(); album=intent.getStringExtra("album").orEmpty()
   artwork=intent.getStringExtra("artwork").orEmpty(); cover=null; loadArtwork(); duration=intent.getLongExtra("duration",0L).coerceAtLeast(0L)
   position=intent.getLongExtra("position",0L).coerceAtLeast(0L); playing=intent.getBooleanExtra("playing",false); liked=intent.getBooleanExtra("liked",false)
   updateSessionAndNotification()
  }
  return START_STICKY
 }
 private fun loadArtwork() {
  if (artwork.startsWith("data:image/")) runCatching {
   val bytes=Base64.decode(artwork.substringAfter(','),Base64.DEFAULT)
   cover=BitmapFactory.decodeByteArray(bytes,0,bytes.size)
  } else if (artwork.startsWith("https://")) {
   Thread {
    val bitmap=runCatching { URL(artwork).openStream().use { BitmapFactory.decodeStream(it) } }.getOrNull()
    if(bitmap!=null){cover=bitmap;Handler(mainLooper).post { if(::session.isInitialized && session.isActive) updateSessionAndNotification() }}
   }.start()
  }
 }
 private fun dispatch(control:String){sendBroadcast(Intent(ACTION_CONTROL).setPackage(packageName).putExtra("control",control))}
 private fun updateSessionAndNotification(){
  val metadata=MediaMetadataCompat.Builder().putString(MediaMetadataCompat.METADATA_KEY_TITLE,title)
   .putString(MediaMetadataCompat.METADATA_KEY_ARTIST,artist).putString(MediaMetadataCompat.METADATA_KEY_ALBUM,album)
   .putLong(MediaMetadataCompat.METADATA_KEY_DURATION,duration)
  cover?.let { metadata.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, it) }
  session.setMetadata(metadata.build())
  val actions=PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO
  session.setPlaybackState(PlaybackStateCompat.Builder().setActions(actions).setState(if(playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,position,if(playing)1f else 0f).build())
  val notification=NotificationCompat.Builder(this,CHANNEL_ID).setSmallIcon(android.R.drawable.ic_media_play)
   .setContentTitle(title).setContentText(artist).setSubText("Float").setLargeIcon(cover).setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
   .setOnlyAlertOnce(true).setOngoing(playing)
   .addAction(android.R.drawable.ic_media_previous,"上一首",actionIntent("previous",1))
   .addAction(if(playing)android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,if(playing)"暂停" else "播放",actionIntent(if(playing)"pause" else "play",2))
   .addAction(android.R.drawable.ic_media_next,"下一首",actionIntent("next",3))
   .addAction(if(liked)android.R.drawable.btn_star_big_on else android.R.drawable.btn_star_big_off,"收藏",actionIntent("like",4))
   .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0,1,2)).build()
  startForeground(NOTIFICATION_ID,notification)
 }
 private fun actionIntent(control:String,request:Int):PendingIntent {
  val intent=Intent(this,MusicActionReceiver::class.java).setAction(ACTION_CONTROL).putExtra("control",control)
  return PendingIntent.getBroadcast(this,request,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 }
 private fun createChannel(){if(Build.VERSION.SDK_INT>=26){val channel=NotificationChannel(CHANNEL_ID,"音乐播放",NotificationManager.IMPORTANCE_LOW);getSystemService(NotificationManager::class.java).createNotificationChannel(channel)}}
 override fun onDestroy(){session.isActive=false;session.release();super.onDestroy()}
 override fun onBind(intent:Intent?):IBinder?=null
}
