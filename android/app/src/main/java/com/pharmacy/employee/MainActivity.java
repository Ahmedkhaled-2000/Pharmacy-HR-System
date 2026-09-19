package com.pharmacy.employee;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.aparajita.capacitor.biometricauth.BiometricAuthNative;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdatePlugin.class);
        registerPlugin(NativePrintPlugin.class);
        registerPlugin(NativeNotificationPlugin.class);
        registerPlugin(BiometricAuthNative.class);
        registerPlugin(DynamicIconPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
