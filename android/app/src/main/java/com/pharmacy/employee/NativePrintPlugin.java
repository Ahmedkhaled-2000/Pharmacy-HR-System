package com.pharmacy.employee;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativePrint")
public class NativePrintPlugin extends Plugin {

    private WebView mWebView; // Hold reference to prevent garbage collection during print spooling

    @PluginMethod
    public void printHtml(final PluginCall call) {
        final String html = call.getString("html", "");
        final String title = call.getString("title", "طباعة المستند");

        if (html == null || html.trim().isEmpty()) {
            call.reject("HTML content cannot be empty");
            return;
        }

        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                try {
                    Context context = getContext();
                    mWebView = new WebView(context);
                    mWebView.getSettings().setJavaScriptEnabled(true);

                    mWebView.setWebViewClient(new WebViewClient() {
                        @Override
                        public void onPageFinished(WebView view, String url) {
                            super.onPageFinished(view, url);
                            try {
                                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                                if (printManager == null) {
                                    call.reject("PrintManager service is unavailable on this device");
                                    return;
                                }

                                String jobName = title + " (" + System.currentTimeMillis() + ")";
                                PrintDocumentAdapter printAdapter = mWebView.createPrintDocumentAdapter(jobName);

                                PrintAttributes.Builder builder = new PrintAttributes.Builder();
                                builder.setMediaSize(PrintAttributes.MediaSize.ISO_A4);
                                builder.setColorMode(PrintAttributes.COLOR_MODE_COLOR);
                                builder.setMinMargins(PrintAttributes.Margins.NO_MARGINS);

                                printManager.print(jobName, printAdapter, builder.build());
                                call.resolve();
                            } catch (Exception e) {
                                call.reject("Failed to initiate Android print spooler: " + e.getMessage(), e);
                            }
                        }
                    });

                    mWebView.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
                } catch (Exception ex) {
                    call.reject("Error setting up WebView for printing: " + ex.getMessage(), ex);
                }
            }
        });
    }
}
