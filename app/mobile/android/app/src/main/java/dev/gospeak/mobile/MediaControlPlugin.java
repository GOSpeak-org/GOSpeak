package dev.gospeak.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaControl")
public class MediaControlPlugin extends Plugin {

    private static final String CHANNEL_ID = "gospeak_voice";
    private static final int NOTIFICATION_ID = 1001;

    @PluginMethod
    public void setMetadata(PluginCall call) {
        String title = call.getString("title");
        if (title == null) {
            title = "GOSpeak";
        }
        String subtitle = call.getString("subtitle");
        if (subtitle == null) {
            subtitle = "";
        }
        ensureChannel();
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        notificationManager().notify(NOTIFICATION_ID, notification);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        notificationManager().cancel(NOTIFICATION_ID);
        call.resolve();
    }

    @PluginMethod
    public void emitAction(PluginCall call) {
        String action = call.getString("action");
        if (action == null) {
            action = "";
        }
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("action", data);
        call.resolve();
    }

    private NotificationManager notificationManager() {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = notificationManager();
        if (manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        manager.createNotificationChannel(
            new NotificationChannel(CHANNEL_ID, "语音通话", NotificationManager.IMPORTANCE_LOW)
        );
    }
}
