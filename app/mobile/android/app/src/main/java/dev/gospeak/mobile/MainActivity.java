package dev.gospeak.mobile;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

import java.lang.reflect.Field;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        LocalProxyServer.start(this);
        registerPlugin(AudioSessionPlugin.class);
        registerPlugin(MediaControlPlugin.class);
        registerPlugin(ServerConfigPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Release builds have no server.url in capacitor.config.json: the WebView must
     * load from the port the proxy actually bound. Dev builds keep their explicit
     * Vite URL and are left alone.
     */
    @Override
    protected void load() {
        int port = LocalProxyServer.getPort();
        if (config != null && port > 0 && !LocalProxyServer.hasConfiguredServerUrl(config.getServerUrl())) {
            try {
                Field serverUrl = CapConfig.class.getDeclaredField("serverUrl");
                serverUrl.setAccessible(true);
                serverUrl.set(config, "http://localhost:" + port + "/");
            } catch (ReflectiveOperationException error) {
                Log.e("GOSpeak", "failed to inject loopback URL", error);
            }
        }
        super.load();
    }
}
