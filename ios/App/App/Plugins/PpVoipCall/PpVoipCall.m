#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PpVoipCall, "PpVoipCall",
  CAP_PLUGIN_METHOD(getVoipPushToken, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(refreshVoipPushToken, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(reportCallEnded, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(completeAnswer, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(addListener, CAPPluginReturnCallback);
  CAP_PLUGIN_METHOD(removeAllListeners, CAPPluginReturnPromise);
)
