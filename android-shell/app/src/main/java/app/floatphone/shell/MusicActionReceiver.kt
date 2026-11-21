package app.floatphone.shell
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
class MusicActionReceiver:BroadcastReceiver(){
 override fun onReceive(context:Context,intent:Intent){
  val control=intent.getStringExtra("control")?:return
  context.sendBroadcast(Intent(MusicMediaService.ACTION_CONTROL).setPackage(context.packageName).putExtra("control",control))
 }
}
